-- 019 — Snapshot da medida original solicitada (reformulação DP)
-- Projeto: ayhrwxsxqddpeukydblz

ALTER TABLE public.advertencias
  ADD COLUMN IF NOT EXISTS nivel_solicitado_idx SMALLINT
    CHECK (nivel_solicitado_idx IS NULL OR (nivel_solicitado_idx >= 0 AND nivel_solicitado_idx <= 10)),
  ADD COLUMN IF NOT EXISTS nivel_solicitado_codigo TEXT,
  ADD COLUMN IF NOT EXISTS nivel_solicitado_label TEXT,
  ADD COLUMN IF NOT EXISTS dias_suspensao_solicitados INTEGER
    CHECK (dias_suspensao_solicitados IS NULL OR dias_suspensao_solicitados >= 0);

COMMENT ON COLUMN public.advertencias.nivel_solicitado_idx IS
  'Medida original enviada pelo solicitante; preenchida quando o DP reformula nivel_idx.';

NOTIFY pgrst, 'reload schema';
