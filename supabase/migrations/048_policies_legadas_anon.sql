-- Projeto alvo: Dashboard Correção (ayhrwxsxqddpeukydblz).
-- Remove policies legadas abertas para anon/authenticated que ficaram inertes desde a 033
-- (o privilégio de tabela foi revogado), mas voltariam a valer com qualquer GRANT acidental.
-- Front e syncs leem/gravam só com service_role; não há usuários em auth.users.

DROP POLICY IF EXISTS "Anon read logs temporary" ON public.correcao_logs;
DROP POLICY IF EXISTS "Authenticated read logs" ON public.correcao_logs;
DROP POLICY IF EXISTS "Anon read users" ON public.dashboard_users;
DROP POLICY IF EXISTS "Anon update users" ON public.dashboard_users;
DROP POLICY IF EXISTS "Anon read sms_eficiencia" ON public.sms_eficiencia;

REVOKE ALL ON public.correcao_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sms_eficiencia FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.dashboard_users FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.correcao_logs, public.sms_eficiencia, public.dashboard_users TO service_role;

DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'erros_por_hora', 'estratificacao_erros', 'evolucao_diaria', 'ranking_operadores',
    'ranking_supervisores', 'reincidencia', 'sms_eficiencia_resumo', 'top_vendedores_qualidade',
    'vw_sms_previo_diario', 'vw_sms_previo_resumo'
  ] LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v);
      EXECUTE format('GRANT SELECT ON public.%I TO service_role', v);
    END IF;
  END LOOP;
END $$;
