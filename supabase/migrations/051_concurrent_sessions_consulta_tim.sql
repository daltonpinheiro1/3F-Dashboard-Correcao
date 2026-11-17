-- ============================================================
-- 051 — Sessões concorrentes (mesmo usuário, vários logins)
-- Projeto: Dashboard Correção (ayhrwxsxqddpeukydblz)
--
-- Uso: conta compartilhada só com aba Consulta TIM (ex.: BackOffice testes).
-- Contas sem a flag continuam com 1 sessão (login novo derruba o anterior).
-- Admin nunca recebe a flag (blindagem).
-- ============================================================

ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS allow_concurrent_sessions boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dashboard_users.allow_concurrent_sessions IS
  'Se true, vários logins com o mesmo e-mail convivem (tabela dashboard_sessions). Só para contas compartilhadas restritas (ex.: Consulta TIM).';

CREATE TABLE IF NOT EXISTS public.dashboard_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.dashboard_users(id) ON DELETE CASCADE,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_sessions_nonce_len CHECK (length(nonce) >= 16)
);

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_sessions_nonce_uidx
  ON public.dashboard_sessions (nonce);

CREATE INDEX IF NOT EXISTS dashboard_sessions_user_exp_idx
  ON public.dashboard_sessions (user_id, expires_at DESC);

ALTER TABLE public.dashboard_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.dashboard_sessions TO service_role;

-- BackOffice testes (já cadastrado): habilita multi-login; não toca em admin.
UPDATE public.dashboard_users du
SET allow_concurrent_sessions = true
WHERE du.is_active
  AND lower(COALESCE(du.role, '')) <> 'admin'
  AND (
    lower(trim(du.full_name)) = 'backoffice testes'
    OR lower(du.full_name) LIKE '%backoffice%teste%'
    OR lower(du.email) LIKE '%backoffice%teste%'
  );

-- ---------------------------------------------------------------------------
-- verify_dashboard_session
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_dashboard_session(p_email text, p_nonce text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u RECORD;
    v_abas jsonb;
    slug text;
    nonce_norm text;
    sess_ok boolean := false;
BEGIN
    IF p_email IS NULL OR p_nonce IS NULL
       OR length(trim(p_email)) = 0 OR length(trim(p_nonce)) < 16 THEN
        RETURN json_build_object('valid', false, 'error', 'invalid_params');
    END IF;

    nonce_norm := trim(p_nonce);

    SELECT du.id, du.email, du.full_name, du.role, du.is_active,
           du.session_nonce, du.session_expires_at, du.perfil_id,
           du.allow_concurrent_sessions,
           p.slug AS perfil_slug, p.abas AS perfil_abas
    INTO u
    FROM public.dashboard_users du
    LEFT JOIN public.dashboard_perfis p ON p.id = du.perfil_id
    WHERE du.email = lower(trim(p_email))
      AND du.is_active = true
    LIMIT 1;

    IF u.id IS NULL THEN
        RETURN json_build_object('valid', false, 'error', 'not_found');
    END IF;

    IF COALESCE(u.allow_concurrent_sessions, false) THEN
        UPDATE public.dashboard_sessions
        SET last_seen_at = now()
        WHERE user_id = u.id
          AND nonce = nonce_norm
          AND expires_at > now();
        sess_ok := FOUND;
        -- Compat: nonce legado ainda na coluna da conta
        IF NOT sess_ok
           AND u.session_nonce IS NOT NULL
           AND u.session_nonce = nonce_norm
           AND u.session_expires_at IS NOT NULL
           AND u.session_expires_at > now() THEN
            sess_ok := true;
        END IF;
        IF NOT sess_ok THEN
            RETURN json_build_object('valid', false, 'error', 'nonce_mismatch');
        END IF;
    ELSE
        IF u.session_nonce IS NULL OR u.session_nonce <> nonce_norm THEN
            RETURN json_build_object('valid', false, 'error', 'nonce_mismatch');
        END IF;
        IF u.session_expires_at IS NULL OR u.session_expires_at < now() THEN
            RETURN json_build_object('valid', false, 'error', 'expired');
        END IF;
    END IF;

    slug := COALESCE(u.perfil_slug, u.role, 'viewer');
    v_abas := COALESCE(u.perfil_abas, '[]'::jsonb);

    RETURN json_build_object(
        'valid', true,
        'id', u.id,
        'email', u.email,
        'full_name', u.full_name,
        'role', u.role,
        'perfil_id', u.perfil_id,
        'perfil_slug', slug,
        'abas', v_abas
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_dashboard_session(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_dashboard_session(text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- login_user (assinatura da 041)
-- ---------------------------------------------------------------------------
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
    max_sessions constant int := 25;
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
              ORDER BY created_at ASC
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

-- ---------------------------------------------------------------------------
-- logout_dashboard_session
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logout_dashboard_session(p_email text, p_nonce text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid;
  nonce_norm text;
BEGIN
  IF p_email IS NULL OR p_nonce IS NULL
     OR length(trim(p_email)) = 0 OR length(trim(p_nonce)) < 16 THEN
    RETURN json_build_object('ok', true);
  END IF;

  nonce_norm := trim(p_nonce);

  SELECT id INTO uid
  FROM public.dashboard_users
  WHERE email = lower(trim(p_email))
  LIMIT 1;

  IF uid IS NOT NULL THEN
    DELETE FROM public.dashboard_sessions
    WHERE user_id = uid AND nonce = nonce_norm;

    UPDATE public.dashboard_users
    SET session_nonce = NULL,
        session_expires_at = NULL
    WHERE id = uid
      AND session_nonce IS NOT NULL
      AND session_nonce = nonce_norm;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.logout_dashboard_session(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.logout_dashboard_session(text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Troca de senha pelo admin: derruba todas as sessões (incl. concorrentes)
-- ---------------------------------------------------------------------------
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

    IF nova_senha OR p_is_active IS FALSE THEN
        DELETE FROM public.dashboard_sessions WHERE user_id = p_user_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_dashboard_user_by_session(text, text, uuid, text, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_dashboard_user_by_session(text, text, uuid, text, uuid, boolean, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

-- Conferência pós-apply (deve listar o BackOffice testes com true):
-- SELECT email, full_name, role, allow_concurrent_sessions
-- FROM public.dashboard_users
-- WHERE allow_concurrent_sessions;
