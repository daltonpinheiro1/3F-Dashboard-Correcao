-- ============================================================
-- 057 — Espelho dos resultados da Consulta TIM (Score TIM / VM)
-- Projeto: ayhrwxsxqddpeukydblz (Dashboard Correção)
-- Isolada: não toca portabilidade, advertências, atestados nem metas.
-- Gravada só pelo bot (service_role). Sem CPF completo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.consulta_tim_resultados (
  query_id text PRIMARY KEY,
  status text NOT NULL,
  score integer,
  purchase_limit numeric,
  rejection_reason text,
  outcome_code text,
  latency_ms integer,
  cached boolean NOT NULL DEFAULT false,
  cpf_masked text,
  uf text,
  result_timestamp double precision,
  stored_at timestamptz NOT NULL,
  mirrored_at timestamptz NOT NULL DEFAULT now(),
  dia date GENERATED ALWAYS AS (
    (timezone('America/Sao_Paulo', stored_at))::date
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_consulta_tim_resultados_dia
  ON public.consulta_tim_resultados (dia DESC);
CREATE INDEX IF NOT EXISTS idx_consulta_tim_resultados_status_dia
  ON public.consulta_tim_resultados (dia DESC, status);
CREATE INDEX IF NOT EXISTS idx_consulta_tim_resultados_stored
  ON public.consulta_tim_resultados (stored_at DESC);

COMMENT ON TABLE public.consulta_tim_resultados IS
  'Backup/espelho dos resultados do bot Score TIM (SQLite da VM). Atualiza por upsert em query_id.';

ALTER TABLE public.consulta_tim_resultados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.consulta_tim_resultados FROM anon, authenticated;
GRANT ALL ON TABLE public.consulta_tim_resultados TO service_role;

-- Consolidados por dia (DBeaver / apuração).
CREATE OR REPLACE VIEW public.consulta_tim_resultados_diario
WITH (security_invoker = true)
AS
SELECT
  dia,
  COUNT(*)::integer AS consultas,
  COUNT(*) FILTER (WHERE status = 'APPROVED')::integer AS aprovadas,
  COUNT(*) FILTER (WHERE status = 'REJECTED')::integer AS reprovadas,
  COUNT(*) FILTER (WHERE status = 'FAILED')::integer AS falhas,
  COUNT(*) FILTER (WHERE status = 'INDETERMINATE')::integer AS indeterminadas,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'APPROVED') / NULLIF(COUNT(*), 0),
    1
  ) AS pct_aprovadas
FROM public.consulta_tim_resultados
GROUP BY dia;

REVOKE ALL ON TABLE public.consulta_tim_resultados_diario FROM anon, authenticated;
GRANT SELECT ON TABLE public.consulta_tim_resultados_diario TO service_role;
