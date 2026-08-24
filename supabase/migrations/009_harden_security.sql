-- 009: Hardening segurança Dashboard (idempotente)
-- Projeto: 3F_Dash_Correcoes (NÃO rodar no Score Qigger)
-- - INSERT correcao_logs só service_role
-- - RPCs admin com email+senha
-- - login_user com session_expires_at + nonce (12h)
-- - REVOKE de list/toggle antigos só se existirem

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1) Políticas em correcao_logs
DROP POLICY IF EXISTS "Service role inserts logs" ON correcao_logs;
CREATE POLICY "Service role inserts logs"
    ON correcao_logs FOR INSERT
    TO service_role
    WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read logs" ON correcao_logs;
DROP POLICY IF EXISTS "Authenticated users can read logs" ON correcao_logs;
DROP POLICY IF EXISTS "Authenticated read logs" ON correcao_logs;
DROP POLICY IF EXISTS "Anon read logs temporary" ON correcao_logs;

CREATE POLICY "Authenticated read logs"
    ON correcao_logs FOR SELECT
    TO authenticated
    USING (true);

-- SPA ainda usa anon key — leitura temporária
CREATE POLICY "Anon read logs temporary"
    ON correcao_logs FOR SELECT
    TO anon
    USING (true);

-- 2) Revogar RPCs antigas perigosas SOMENTE se existirem
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'list_dashboard_users'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.list_dashboard_users() FROM anon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'toggle_user_active'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.toggle_user_active(uuid) FROM anon';
  END IF;
END $$;

-- 3) Helper: valida admin por email+senha
CREATE OR REPLACE FUNCTION public._assert_dashboard_admin(p_email text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    uid uuid;
BEGIN
    SELECT u.id INTO uid
    FROM public.dashboard_users u
    WHERE u.email = lower(trim(p_email))
      AND u.is_active = true
      AND u.role = 'admin'
      AND u.password_hash = extensions.crypt(p_password::text, u.password_hash::text);
    IF uid IS NULL THEN
        RAISE EXCEPTION 'admin_auth_failed';
    END IF;
    RETURN uid;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_dashboard_admin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._assert_dashboard_admin(text, text) TO anon, authenticated;

-- 4) List users com auth admin
CREATE OR REPLACE FUNCTION public.list_dashboard_users_secure(p_admin_email text, p_admin_password text)
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
SET search_path = public
AS $$
BEGIN
    PERFORM public._assert_dashboard_admin(p_admin_email, p_admin_password);
    RETURN QUERY
    SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.last_login_at
    FROM dashboard_users u
    ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_dashboard_users_secure(text, text) TO anon, authenticated;

-- 5) Toggle com auth admin
CREATE OR REPLACE FUNCTION public.toggle_user_active_secure(
    p_admin_email text,
    p_admin_password text,
    p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public._assert_dashboard_admin(p_admin_email, p_admin_password);
    UPDATE dashboard_users
    SET is_active = NOT is_active
    WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_user_active_secure(text, text, uuid) TO anon, authenticated;

-- 6) Login com expiração de sessão (12h)
-- digest/crypt: sempre schema-qualified (extensions.*)
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

    UPDATE public.dashboard_users SET last_login_at = now() WHERE id = user_record.id;
    exp_at := now() + interval '12 hours';
    nonce := encode(
        extensions.digest(
            (user_record.id::text || exp_at::text || user_record.email)::bytea,
            'sha256'
        ),
        'hex'
    );

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
