-- RPC para criar usuario (hasheia senha server-side)
CREATE OR REPLACE FUNCTION create_dashboard_user(
    p_email TEXT,
    p_name TEXT,
    p_password TEXT,
    p_role TEXT DEFAULT 'viewer'
)
RETURNS UUID AS $$
DECLARE
    new_id UUID;
BEGIN
    INSERT INTO dashboard_users (email, password_hash, full_name, role)
    VALUES (lower(trim(p_email)), crypt(p_password, gen_salt('bf')), trim(p_name), p_role)
    RETURNING id INTO new_id;
    RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_dashboard_user TO authenticated;
