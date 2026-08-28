-- 021 — Hash, origem (portal supervisor) e índices extras

ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS arquivo_hash_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'dp'
    CHECK (origem IN ('dp', 'supervisor', 'colaborador'));

CREATE INDEX IF NOT EXISTS idx_atestados_hash ON public.atestados (arquivo_hash_sha256);
CREATE INDEX IF NOT EXISTS idx_atestados_origem ON public.atestados (origem);
CREATE INDEX IF NOT EXISTS idx_atestados_status_created ON public.atestados (status, created_at DESC);

COMMENT ON COLUMN public.atestados.arquivo_hash_sha256 IS 'SHA-256 do arquivo para integridade e detecção de duplicata.';
COMMENT ON COLUMN public.atestados.origem IS 'dp=protocolo RH; supervisor=portal solicitação; colaborador=self-service futuro.';

NOTIFY pgrst, 'reload schema';
