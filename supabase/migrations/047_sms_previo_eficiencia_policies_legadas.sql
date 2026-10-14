-- Projeto alvo: Dashboard Correção (ayhrwxsxqddpeukydblz). Complementa a 040: em produção as policies têm nomes legados.

DROP POLICY IF EXISTS "Anyone can view sms_previo" ON public.sms_previo_eficiencia;
DROP POLICY IF EXISTS "Service can insert sms_previo" ON public.sms_previo_eficiencia;
DROP POLICY IF EXISTS "Service can update sms_previo" ON public.sms_previo_eficiencia;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.sms_previo_eficiencia FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.sms_previo_eficiencia FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sms_previo_eficiencia TO service_role;
