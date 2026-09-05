-- Anti-duplicata: no máximo uma ação ativa (pendente/executando/bko) por proposta+acao.
-- Se a criação falhar por linhas já duplicadas, limpar o par antigo antes de reaplicar.
CREATE UNIQUE INDEX IF NOT EXISTS fila_acoes_pendente_unica
  ON public.fila_acoes_portabilidade (proposta_isize, acao)
  WHERE status IN ('pendente', 'executando', 'bko');
