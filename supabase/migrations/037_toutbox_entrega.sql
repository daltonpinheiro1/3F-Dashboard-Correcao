-- Resultado logístico Toutbox (chip físico). Não misturar com sms_eficiencia.
CREATE TABLE IF NOT EXISTS public.toutbox_entrega (
  proposta_id text PRIMARY KEY,
  nu_pedido text,
  vendedor text,
  equipe text,
  supervisor text,
  data_venda timestamptz,
  status text NOT NULL CHECK (status IN (
    'entregue', 'em_rota', 'insucesso', 'sem_rastreio', 'fora_escopo'
  )),
  evento_ultimo text,
  status_objeto text,
  substatus_objeto text,
  consultado_em timestamptz,
  fonte text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS toutbox_entrega_data_venda_idx
  ON public.toutbox_entrega (data_venda);
CREATE INDEX IF NOT EXISTS toutbox_entrega_vendedor_idx
  ON public.toutbox_entrega (vendedor);
CREATE INDEX IF NOT EXISTS toutbox_entrega_status_idx
  ON public.toutbox_entrega (status);

ALTER TABLE public.toutbox_entrega ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_write_toutbox_entrega" ON public.toutbox_entrega;
CREATE POLICY "service_write_toutbox_entrega"
  ON public.toutbox_entrega FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.toutbox_entrega FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.toutbox_entrega TO service_role;
