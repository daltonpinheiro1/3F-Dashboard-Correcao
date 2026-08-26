-- 015 — Notificação ao solicitante + trilha de entrega física (impressão → protocolo)
-- Projeto: ayhrwxsxqddpeukydblz

ALTER TABLE public.advertencias
  ADD COLUMN IF NOT EXISTS notificacao_status TEXT NOT NULL DEFAULT 'desativada'
    CHECK (notificacao_status IN ('desativada', 'pendente', 'enviada', 'falha')),
  ADD COLUMN IF NOT EXISTS notificacao_enviada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notificacao_erro TEXT,
  ADD COLUMN IF NOT EXISTS notificacao_tentativas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrega_status TEXT NOT NULL DEFAULT 'aguardando_aprovacao'
    CHECK (entrega_status IN (
      'aguardando_aprovacao',
      'aguardando_impressao',
      'impressa',
      'entregue',
      'recusada_ciencia'
    )),
  ADD COLUMN IF NOT EXISTS impressa_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS impressa_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS impressa_por_email TEXT,
  ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entregue_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS entregue_por_email TEXT,
  ADD COLUMN IF NOT EXISTS entrega_modo TEXT
    CHECK (entrega_modo IS NULL OR entrega_modo IN (
      'assinatura_colaborador',
      'recusa_ciencia_testemunhas',
      'protocolo_dp'
    )),
  ADD COLUMN IF NOT EXISTS entrega_observacao TEXT;

CREATE INDEX IF NOT EXISTS idx_advertencias_criado_por ON public.advertencias (criado_por_email);
CREATE INDEX IF NOT EXISTS idx_advertencias_entrega ON public.advertencias (entrega_status);
CREATE INDEX IF NOT EXISTS idx_advertencias_notificacao ON public.advertencias (notificacao_status);

-- Backfill coerente com registros existentes
UPDATE public.advertencias
SET
  entrega_status = CASE
    WHEN status = 'pendente' THEN 'aguardando_aprovacao'
    WHEN status IN ('aprovada', 'executada') THEN 'aguardando_impressao'
    ELSE entrega_status
  END
WHERE entrega_status = 'aguardando_aprovacao' OR entrega_status IS NULL;

NOTIFY pgrst, 'reload schema';
