-- ============================================================
-- 013 — Sessão server-side + harden advertências + user create
-- Projeto: ayhrwxsxqddpeukydblz (Dashboard Correção)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1) Colunas de sessão
ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS session_nonce text,
  ADD COLUMN IF NOT EXISTS session_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_dashboard_users_session
  ON public.dashboard_users (email, session_nonce)
  WHERE session_nonce IS NOT NULL;

-- 2) Login grava nonce (sessões anteriores invalidam no próximo login)
CREATE OR REPLACE FUNCTION public.login_user(p_email TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    user_record RECORD;
    exp_at timestamptz;
    nonce text;
BEGIN
    SELECT id, email, full_name, role, is_active, password_hash
    INTO user_record
    FROM public.dashboard_users
    WHERE email = lower(trim(p_email));

    IF user_record IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'not_found');
    END IF;
    IF NOT user_record.is_active THEN
        RETURN json_build_object('success', false, 'error', 'inactive');
    END IF;
    IF user_record.password_hash != extensions.crypt(p_password::text, user_record.password_hash::text) THEN
        RETURN json_build_object('success', false, 'error', 'invalid_password');
    END IF;

    exp_at := now() + interval '12 hours';
    nonce := encode(extensions.gen_random_bytes(32), 'hex');

    UPDATE public.dashboard_users
    SET last_login_at = now(),
        session_nonce = nonce,
        session_expires_at = exp_at
    WHERE id = user_record.id;

    RETURN json_build_object(
        'success', true,
        'id', user_record.id,
        'email', user_record.email,
        'full_name', user_record.full_name,
        'role', user_record.role,
        'session_expires_at', exp_at,
        'session_nonce', nonce
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.login_user(text, text) TO anon, authenticated;

-- 3) Verifica sessão (usada pelas Pages Functions e RPCs)
CREATE OR REPLACE FUNCTION public.verify_dashboard_session(p_email text, p_nonce text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u RECORD;
BEGIN
    IF p_email IS NULL OR p_nonce IS NULL
       OR length(trim(p_email)) = 0 OR length(trim(p_nonce)) < 16 THEN
        RETURN json_build_object('valid', false, 'error', 'invalid_params');
    END IF;

    SELECT id, email, full_name, role, is_active, session_nonce, session_expires_at
    INTO u
    FROM public.dashboard_users
    WHERE email = lower(trim(p_email))
      AND is_active = true
    LIMIT 1;

    IF u.id IS NULL THEN
        RETURN json_build_object('valid', false, 'error', 'not_found');
    END IF;
    IF u.session_nonce IS NULL OR u.session_nonce <> trim(p_nonce) THEN
        RETURN json_build_object('valid', false, 'error', 'nonce_mismatch');
    END IF;
    IF u.session_expires_at IS NULL OR u.session_expires_at < now() THEN
        RETURN json_build_object('valid', false, 'error', 'expired');
    END IF;

    RETURN json_build_object(
        'valid', true,
        'id', u.id,
        'email', u.email,
        'full_name', u.full_name,
        'role', u.role
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_dashboard_session(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_dashboard_session(text, text) TO anon, authenticated, service_role;

-- 4) List / toggle / create por sessão (sem reenviar senha)
CREATE OR REPLACE FUNCTION public.list_dashboard_users_by_session(p_email text, p_nonce text)
RETURNS TABLE(
    id uuid,
    email text,
    full_name text,
    role text,
    is_active boolean,
    last_login_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v json;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF (v->>'valid')::boolean IS NOT TRUE OR coalesce(v->>'role','') <> 'admin' THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    RETURN QUERY
    SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.last_login_at
    FROM public.dashboard_users u
    ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_dashboard_users_by_session(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.toggle_user_active_by_session(
    p_email text,
    p_nonce text,
    p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v json;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF (v->>'valid')::boolean IS NOT TRUE OR coalesce(v->>'role','') <> 'admin' THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    UPDATE public.dashboard_users
    SET is_active = NOT is_active
    WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_user_active_by_session(text, text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_dashboard_user_by_session(
    p_actor_email text,
    p_nonce text,
    p_email text,
    p_name text,
    p_password text,
    p_role text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v json;
    new_id uuid;
BEGIN
    v := public.verify_dashboard_session(p_actor_email, p_nonce);
    IF (v->>'valid')::boolean IS NOT TRUE OR coalesce(v->>'role','') <> 'admin' THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    IF p_role NOT IN ('admin', 'supervisor', 'viewer') THEN
        RAISE EXCEPTION 'invalid_role';
    END IF;
    IF length(trim(p_password)) < 6 THEN
        RAISE EXCEPTION 'password_too_short';
    END IF;

    INSERT INTO public.dashboard_users (email, password_hash, full_name, role)
    VALUES (
        lower(trim(p_email)),
        extensions.crypt(p_password::text, extensions.gen_salt('bf')),
        trim(p_name),
        p_role
    )
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_dashboard_user_by_session(text, text, text, text, text, text)
  TO anon, authenticated;

-- 5) Remove overload perigoso de 4 args (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_dashboard_user'
      AND pg_get_function_identity_arguments(p.oid) = 'text, text, text, text'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_dashboard_user(text, text, text, text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'DROP FUNCTION public.create_dashboard_user(text, text, text, text)';
  END IF;
END $$;

-- 6) Harden advertências: sem acesso direto anon (só service_role / Functions)
DO $$
BEGIN
  IF to_regclass('public.advertencias') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.advertencias ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone read advertencias" ON public.advertencias';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone write advertencias" ON public.advertencias';
    -- Nenhuma policy para anon/authenticated = deny
    EXECUTE 'REVOKE ALL ON TABLE public.advertencias FROM anon, authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.advertencias TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
