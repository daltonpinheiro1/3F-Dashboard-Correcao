-- ============================================================
-- 036 — Desambigua coluna/variável `abas` nas RPCs de perfil/sessão
-- ============================================================

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
BEGIN
    IF p_email IS NULL OR p_nonce IS NULL
       OR length(trim(p_email)) = 0 OR length(trim(p_nonce)) < 16 THEN
        RETURN json_build_object('valid', false, 'error', 'invalid_params');
    END IF;

    SELECT du.id, du.email, du.full_name, du.role, du.is_active,
           du.session_nonce, du.session_expires_at, du.perfil_id,
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
    IF u.session_nonce IS NULL OR u.session_nonce <> trim(p_nonce) THEN
        RETURN json_build_object('valid', false, 'error', 'nonce_mismatch');
    END IF;
    IF u.session_expires_at IS NULL OR u.session_expires_at < now() THEN
        RETURN json_build_object('valid', false, 'error', 'expired');
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
    email_norm text;
    att RECORD;
    max_fails constant int := 8;
    lock_minutes constant int := 15;
    slug text;
    v_abas jsonb;
BEGIN
    email_norm := lower(trim(p_email));

    SELECT fail_count, locked_until INTO att
    FROM public.dashboard_login_attempts
    WHERE email = email_norm;

    IF att.locked_until IS NOT NULL AND att.locked_until > now() THEN
        RETURN json_build_object('success', false, 'error', 'locked');
    END IF;

    IF att.locked_until IS NOT NULL AND att.locked_until <= now() THEN
        DELETE FROM public.dashboard_login_attempts WHERE email = email_norm;
    END IF;

    SELECT du.id, du.email, du.full_name, du.role, du.is_active, du.password_hash,
           du.perfil_id, p.slug AS perfil_slug, p.abas AS perfil_abas
    INTO user_record
    FROM public.dashboard_users du
    LEFT JOIN public.dashboard_perfis p ON p.id = du.perfil_id
    WHERE du.email = email_norm;

    IF user_record IS NULL THEN
        INSERT INTO public.dashboard_login_attempts (email, fail_count, locked_until, updated_at)
        VALUES (email_norm, 1, NULL, now())
        ON CONFLICT (email) DO UPDATE
          SET fail_count = public.dashboard_login_attempts.fail_count + 1,
              locked_until = CASE
                WHEN public.dashboard_login_attempts.fail_count + 1 >= max_fails
                  THEN now() + (lock_minutes || ' minutes')::interval
                ELSE public.dashboard_login_attempts.locked_until
              END,
              updated_at = now();
        RETURN json_build_object('success', false, 'error', 'not_found');
    END IF;

    IF NOT user_record.is_active THEN
        RETURN json_build_object('success', false, 'error', 'inactive');
    END IF;

    IF user_record.password_hash != extensions.crypt(p_password::text, user_record.password_hash::text) THEN
        INSERT INTO public.dashboard_login_attempts (email, fail_count, locked_until, updated_at)
        VALUES (email_norm, 1, NULL, now())
        ON CONFLICT (email) DO UPDATE
          SET fail_count = public.dashboard_login_attempts.fail_count + 1,
              locked_until = CASE
                WHEN public.dashboard_login_attempts.fail_count + 1 >= max_fails
                  THEN now() + (lock_minutes || ' minutes')::interval
                ELSE NULL
              END,
              updated_at = now();
        RETURN json_build_object('success', false, 'error', 'invalid_password');
    END IF;

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

CREATE OR REPLACE FUNCTION public.list_dashboard_perfis_by_session(p_email text, p_nonce text)
RETURNS TABLE(
    id uuid,
    slug text,
    nome text,
    abas jsonb,
    is_system boolean,
    usuarios integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE v json;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF NOT public._dashboard_is_admin_session(v) THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    RETURN QUERY
    SELECT dp.id, dp.slug, dp.nome, dp.abas, dp.is_system,
           (SELECT COUNT(*)::int FROM public.dashboard_users u WHERE u.perfil_id = dp.id)
    FROM public.dashboard_perfis dp
    ORDER BY dp.is_system DESC, dp.nome;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_dashboard_perfis_by_session(text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_dashboard_perfil_by_session(
    p_email text,
    p_nonce text,
    p_id uuid,
    p_nome text,
    p_abas jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v json;
    pid uuid;
    rec RECORD;
    slug_new text;
    v_abas jsonb;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF NOT public._dashboard_is_admin_session(v) THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    IF p_nome IS NULL OR length(trim(p_nome)) < 2 THEN
        RAISE EXCEPTION 'invalid_nome';
    END IF;
    v_abas := COALESCE(p_abas, '[]'::jsonb);
    IF jsonb_typeof(v_abas) <> 'array' THEN RAISE EXCEPTION 'invalid_abas'; END IF;

    IF p_id IS NULL THEN
        slug_new := regexp_replace(lower(trim(p_nome)), '[^a-z0-9]+', '-', 'g');
        slug_new := trim(both '-' from slug_new);
        IF slug_new = '' THEN slug_new := 'perfil'; END IF;
        INSERT INTO public.dashboard_perfis (slug, nome, abas, is_system)
        VALUES (slug_new || '-' || substr(gen_random_uuid()::text, 1, 8), trim(p_nome), v_abas, false)
        RETURNING id INTO pid;
        RETURN pid;
    END IF;

    SELECT * INTO rec FROM public.dashboard_perfis WHERE id = p_id;
    IF rec.id IS NULL THEN RAISE EXCEPTION 'perfil_not_found'; END IF;

    IF rec.slug = 'admin' THEN
        IF NOT (v_abas @> '["administracao"]'::jsonb) THEN
            v_abas := v_abas || '["administracao"]'::jsonb;
        END IF;
    END IF;

    UPDATE public.dashboard_perfis
    SET nome = trim(p_nome), abas = v_abas
    WHERE id = p_id;
    RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_dashboard_perfil_by_session(text, text, uuid, text, jsonb)
  TO anon, authenticated, service_role;


GRANT EXECUTE ON FUNCTION public.verify_dashboard_session(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.login_user(text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
