-- RPC para login completo: verifica senha E retorna dados do usuario
-- Substitui a query direta na tabela (bloqueada por RLS para anon)
CREATE OR REPLACE FUNCTION login_user(p_email TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
    user_record RECORD;
BEGIN
    SELECT id, email, full_name, role, is_active, password_hash
    INTO user_record
    FROM dashboard_users
    WHERE email = lower(trim(p_email));

    IF user_record IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'not_found');
    END IF;

    IF NOT user_record.is_active THEN
        RETURN json_build_object('success', false, 'error', 'inactive');
    END IF;

    IF user_record.password_hash != crypt(p_password, user_record.password_hash) THEN
        RETURN json_build_object('success', false, 'error', 'invalid_password');
    END IF;

    -- Update last_login
    UPDATE dashboard_users SET last_login_at = now() WHERE id = user_record.id;

    RETURN json_build_object(
        'success', true,
        'id', user_record.id,
        'email', user_record.email,
        'full_name', user_record.full_name,
        'role', user_record.role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION login_user TO anon;
GRANT EXECUTE ON FUNCTION login_user TO authenticated;
