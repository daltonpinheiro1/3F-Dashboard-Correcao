-- Projeto alvo: Dashboard Correção (ayhrwxsxqddpeukydblz). Aplicar após deploy do BFF (Pages Functions com service_role).
-- ============================================================
-- 040 — Fecha superfícies anon/authenticated que o SPA não usa mais:
--   1) sms_previo_eficiencia sem leitura pública (mesmo corte da 033 em sms_eficiencia)
--   2) RPCs de login/sessão/usuários/perfis/metas só via service_role (BFF)
--   3) views públicas sem SELECT para anon
-- portabilidade_cohort_stats fica fora (migration 043).
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.sms_previo_eficiencia') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "anon_select_sms_previo_eficiencia" ON public.sms_previo_eficiencia';
    EXECUTE 'DROP POLICY IF EXISTS "auth_select_sms_previo_eficiencia" ON public.sms_previo_eficiencia';
    EXECUTE 'REVOKE SELECT ON public.sms_previo_eficiencia FROM anon, authenticated';
  END IF;
END $$;

DO $$
DECLARE
  sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.login_user(text, text)',
    'public.verify_dashboard_session(text, text)',
    'public.logout_dashboard_session(text, text)',
    'public.list_dashboard_users_by_session(text, text)',
    'public.toggle_user_active_by_session(text, text, uuid)',
    'public.create_dashboard_user_by_session(text, text, text, text, text, text, uuid)',
    'public.update_dashboard_user_by_session(text, text, uuid, text, uuid, boolean, text)',
    'public.list_dashboard_perfis_by_session(text, text)',
    'public.upsert_dashboard_perfil_by_session(text, text, uuid, text, jsonb)',
    'public.delete_dashboard_perfil_by_session(text, text, uuid)',
    'public.list_dashboard_metas_by_session(text, text, text)',
    'public.upsert_dashboard_metas_by_session(text, text, text, jsonb, jsonb)'
  ]
  LOOP
    IF to_regprocedure(sig) IS NULL THEN
      RAISE NOTICE 'função ausente, pulando: %', sig;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
  END LOOP;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS view_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon', r.view_name);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
