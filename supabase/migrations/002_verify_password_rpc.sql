-- RPC para verificar senha (bcrypt) sem expor hash ao client
CREATE OR REPLACE FUNCTION verify_password(p_email TEXT, p_password TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT password_hash INTO stored_hash
    FROM dashboard_users
    WHERE email = lower(trim(p_email)) AND is_active = true;

    IF stored_hash IS NULL THEN
        RETURN false;
    END IF;

    RETURN stored_hash = crypt(p_password, stored_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permitir acesso anônimo ao RPC (login)
GRANT EXECUTE ON FUNCTION verify_password TO anon;
GRANT EXECUTE ON FUNCTION verify_password TO authenticated;
