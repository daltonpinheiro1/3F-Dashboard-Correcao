-- Executar somente depois do deploy que usa /api/cubo-query e /api/eva-data.
-- Fecha leituras anônimas dos cubos e torna o bucket EVA privado.

DROP POLICY IF EXISTS "Anyone can read logs" ON public.correcao_logs;
DROP POLICY IF EXISTS "Authenticated users can read logs" ON public.correcao_logs;
REVOKE SELECT ON public.correcao_logs FROM anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.sms_eficiencia') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "anon_select_sms_eficiencia" ON public.sms_eficiencia';
    EXECUTE 'DROP POLICY IF EXISTS "auth_select_sms_eficiencia" ON public.sms_eficiencia';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone read sms_eficiencia" ON public.sms_eficiencia';
    EXECUTE 'REVOKE SELECT ON public.sms_eficiencia FROM anon, authenticated';
  END IF;
END $$;

UPDATE storage.buckets
SET public = false
WHERE id = 'eva-dash';
