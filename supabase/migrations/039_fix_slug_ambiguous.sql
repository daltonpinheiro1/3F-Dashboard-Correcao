-- ============================================================
-- 039 — Desambigua variável `slug` x coluna dashboard_perfis.slug
-- (criar usuário com perfil falhava: column reference "slug" is ambiguous)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_dashboard_user_by_session(
    p_actor_email text,
    p_nonce text,
    p_email text,
    p_name text,
    p_password text,
    p_role text,
    p_perfil_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v json;
    new_id uuid;
    pid uuid;
    v_slug text;
    r text;
BEGIN
    v := public.verify_dashboard_session(p_actor_email, p_nonce);
    IF NOT public._dashboard_is_admin_session(v) THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    IF length(trim(p_password)) < 6 THEN
        RAISE EXCEPTION 'password_too_short';
    END IF;

    IF p_perfil_id IS NOT NULL THEN
        SELECT dp.id, dp.slug INTO pid, v_slug FROM public.dashboard_perfis dp WHERE dp.id = p_perfil_id;
        IF pid IS NULL THEN RAISE EXCEPTION 'invalid_perfil'; END IF;
    ELSE
        v_slug := COALESCE(NULLIF(trim(p_role), ''), 'viewer');
        IF v_slug NOT IN ('admin', 'supervisor', 'viewer') THEN
            RAISE EXCEPTION 'invalid_role';
        END IF;
        SELECT dp.id INTO pid FROM public.dashboard_perfis dp WHERE dp.slug = v_slug;
    END IF;

    r := CASE WHEN v_slug IN ('admin', 'supervisor', 'viewer') THEN v_slug ELSE 'viewer' END;

    INSERT INTO public.dashboard_users (email, password_hash, full_name, role, perfil_id)
    VALUES (
        lower(trim(p_email)),
        extensions.crypt(p_password::text, extensions.gen_salt('bf')),
        trim(p_name),
        r,
        pid
    )
    RETURNING id INTO new_id;
    RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_dashboard_user_by_session(text, text, text, text, text, text, uuid)
  TO anon, authenticated, service_role;

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

    UPDATE public.dashboard_users
    SET full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
        perfil_id = COALESCE(p_perfil_id, perfil_id),
        role = COALESCE(r, role),
        is_active = COALESCE(p_is_active, is_active),
        password_hash = CASE
          WHEN p_password IS NOT NULL AND length(trim(p_password)) >= 6
            THEN extensions.crypt(trim(p_password), extensions.gen_salt('bf'))
          ELSE password_hash
        END
    WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_dashboard_user_by_session(text, text, uuid, text, uuid, boolean, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
