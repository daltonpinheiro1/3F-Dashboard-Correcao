-- 022 — Thumbnail no Supabase; arquivo completo apenas no SMB

ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS arquivo_thumb_path TEXT;

COMMENT ON COLUMN public.atestados.arquivo_thumb_path IS
  'Miniatura JPEG no bucket atestados-docs. arquivo_path = cópia completa no SMB.';

CREATE INDEX IF NOT EXISTS idx_atestados_thumb ON public.atestados (arquivo_thumb_path);

NOTIFY pgrst, 'reload schema';
