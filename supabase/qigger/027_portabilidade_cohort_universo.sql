-- Estende RPC cohort com universo + sucesso TIM (alinhado ao funil gerencial)
--
-- ⚠️  Mesmo projeto que 026: Supabase Qigger hatjmfkjnjbghmolveph (NÃO dashboard ayhrwxsxqddpeukydblz)
--     Rode 026 antes (ou garanta que portabilidade_cohort_stats já exista).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consultas_enviadas_pos_aceite'
  ) THEN
    RAISE EXCEPTION 'Projeto Supabase incorreto — use hatjmfkjnjbghmolveph (Qigger), não o dashboard.';
  END IF;
END $$;

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
  v_universo bigint;
  v_quebras bigint;
  v_bko bigint;
  v_exec_ok bigint;
  v_exec_nok bigint;
  v_activate bigint;
  v_fechados bigint;
  v_sucesso_tim bigint;
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

  SELECT count(DISTINCT proposta_isize) INTO v_universo
  FROM consultas_enviadas_pos_aceite
  WHERE (enviada_em >= v_start AND enviada_em < v_end)
     OR (ultimo_retorno_em >= v_start AND ultimo_retorno_em < v_end);

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

  v_fechados := v_portados + v_falha + v_canceladas;
  v_sucesso_tim := v_portados + v_falha;

  RETURN jsonb_build_object(
    'mes', p_mes,
    'portados', v_portados,
    'falha_parcial', v_falha,
    'canceladas', v_canceladas,
    'fechados', v_fechados,
    'sucesso_tim', v_sucesso_tim,
    'universo', v_universo,
    'quebras', v_quebras,
    'bko', v_bko,
    'execucoes', v_exec_ok + v_exec_nok,
    'exec_ok', v_exec_ok,
    'activate_ok', v_activate,
    'taxa_portado_pct', CASE WHEN v_fechados > 0
      THEN round((v_portados::numeric / v_fechados) * 1000) / 10
      ELSE 0 END,
    'taxa_sucesso_tim_pct', CASE WHEN v_universo > 0
      THEN round((v_sucesso_tim::numeric / v_universo) * 1000) / 10
      ELSE 0 END,
    'taxa_sucesso_fila_pct', CASE WHEN (v_exec_ok + v_exec_nok) > 0
      THEN round((v_exec_ok::numeric / (v_exec_ok + v_exec_nok)) * 1000) / 10
      ELSE 0 END
  );
END;
$$;
