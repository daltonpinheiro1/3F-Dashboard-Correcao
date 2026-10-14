-- 045 — Projeto: ayhrwxsxqddpeukydblz (Dashboard Correção) — claim idempotente da notificação de advertência.

ALTER TABLE public.advertencias
  ADD COLUMN IF NOT EXISTS notificacao_claim_em TIMESTAMPTZ;

ALTER TABLE public.advertencias
  DROP CONSTRAINT IF EXISTS advertencias_notificacao_status_check;

ALTER TABLE public.advertencias
  ADD CONSTRAINT advertencias_notificacao_status_check
  CHECK (notificacao_status IN ('desativada', 'pendente', 'enviando', 'enviada', 'falha'));

COMMENT ON COLUMN public.advertencias.notificacao_claim_em IS
  'Início do envio em andamento (status enviando); claims com mais de 5 min podem ser retomados.';

NOTIFY pgrst, 'reload schema';
