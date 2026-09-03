-- 024 — Supervisor do colaborador no protocolo de atestado
ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS colaborador_supervisor TEXT;

CREATE INDEX IF NOT EXISTS idx_atestados_supervisor
  ON public.atestados (colaborador_supervisor);

COMMENT ON COLUMN public.atestados.colaborador_supervisor IS
  'Nome do supervisor do colaborador (EVA / preenchimento no protocolo).';

-- Bug fix: forçar reload do schema no PostgREST
NOTIFY pgrst, 'reload schema';
