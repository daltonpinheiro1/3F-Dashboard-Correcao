-- 011: create_dashboard_user exige admin (email+senha)
-- Fecha P0: RPC antiga criava usuário sem auth.

CREATE OR REPLACE FUNCTION public.create_dashboard_user(
    p_email text,
    p_name text,
    p_password text,
    p_role text,
    p_admin_email text DEFAULT NULL,
    p_admin_password text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    new_id uuid;
BEGIN
    IF p_admin_email IS NULL OR p_admin_password IS NULL
       OR length(trim(p_admin_email)) = 0 OR length(p_admin_password) = 0 THEN
        RAISE EXCEPTION 'admin_auth_required';
    END IF;
    PERFORM public._assert_dashboard_admin(p_admin_email, p_admin_password);

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

REVOKE ALL ON FUNCTION public.create_dashboard_user(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dashboard_user(text, text, text, text, text, text) TO anon, authenticated;

-- Remove overload antigo sem admin (4 args), se existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_dashboard_user'
      AND pg_get_function_identity_arguments(p.oid) = 'text, text, text, text'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.create_dashboard_user(text, text, text, text) FROM anon, authenticated, PUBLIC';
    EXECUTE 'DROP FUNCTION public.create_dashboard_user(text, text, text, text)';
  END IF;
END $$;
