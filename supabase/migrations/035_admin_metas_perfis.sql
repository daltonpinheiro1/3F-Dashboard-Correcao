-- ============================================================
-- 035 — Perfis dinâmicos + metas por campanha
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dashboard_perfis (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL,
    nome text NOT NULL,
    abas jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dashboard_metas (
    campanha_op text NOT NULL,
    competencia text NOT NULL,
    cpc_pct numeric NOT NULL DEFAULT 65,
    vendas_mes integer NOT NULL DEFAULT 0,
    expediente_horas integer NOT NULL DEFAULT 8,
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (campanha_op, competencia),
    CONSTRAINT dashboard_metas_competencia_chk CHECK (competencia ~ '^\d{4}-\d{2}$'),
    CONSTRAINT dashboard_metas_campanha_chk CHECK (
      campanha_op IN (
        'TODAS', 'PORTABILIDADE', 'MIGRACAO', 'ACAO_BKO', 'CONTROLE_CONTROLE', 'ALGAR'
      )
    )
);

CREATE TABLE IF NOT EXISTS public.dashboard_metas_supervisor (
    supervisor_name text NOT NULL,
    competencia text NOT NULL,
    cpc_pct numeric NOT NULL,
    updated_by uuid,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (supervisor_name, competencia),
    CONSTRAINT dashboard_metas_sup_competencia_chk CHECK (competencia ~ '^\d{4}-\d{2}$')
);

ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS perfil_id uuid REFERENCES public.dashboard_perfis(id);

INSERT INTO public.dashboard_perfis (slug, nome, is_system, abas) VALUES
(
  'admin', 'Administrador', true,
  '["dashboard","operadores","supervisores","erros","advertencias","controle-dp","atestados","atestados-solicitar","evolucao","insights","sms","disparos","inteligencia","operacao","chamadas","hora","rr","discagens","administracao"]'::jsonb
),
(
  'supervisor', 'Supervisor', true,
  '["dashboard","operadores","supervisores","erros","advertencias","atestados-solicitar","evolucao","insights","sms","disparos","inteligencia","operacao","chamadas","discagens"]'::jsonb
),
(
  'viewer', 'Visualizador', true,
  '["dashboard","operadores","supervisores","erros","advertencias","atestados-solicitar","evolucao","insights","sms","operacao","chamadas","discagens"]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.dashboard_users u
SET perfil_id = p.id
FROM public.dashboard_perfis p
WHERE u.perfil_id IS NULL
  AND p.slug = CASE
    WHEN u.role = 'admin' THEN 'admin'
    WHEN u.role = 'supervisor' THEN 'supervisor'
    ELSE 'viewer'
  END;

INSERT INTO public.dashboard_metas (campanha_op, competencia, cpc_pct, vendas_mes, expediente_horas)
SELECT c.campanha_op, to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), c.cpc_pct, c.vendas_mes, c.expediente_horas
FROM (VALUES
  ('TODAS', 65::numeric, 0, 8),
  ('PORTABILIDADE', 65::numeric, 5000, 8),
  ('MIGRACAO', 65::numeric, 5000, 8),
  ('ACAO_BKO', 65::numeric, 1000, 8),
  ('CONTROLE_CONTROLE', 65::numeric, 5000, 8),
  ('ALGAR', 65::numeric, 0, 8)
) AS c(campanha_op, cpc_pct, vendas_mes, expediente_horas)
ON CONFLICT (campanha_op, competencia) DO NOTHING;

ALTER TABLE public.dashboard_perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_metas_supervisor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_perfis FROM anon, authenticated;
REVOKE ALL ON TABLE public.dashboard_metas FROM anon, authenticated;
REVOKE ALL ON TABLE public.dashboard_metas_supervisor FROM anon, authenticated;
GRANT ALL ON TABLE public.dashboard_perfis TO service_role;
GRANT ALL ON TABLE public.dashboard_metas TO service_role;
GRANT ALL ON TABLE public.dashboard_metas_supervisor TO service_role;

CREATE OR REPLACE FUNCTION public._dashboard_is_admin_session(v json)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(v->>'valid', '') = 'true'
     AND (
       COALESCE(v->>'role', '') = 'admin'
       OR COALESCE(v->>'perfil_slug', '') = 'admin'
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(COALESCE((v->'abas')::jsonb, '[]'::jsonb)) a(x)
         WHERE a.x = 'administracao'
       )
     );
$$;

CREATE OR REPLACE FUNCTION public.verify_dashboard_session(p_email text, p_nonce text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    u RECORD;
    abas jsonb;
    slug text;
BEGIN
    IF p_email IS NULL OR p_nonce IS NULL
       OR length(trim(p_email)) = 0 OR length(trim(p_nonce)) < 16 THEN
        RETURN json_build_object('valid', false, 'error', 'invalid_params');
    END IF;

    SELECT du.id, du.email, du.full_name, du.role, du.is_active,
           du.session_nonce, du.session_expires_at, du.perfil_id,
           p.slug AS perfil_slug, p.abas
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
    abas := COALESCE(u.abas, '[]'::jsonb);

    RETURN json_build_object(
        'valid', true,
        'id', u.id,
        'email', u.email,
        'full_name', u.full_name,
        'role', u.role,
        'perfil_id', u.perfil_id,
        'perfil_slug', slug,
        'abas', abas
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
    abas jsonb;
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
           du.perfil_id, p.slug AS perfil_slug, p.abas
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
    abas := COALESCE(user_record.abas, '[]'::jsonb);

    RETURN json_build_object(
        'success', true,
        'id', user_record.id,
        'email', user_record.email,
        'full_name', user_record.full_name,
        'role', user_record.role,
        'perfil_id', user_record.perfil_id,
        'perfil_slug', slug,
        'abas', abas,
        'session_expires_at', exp_at,
        'session_nonce', nonce
    );
END;
$$;

DROP FUNCTION IF EXISTS public.list_dashboard_users_by_session(text, text);

CREATE FUNCTION public.list_dashboard_users_by_session(p_email text, p_nonce text)
RETURNS TABLE(
    id uuid,
    email text,
    full_name text,
    role text,
    is_active boolean,
    last_login_at timestamptz,
    perfil_id uuid,
    perfil_nome text,
    perfil_slug text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v json;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF NOT public._dashboard_is_admin_session(v) THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    RETURN QUERY
    SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.last_login_at,
           u.perfil_id, p.nome, p.slug
    FROM public.dashboard_users u
    LEFT JOIN public.dashboard_perfis p ON p.id = u.perfil_id
    ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_dashboard_users_by_session(text, text) TO anon, authenticated, service_role;

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
    n_admin int;
    tgt RECORD;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF NOT public._dashboard_is_admin_session(v) THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    SELECT u.id, u.role, p.slug INTO tgt
    FROM public.dashboard_users u
    LEFT JOIN public.dashboard_perfis p ON p.id = u.perfil_id
    WHERE u.id = p_user_id;
    IF tgt.id IS NULL THEN
        RAISE EXCEPTION 'user_not_found';
    END IF;
    SELECT COUNT(*) INTO n_admin
    FROM public.dashboard_users u
    LEFT JOIN public.dashboard_perfis p ON p.id = u.perfil_id
    WHERE u.is_active
      AND (u.role = 'admin' OR p.slug = 'admin');
    IF n_admin <= 1 AND (tgt.role = 'admin' OR tgt.slug = 'admin') THEN
        RAISE EXCEPTION 'last_admin';
    END IF;
    UPDATE public.dashboard_users
    SET is_active = NOT is_active
    WHERE id = p_user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.create_dashboard_user_by_session(text, text, text, text, text, text);

CREATE FUNCTION public.create_dashboard_user_by_session(
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
    slug text;
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
        SELECT id, slug INTO pid, slug FROM public.dashboard_perfis WHERE id = p_perfil_id;
        IF pid IS NULL THEN RAISE EXCEPTION 'invalid_perfil'; END IF;
    ELSE
        slug := COALESCE(NULLIF(trim(p_role), ''), 'viewer');
        IF slug NOT IN ('admin', 'supervisor', 'viewer') THEN
            RAISE EXCEPTION 'invalid_role';
        END IF;
        SELECT id INTO pid FROM public.dashboard_perfis WHERE dashboard_perfis.slug = slug;
    END IF;

    r := CASE WHEN slug IN ('admin', 'supervisor', 'viewer') THEN slug ELSE 'viewer' END;

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
    slug text;
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
        SELECT dashboard_perfis.slug INTO slug FROM public.dashboard_perfis WHERE id = p_perfil_id;
        IF slug IS NULL THEN RAISE EXCEPTION 'invalid_perfil'; END IF;
        r := CASE WHEN slug IN ('admin', 'supervisor', 'viewer') THEN slug ELSE 'viewer' END;
    END IF;

    SELECT COUNT(*) INTO n_admin
    FROM public.dashboard_users u
    LEFT JOIN public.dashboard_perfis p ON p.id = u.perfil_id
    WHERE u.is_active AND (u.role = 'admin' OR p.slug = 'admin');

    IF n_admin <= 1 AND (tgt.role = 'admin' OR tgt.perfil_slug = 'admin') THEN
        IF p_is_active IS FALSE OR (slug IS NOT NULL AND slug <> 'admin') THEN
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
DECLARE v json;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF NOT public._dashboard_is_admin_session(v) THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    RETURN QUERY
    SELECT p.id, p.slug, p.nome, p.abas, p.is_system,
           (SELECT COUNT(*)::int FROM public.dashboard_users u WHERE u.perfil_id = p.id)
    FROM public.dashboard_perfis p
    ORDER BY p.is_system DESC, p.nome;
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
    abas jsonb;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF NOT public._dashboard_is_admin_session(v) THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    IF p_nome IS NULL OR length(trim(p_nome)) < 2 THEN
        RAISE EXCEPTION 'invalid_nome';
    END IF;
    abas := COALESCE(p_abas, '[]'::jsonb);
    IF jsonb_typeof(abas) <> 'array' THEN RAISE EXCEPTION 'invalid_abas'; END IF;

    IF p_id IS NULL THEN
        slug_new := regexp_replace(lower(trim(p_nome)), '[^a-z0-9]+', '-', 'g');
        slug_new := trim(both '-' from slug_new);
        IF slug_new = '' THEN slug_new := 'perfil'; END IF;
        INSERT INTO public.dashboard_perfis (slug, nome, abas, is_system)
        VALUES (slug_new || '-' || substr(gen_random_uuid()::text, 1, 8), trim(p_nome), abas, false)
        RETURNING id INTO pid;
        RETURN pid;
    END IF;

    SELECT * INTO rec FROM public.dashboard_perfis WHERE id = p_id;
    IF rec.id IS NULL THEN RAISE EXCEPTION 'perfil_not_found'; END IF;

    IF rec.slug = 'admin' THEN
        IF NOT (abas @> '["administracao"]'::jsonb) THEN
            abas := abas || '["administracao"]'::jsonb;
        END IF;
    END IF;

    UPDATE public.dashboard_perfis
    SET nome = trim(p_nome), abas = abas
    WHERE id = p_id;
    RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_dashboard_perfil_by_session(text, text, uuid, text, jsonb)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_dashboard_perfil_by_session(
    p_email text,
    p_nonce text,
    p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v json;
    rec RECORD;
    n int;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF NOT public._dashboard_is_admin_session(v) THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    SELECT * INTO rec FROM public.dashboard_perfis WHERE id = p_id;
    IF rec.id IS NULL THEN RAISE EXCEPTION 'perfil_not_found'; END IF;
    IF rec.is_system THEN RAISE EXCEPTION 'system_perfil'; END IF;
    SELECT COUNT(*) INTO n FROM public.dashboard_users WHERE perfil_id = p_id;
    IF n > 0 THEN RAISE EXCEPTION 'perfil_in_use'; END IF;
    DELETE FROM public.dashboard_perfis WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_dashboard_perfil_by_session(text, text, uuid)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_dashboard_metas_by_session(
    p_email text,
    p_nonce text,
    p_competencia text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v json;
    comp text;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF COALESCE(v->>'valid', '') <> 'true' THEN
        RAISE EXCEPTION 'session_required';
    END IF;
    comp := COALESCE(NULLIF(trim(p_competencia), ''), to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'));
    RETURN json_build_object(
      'competencia', comp,
      'campanhas', COALESCE((
        SELECT json_agg(json_build_object(
          'campanha_op', m.campanha_op,
          'cpc_pct', m.cpc_pct,
          'vendas_mes', m.vendas_mes,
          'expediente_horas', m.expediente_horas,
          'updated_at', m.updated_at
        ) ORDER BY m.campanha_op)
        FROM public.dashboard_metas m WHERE m.competencia = comp
      ), '[]'::json),
      'supervisores', COALESCE((
        SELECT json_agg(json_build_object(
          'supervisor_name', s.supervisor_name,
          'cpc_pct', s.cpc_pct
        ) ORDER BY s.supervisor_name)
        FROM public.dashboard_metas_supervisor s WHERE s.competencia = comp
      ), '[]'::json)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_dashboard_metas_by_session(text, text, text)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_dashboard_metas_by_session(
    p_email text,
    p_nonce text,
    p_competencia text,
    p_campanhas jsonb,
    p_supervisores jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v json;
    uid uuid;
    rec jsonb;
    cop text;
    cpc numeric;
    vendas int;
    exp int;
BEGIN
    v := public.verify_dashboard_session(p_email, p_nonce);
    IF NOT public._dashboard_is_admin_session(v) THEN
        RAISE EXCEPTION 'admin_session_required';
    END IF;
    uid := (v->>'id')::uuid;
    IF p_competencia IS NULL OR p_competencia !~ '^\d{4}-\d{2}$' THEN
        RAISE EXCEPTION 'invalid_competencia';
    END IF;

    FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(p_campanhas, '[]'::jsonb))
    LOOP
        cop := rec->>'campanha_op';
        IF cop NOT IN ('TODAS','PORTABILIDADE','MIGRACAO','ACAO_BKO','CONTROLE_CONTROLE','ALGAR') THEN
            CONTINUE;
        END IF;
        cpc := GREATEST(1, LEAST(100, COALESCE((rec->>'cpc_pct')::numeric, 65)));
        vendas := GREATEST(0, LEAST(999999, COALESCE((rec->>'vendas_mes')::int, 0)));
        exp := GREATEST(4, LEAST(13, COALESCE((rec->>'expediente_horas')::int, 8)));
        INSERT INTO public.dashboard_metas (campanha_op, competencia, cpc_pct, vendas_mes, expediente_horas, updated_by, updated_at)
        VALUES (cop, p_competencia, cpc, vendas, exp, uid, now())
        ON CONFLICT (campanha_op, competencia) DO UPDATE
          SET cpc_pct = EXCLUDED.cpc_pct,
              vendas_mes = EXCLUDED.vendas_mes,
              expediente_horas = EXCLUDED.expediente_horas,
              updated_by = EXCLUDED.updated_by,
              updated_at = now();
    END LOOP;

    DELETE FROM public.dashboard_metas_supervisor WHERE competencia = p_competencia;
    FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(p_supervisores, '[]'::jsonb))
    LOOP
        IF NULLIF(trim(rec->>'supervisor_name'), '') IS NULL THEN CONTINUE; END IF;
        cpc := GREATEST(1, LEAST(100, COALESCE((rec->>'cpc_pct')::numeric, 65)));
        INSERT INTO public.dashboard_metas_supervisor (supervisor_name, competencia, cpc_pct, updated_by, updated_at)
        VALUES (trim(rec->>'supervisor_name'), p_competencia, cpc, uid, now());
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_dashboard_metas_by_session(text, text, text, jsonb, jsonb)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public._dashboard_is_admin_session(json) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._dashboard_is_admin_session(json) TO service_role;

GRANT EXECUTE ON FUNCTION public.verify_dashboard_session(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.login_user(text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
