-- ============================================================
-- 059 — Dados cadastrais no espelho Consulta TIM
-- Projeto: ayhrwxsxqddpeukydblz
-- ============================================================

ALTER TABLE public.consulta_tim_resultados
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS data_nascimento text,
  ADD COLUMN IF NOT EXISTS nome_mae text,
  ADD COLUMN IF NOT EXISTS telefone text;

CREATE INDEX IF NOT EXISTS idx_consulta_tim_resultados_cpf_stored
  ON public.consulta_tim_resultados (cpf, stored_at DESC);

COMMENT ON COLUMN public.consulta_tim_resultados.cpf IS
  'CPF só dígitos (apuração interna). Preferir cpf_masked em telas públicas.';
