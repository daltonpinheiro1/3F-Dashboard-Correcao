-- FIX LOGIN v2: pgcrypto + chamadas qualificadas (extensions.crypt / digest)
-- Rode no SQL Editor do projeto 3F_Dash_Correcoes

-- 1) Habilitar pgcrypto no schema extensions (padrão Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2) Se a extensão já existia em public, as funções ficam em public — o bloco abaixo cobre os dois casos.
CREATE OR REPLACE FUNCTION public.login_user(p_email TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    user_record RECORD;
    exp_at timestamptz;
    ok boolean;
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

    -- bcrypt via pgcrypto (schema extensions no Supabase)
    ok := (user_record.password_hash = extensions.crypt(p_password::text, user_record.password_hash::text));

    IF NOT ok THEN
        RETURN json_build_object('success', false, 'error', 'invalid_password');
    END IF;

    UPDATE public.dashboard_users
    SET last_login_at = now()
    WHERE id = user_record.id;

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

-- Sanity checks (descomente e rode um a um se ainda falhar):
-- SELECT extname, nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE extname = 'pgcrypto';
-- SELECT extensions.crypt('x', extensions.gen_salt('bf'));
-- SELECT public.login_user('admin@3fcontact.com', 'admin3f2026');
