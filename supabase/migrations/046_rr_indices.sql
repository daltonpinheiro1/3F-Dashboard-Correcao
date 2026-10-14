-- Projeto Supabase principal do dashboard (ayhrwxsxqddpeukydblz, SUPABASE_URL) — não é o de portabilidade.
CREATE INDEX IF NOT EXISTS sms_eficiencia_data_venda_fluxo_proposta_idx
  ON public.sms_eficiencia (data_venda, fluxo, proposta_id);

CREATE INDEX IF NOT EXISTS sms_eficiencia_retorno_fluxo_proposta_idx
  ON public.sms_eficiencia (retorno_atualizado_em, fluxo, proposta_id);

CREATE INDEX IF NOT EXISTS correcao_logs_data_venda_created_id_idx
  ON public.correcao_logs (data_venda, created_at, id);
