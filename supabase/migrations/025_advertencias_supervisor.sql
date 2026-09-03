-- 025 — Supervisor/gestor do colaborador nas advertências (exibição DP)
ALTER TABLE public.advertencias
  ADD COLUMN IF NOT EXISTS colaborador_supervisor TEXT;

CREATE INDEX IF NOT EXISTS idx_advertencias_supervisor
  ON public.advertencias (colaborador_supervisor);

COMMENT ON COLUMN public.advertencias.colaborador_supervisor IS
  'Nome do gestor/supervisor do colaborador (EVA / formulário).';

-- Bug fix: forçar reload do schema no PostgREST
NOTIFY pgrst, 'reload schema';
