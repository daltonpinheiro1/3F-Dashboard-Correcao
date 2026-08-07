-- RPC para listar usuários do dashboard (bypassa RLS)
-- Necessário porque o frontend usa custom auth (não Supabase Auth),
-- portanto queries diretas vão como 'anon' e são bloqueadas pelo RLS.

CREATE OR REPLACE FUNCTION public.list_dashboard_users()
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
    RETURN QUERY
    SELECT
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.is_active,
        u.last_login_at
    FROM dashboard_users u
    ORDER BY u.created_at DESC;
END;
$$;

-- Permitir anon executar (frontend usa anon key)
GRANT EXECUTE ON FUNCTION public.list_dashboard_users() TO anon;
GRANT EXECUTE ON FUNCTION public.list_dashboard_users() TO authenticated;

-- Também criar RPC para toggle ativo (mesmo problema de RLS)
CREATE OR REPLACE FUNCTION public.toggle_user_active(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE dashboard_users
    SET is_active = NOT is_active
    WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_user_active(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.toggle_user_active(uuid) TO authenticated;
