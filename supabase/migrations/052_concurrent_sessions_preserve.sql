-- ============================================================
-- 052 — Preserva sessões ativas no login concorrente
-- Projeto: Dashboard (ayhrwxsxqddpeukydblz)
--
-- Bug 051: no login com allow_concurrent_sessions, o nonce anterior
-- (só em dashboard_users.session_nonce) era sobrescrito e não ia para
-- dashboard_sessions → quem já estava logado era derrubado.
-- ============================================================

CREATE OR REPLACE FUNCTION public.login_user(p_email TEXT, p_password TEXT, p_ip TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    user_record RECORD;
    exp_at timestamptz;
    nonce text;
    email_norm text;
    ip_norm text;
    att_email RECORD;
    att_ip RECORD;
    max_fails_ip constant int := 8;
    max_fails_email constant int := 50;
    lock_minutes constant int := 15;
    max_sessions constant int := 50;
    slug text;
    v_abas jsonb;
    senha_ok boolean;
    concurrent boolean;
    n_sess int;
BEGIN
    email_norm := lower(trim(COALESCE(p_email, '')));
    ip_norm := left(COALESCE(NULLIF(trim(p_ip), ''), 'unknown'), 64);

    DELETE FROM public.dashboard_login_attempts_ip
    WHERE updated_at < now() - interval '1 day';

    SELECT fail_count, locked_until INTO att_ip
    FROM public.dashboard_login_attempts_ip
    WHERE email = email_norm AND ip = ip_norm;

    SELECT fail_count, locked_until INTO att_email
    FROM public.dashboard_login_attempts
    WHERE email = email_norm;

    IF (att_ip.locked_until IS NOT NULL AND att_ip.locked_until > now())
       OR (att_email.locked_until IS NOT NULL AND att_email.locked_until > now()) THEN
        RETURN json_build_object('success', false, 'error', 'locked');
    END IF;

    IF att_ip.locked_until IS NOT NULL AND att_ip.locked_until <= now() THEN
        DELETE FROM public.dashboard_login_attempts_ip WHERE email = email_norm AND ip = ip_norm;
    END IF;
    IF att_email.locked_until IS NOT NULL AND att_email.locked_until <= now() THEN
        DELETE FROM public.dashboard_login_attempts WHERE email = email_norm;
    END IF;

    SELECT du.id, du.email, du.full_name, du.role, du.is_active, du.password_hash,
           du.perfil_id, du.allow_concurrent_sessions,
           du.session_nonce, du.session_expires_at,
           p.slug AS perfil_slug, p.abas AS perfil_abas
    INTO user_record
    FROM public.dashboard_users du
    LEFT JOIN public.dashboard_perfis p ON p.id = du.perfil_id
    WHERE du.email = email_norm;

    senha_ok := COALESCE(
        extensions.crypt(
            COALESCE(p_password, '')::text,
            COALESCE(user_record.password_hash::text, extensions.gen_salt('bf'))
        ) = user_record.password_hash::text,
        false
    );

    IF user_record.id IS NULL OR NOT senha_ok THEN
        INSERT INTO public.dashboard_login_attempts_ip (email, ip, fail_count, locked_until, updated_at)
        VALUES (email_norm, ip_norm, 1, NULL, now())
        ON CONFLICT (email, ip) DO UPDATE
          SET fail_count = public.dashboard_login_attempts_ip.fail_count + 1,
              locked_until = CASE
                WHEN public.dashboard_login_attempts_ip.fail_count + 1 >= max_fails_ip
                  THEN now() + (lock_minutes || ' minutes')::interval
                ELSE NULL
              END,
              updated_at = now();

        INSERT INTO public.dashboard_login_attempts (email, fail_count, locked_until, updated_at)
        VALUES (email_norm, 1, NULL, now())
        ON CONFLICT (email) DO UPDATE
          SET fail_count = public.dashboard_login_attempts.fail_count + 1,
              locked_until = CASE
                WHEN public.dashboard_login_attempts.fail_count + 1 >= max_fails_email
                  THEN now() + (lock_minutes || ' minutes')::interval
                ELSE NULL
              END,
              updated_at = now();

        RETURN json_build_object(
          'success', false,
          'error', CASE WHEN user_record.id IS NULL THEN 'not_found' ELSE 'invalid_password' END
        );
    END IF;

    IF NOT user_record.is_active THEN
        RETURN json_build_object('success', false, 'error', 'inactive');
    END IF;

    DELETE FROM public.dashboard_login_attempts_ip WHERE email = email_norm AND ip = ip_norm;
    DELETE FROM public.dashboard_login_attempts WHERE email = email_norm;

    exp_at := now() + interval '12 hours';
    nonce := encode(extensions.gen_random_bytes(32), 'hex');

    concurrent := COALESCE(user_record.allow_concurrent_sessions, false)
      AND lower(COALESCE(user_record.role, '')) <> 'admin'
      AND lower(COALESCE(user_record.perfil_slug, '')) <> 'admin';

    IF concurrent THEN
        -- Preserva o nonce legado (sessão aberta antes do multi-login)
        IF user_record.session_nonce IS NOT NULL
           AND length(trim(user_record.session_nonce)) >= 16
           AND user_record.session_expires_at IS NOT NULL
           AND user_record.session_expires_at > now() THEN
            INSERT INTO public.dashboard_sessions (user_id, nonce, expires_at, last_seen_at)
            VALUES (
              user_record.id,
              trim(user_record.session_nonce),
              user_record.session_expires_at,
              now()
            )
            ON CONFLICT (nonce) DO NOTHING;
        END IF;

        DELETE FROM public.dashboard_sessions
        WHERE user_id = user_record.id AND expires_at <= now();

        SELECT COUNT(*) INTO n_sess
        FROM public.dashboard_sessions
        WHERE user_id = user_record.id;

        IF n_sess >= max_sessions THEN
            DELETE FROM public.dashboard_sessions
            WHERE id IN (
              SELECT id FROM public.dashboard_sessions
              WHERE user_id = user_record.id
              ORDER BY last_seen_at ASC NULLS FIRST, created_at ASC
              LIMIT (n_sess - max_sessions + 1)
            );
        END IF;

        INSERT INTO public.dashboard_sessions (user_id, nonce, expires_at)
        VALUES (user_record.id, nonce, exp_at);

        UPDATE public.dashboard_users
        SET last_login_at = now(),
            session_nonce = nonce,
            session_expires_at = exp_at
        WHERE id = user_record.id;
    ELSE
        DELETE FROM public.dashboard_sessions WHERE user_id = user_record.id;

        UPDATE public.dashboard_users
        SET last_login_at = now(),
            session_nonce = nonce,
            session_expires_at = exp_at
        WHERE id = user_record.id;
    END IF;

    slug := COALESCE(user_record.perfil_slug, user_record.role, 'viewer');
    v_abas := COALESCE(user_record.perfil_abas, '[]'::jsonb);

    RETURN json_build_object(
        'success', true,
        'id', user_record.id,
        'email', user_record.email,
        'full_name', user_record.full_name,
        'role', user_record.role,
        'perfil_id', user_record.perfil_id,
        'perfil_slug', slug,
        'abas', v_abas,
        'session_expires_at', exp_at,
        'session_nonce', nonce
    );
END;
$$;

REVOKE ALL ON FUNCTION public.login_user(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_user(text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
