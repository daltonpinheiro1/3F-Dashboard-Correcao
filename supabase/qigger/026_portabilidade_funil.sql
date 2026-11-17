-- Portabilidade / Disparos — índices + RPC cohort (dashboard funil gerencial)
--
-- ⚠️  APLICAR NO SUPABASE QIGGER / REPROCESSAMENTO — NÃO no dashboard!
--     Projeto correto: hatjmfkjnjbghmolveph  (consultas_enviadas_pos_aceite, fila, logística)
--     Projeto ERRADO:  ayhrwxsxqddpeukydblz  (advertencias, dashboard users — sem tabelas portabilidade)
--
-- Confirme antes de rodar:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('consultas_enviadas_pos_aceite','fila_acoes_portabilidade','aguardando_entrega');
--
-- Deve retornar 3 linhas. Se retornar vazio → projeto Supabase incorreto.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consultas_enviadas_pos_aceite'
  ) THEN
    RAISE EXCEPTION E'Projeto Supabase incorreto.\n'
      'A tabela public.consultas_enviadas_pos_aceite não existe aqui.\n'
      'Rode esta migration no Supabase Qigger/reprocessamento (ref hatjmfkjnjbghmolveph),\n'
      'o mesmo configurado em PORTABILIDADE_SUPABASE_URL no Cloudflare Pages.\n'
      'NÃO rode no Supabase do dashboard (advertencias / ayhrwxsxqddpeukydblz).';
  END IF;
END $$;

-- Índices consultas_enviadas_pos_aceite
CREATE INDEX IF NOT EXISTS idx_ce_ultimo_retorno_em
  ON public.consultas_enviadas_pos_aceite (ultimo_retorno_em DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_ce_enviada_em
  ON public.consultas_enviadas_pos_aceite (enviada_em DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_ce_ticket_status_retorno
  ON public.consultas_enviadas_pos_aceite (ticket_status, ultimo_retorno_em DESC);

-- Índices fila
CREATE INDEX IF NOT EXISTS idx_fila_status_executed
  ON public.fila_acoes_portabilidade (status, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_fila_acao_created
  ON public.fila_acoes_portabilidade (acao, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fila_pendente_executar
  ON public.fila_acoes_portabilidade (status, executar_apos)
  WHERE status = 'pendente';

-- Índices logística
CREATE INDEX IF NOT EXISTS idx_ag_entrega_updated
  ON public.aguardando_entrega (status, updated_at DESC);

-- RPC: estatísticas de cohort por mês (BRT UTC-3, início 03:00 UTC)
CREATE OR REPLACE FUNCTION public.portabilidade_cohort_stats(p_mes text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_y int;
  v_m int;
  v_start timestamptz;
  v_end timestamptz;
  v_portados bigint;
  v_falha bigint;
  v_canceladas bigint;
  v_quebras bigint;
  v_bko bigint;
  v_exec_ok bigint;
  v_exec_nok bigint;
  v_activate bigint;
BEGIN
  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_mes inválido (YYYY-MM)';
  END IF;
  v_y := split_part(p_mes, '-', 1)::int;
  v_m := split_part(p_mes, '-', 2)::int;
  v_start := make_timestamptz(v_y, v_m, 1, 3, 0, 0, 'UTC');
  v_end := v_start + interval '1 month';

  SELECT count(*) INTO v_portados
  FROM consultas_enviadas_pos_aceite
  WHERE ticket_status = 'Portado'
    AND ultimo_retorno_em >= v_start AND ultimo_retorno_em < v_end;

  SELECT count(*) INTO v_falha
  FROM consultas_enviadas_pos_aceite
  WHERE ticket_status = 'Falha Parcial'
    AND ultimo_retorno_em >= v_start AND ultimo_retorno_em < v_end;

  SELECT count(*) INTO v_canceladas
  FROM consultas_enviadas_pos_aceite
  WHERE ticket_status = 'Portabilidade Cancelada'
    AND ultimo_retorno_em >= v_start AND ultimo_retorno_em < v_end;

  SELECT count(*) INTO v_quebras
  FROM aguardando_entrega
  WHERE status = 'quebra_logistica'
    AND updated_at >= v_start AND updated_at < v_end;

  SELECT count(*) INTO v_bko
  FROM fila_acoes_portabilidade
  WHERE status = 'bko'
    AND updated_at >= v_start AND updated_at < v_end;

  SELECT count(*) INTO v_exec_ok
  FROM fila_acoes_portabilidade
  WHERE resultado_is_valid = true
    AND executed_at >= v_start AND executed_at < v_end;

  SELECT count(*) INTO v_exec_nok
  FROM fila_acoes_portabilidade
  WHERE resultado_is_valid = false
    AND executed_at >= v_start AND executed_at < v_end;

  SELECT count(*) INTO v_activate
  FROM fila_acoes_portabilidade
  WHERE acao = 'activate' AND status = 'concluida'
    AND executed_at >= v_start AND executed_at < v_end;

  RETURN jsonb_build_object(
    'mes', p_mes,
    'portados', v_portados,
    'falha_parcial', v_falha,
    'canceladas', v_canceladas,
    'fechados', v_portados + v_falha + v_canceladas,
    'quebras', v_quebras,
    'bko', v_bko,
    'execucoes', v_exec_ok + v_exec_nok,
    'exec_ok', v_exec_ok,
    'activate_ok', v_activate,
    'taxa_portado_pct', CASE WHEN (v_portados + v_falha + v_canceladas) > 0
      THEN round((v_portados::numeric / (v_portados + v_falha + v_canceladas)) * 1000) / 10
      ELSE 0 END,
    'taxa_sucesso_fila_pct', CASE WHEN (v_exec_ok + v_exec_nok) > 0
      THEN round((v_exec_ok::numeric / (v_exec_ok + v_exec_nok)) * 1000) / 10
      ELSE 0 END
  );
END;
$$;

COMMENT ON FUNCTION public.portabilidade_cohort_stats IS
  'Contagens mensais BRT para histórico/funil gerencial (dashboard Disparos).';

GRANT EXECUTE ON FUNCTION public.portabilidade_cohort_stats(text) TO service_role;
