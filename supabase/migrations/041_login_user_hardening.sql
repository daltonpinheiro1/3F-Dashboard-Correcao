-- Projeto alvo: Dashboard Correção (ayhrwxsxqddpeukydblz). Aplicar após a 040; o BFF já envia p_ip e faz fallback sem ele.
-- ============================================================
-- 041 — login_user / update_dashboard_user_by_session
--   1) Conta inativa só é revelada depois da senha correta (sem enumeração)
--   2) E-mail inexistente também executa crypt (tempo similar ao caminho real)
--   3) Lockout por e-mail+IP (8 falhas / 15 min); por e-mail só com teto alto (50),
--      para terceiros não travarem o admin a partir de outros IPs
--   4) Troca de senha pelo admin derruba a sessão do usuário alvo
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dashboard_login_attempts_ip (
  email text NOT NULL,
  ip text NOT NULL,
  fail_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, ip)
);

CREATE INDEX IF NOT EXISTS dashboard_login_attempts_ip_updated_idx
  ON public.dashboard_login_attempts_ip (updated_at);

ALTER TABLE public.dashboard_login_attempts_ip ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_login_attempts_ip FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.dashboard_login_attempts_ip TO service_role;

-- Overload (text, text) + (text, text, text DEFAULT NULL) deixaria o PostgREST ambíguo (PGRST203).
DROP FUNCTION IF EXISTS public.login_user(text, text);

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
    slug text;
    v_abas jsonb;
    senha_ok boolean;
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
           du.perfil_id, p.slug AS perfil_slug, p.abas AS perfil_abas
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

    UPDATE public.dashboard_users
    SET last_login_at = now(),
        session_nonce = nonce,
        session_expires_at = exp_at
    WHERE id = user_record.id;

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

CREATE OR REPLACE FUNCTION public.update_dashboard_user_by_session(
    p_actor_email text,
    p_nonce text,
    p_user_id uuid,
    p_full_name text DEFAULT NULL,
    p_perfil_id uuid DEFAULT NULL,
    p_is_active boolean DEFAULT NULL,
    p_password text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v json;
    v_slug text;
    r text;
    n_admin int;
    tgt RECORD;
    nova_senha boolean;
BEGIN
    v := public.verify_dashboard_session(p_actor_email, p_nonce);
    IF NOT public._dashboard_is_admin_session(v) THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;

    SELECT u.id, u.role, u.is_active, p.slug AS perfil_slug
    INTO tgt
    FROM public.dashboard_users u
    LEFT JOIN public.dashboard_perfis p ON p.id = u.perfil_id
    WHERE u.id = p_user_id;
    IF tgt.id IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;

    IF p_perfil_id IS NOT NULL THEN
        SELECT dp.slug INTO v_slug FROM public.dashboard_perfis dp WHERE dp.id = p_perfil_id;
        IF v_slug IS NULL THEN RAISE EXCEPTION 'invalid_perfil'; END IF;
        r := CASE WHEN v_slug IN ('admin', 'supervisor', 'viewer') THEN v_slug ELSE 'viewer' END;
    END IF;

    SELECT COUNT(*) INTO n_admin
    FROM public.dashboard_users u
    LEFT JOIN public.dashboard_perfis p ON p.id = u.perfil_id
    WHERE u.is_active AND (u.role = 'admin' OR p.slug = 'admin');

    IF n_admin <= 1 AND (tgt.role = 'admin' OR tgt.perfil_slug = 'admin') THEN
        IF p_is_active IS FALSE OR (v_slug IS NOT NULL AND v_slug <> 'admin') THEN
            RAISE EXCEPTION 'last_admin';
        END IF;
    END IF;

    IF p_password IS NOT NULL AND length(trim(p_password)) > 0 THEN
        IF length(trim(p_password)) < 6 THEN RAISE EXCEPTION 'password_too_short'; END IF;
    END IF;
    nova_senha := p_password IS NOT NULL AND length(trim(p_password)) >= 6;

    UPDATE public.dashboard_users
    SET full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
        perfil_id = COALESCE(p_perfil_id, perfil_id),
        role = COALESCE(r, role),
        is_active = COALESCE(p_is_active, is_active),
        password_hash = CASE
          WHEN nova_senha THEN extensions.crypt(trim(p_password), extensions.gen_salt('bf'))
          ELSE password_hash
        END,
        session_nonce = CASE WHEN nova_senha THEN NULL ELSE session_nonce END,
        session_expires_at = CASE WHEN nova_senha THEN NULL ELSE session_expires_at END
    WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_dashboard_user_by_session(text, text, uuid, text, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_dashboard_user_by_session(text, text, uuid, text, uuid, boolean, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
