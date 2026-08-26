-- ============================================================
-- 014 — Views security_invoker + RLS SMS (remove UNRESTRICTED)
-- Projeto: ayhrwxsxqddpeukydblz (Dashboard Correção)
--
-- Supabase marca views como UNRESTRICTED quando rodam como
-- SECURITY DEFINER (dono) e ignoram RLS das tabelas base.
-- ============================================================

-- 1) Todas as views públicas passam a respeitar RLS do chamador
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
    BEGIN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.view_name);
      RAISE NOTICE 'security_invoker=true → %', r.view_name;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip %: %', r.view_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- 2) RLS nas tabelas SMS (se existirem)
DO $$
BEGIN
  IF to_regclass('public.sms_eficiencia') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.sms_eficiencia ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "anon_select_sms_eficiencia" ON public.sms_eficiencia';
    EXECUTE 'DROP POLICY IF EXISTS "auth_select_sms_eficiencia" ON public.sms_eficiencia';
    EXECUTE 'DROP POLICY IF EXISTS "service_write_sms_eficiencia" ON public.sms_eficiencia';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone read sms_eficiencia" ON public.sms_eficiencia';
    -- SPA usa anon key (mesmo padrão de correcao_logs)
    EXECUTE $p$
      CREATE POLICY "anon_select_sms_eficiencia"
        ON public.sms_eficiencia FOR SELECT TO anon USING (true)
    $p$;
    EXECUTE $p$
      CREATE POLICY "auth_select_sms_eficiencia"
        ON public.sms_eficiencia FOR SELECT TO authenticated USING (true)
    $p$;
    EXECUTE $p$
      CREATE POLICY "service_write_sms_eficiencia"
        ON public.sms_eficiencia FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $p$;
  END IF;

  IF to_regclass('public.sms_previo_eficiencia') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.sms_previo_eficiencia ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "anon_select_sms_previo_eficiencia" ON public.sms_previo_eficiencia';
    EXECUTE 'DROP POLICY IF EXISTS "auth_select_sms_previo_eficiencia" ON public.sms_previo_eficiencia';
    EXECUTE 'DROP POLICY IF EXISTS "service_write_sms_previo_eficiencia" ON public.sms_previo_eficiencia';
    EXECUTE $p$
      CREATE POLICY "anon_select_sms_previo_eficiencia"
        ON public.sms_previo_eficiencia FOR SELECT TO anon USING (true)
    $p$;
    EXECUTE $p$
      CREATE POLICY "auth_select_sms_previo_eficiencia"
        ON public.sms_previo_eficiencia FOR SELECT TO authenticated USING (true)
    $p$;
    EXECUTE $p$
      CREATE POLICY "service_write_sms_previo_eficiencia"
        ON public.sms_previo_eficiencia FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $p$;
  END IF;
END $$;

-- 3) Garantir grants de SELECT nas views (leitura SPA); sem INSERT/UPDATE públicos
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
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', r.view_name);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC, anon, authenticated', r.view_name);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
