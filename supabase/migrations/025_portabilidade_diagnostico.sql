-- Diagnóstico: confirme que está no Supabase correto antes das migrations 026/027.
-- Cole no SQL Editor do Supabase e execute.

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'advertencias'
    ) THEN '⛔ ERRADO — Dashboard (ayhrwxsxqddpeukydblz). Abra hatjmfkjnjbghmolveph.'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'consultas_enviadas_pos_aceite'
    ) THEN '✅ OK — Qigger (hatjmfkjnjbghmolveph). Pode rodar 026 e 027.'
    ELSE '❓ Projeto desconhecido — confira o ref na URL do dashboard Supabase'
  END AS diagnostico;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'consultas_enviadas_pos_aceite',
    'fila_acoes_portabilidade',
    'aguardando_entrega',
    'advertencias'
  )
ORDER BY table_name;

-- Teste RPC (após 027):
-- SELECT public.portabilidade_cohort_stats('2026-08');
