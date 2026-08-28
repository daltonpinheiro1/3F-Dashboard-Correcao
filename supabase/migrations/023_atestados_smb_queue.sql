-- 023 — Fila de resiliência SMB (backup na nuvem até sync na rede)

ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS arquivo_cloud_archive_path TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_smb_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.atestados.arquivo_cloud_archive_path IS
  'Cópia temporária do arquivo completo no bucket quando o push SMB falha.';
COMMENT ON COLUMN public.atestados.arquivo_smb_synced_at IS
  'Preenchido quando o arquivo completo foi gravado no SMB. NULL = pendente.';

CREATE INDEX IF NOT EXISTS idx_atestados_smb_pending
  ON public.atestados (created_at DESC)
  WHERE arquivo_cloud_archive_path IS NOT NULL AND arquivo_smb_synced_at IS NULL;

NOTIFY pgrst, 'reload schema';
