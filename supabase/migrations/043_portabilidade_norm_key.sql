-- ⚠️  Projeto Qigger hatjmfkjnjbghmolveph — chave normalizada de proposta (3F-N ≡ N) no cohort_stats.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consultas_enviadas_pos_aceite'
  ) THEN
    RAISE EXCEPTION 'Projeto Supabase incorreto — use hatjmfkjnjbghmolveph (Qigger), não o dashboard.';
  END IF;
END $$;

-- Espelho exato de normPropostaKey (functions/_lib/portabilidadePropostaKey.ts):
--   null/vazio → ''; trim; remove prefixo ^3F- (case-insensitive);
--   resto só dígitos [0-9] → '3F-' || dígitos;
--   senão: começa com '3F-' (case-sensitive) → mantém; caso contrário → '3F-' || valor.
CREATE OR REPLACE FUNCTION public.portabilidade_norm_key(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  WITH t AS (
    SELECT regexp_replace(coalesce(p_raw, ''), '^\s+|\s+$', '', 'g') AS s
  ), d AS (
    SELECT s, regexp_replace(s, '^3F-', '', 'i') AS digits FROM t
  )
  SELECT CASE
    WHEN s = '' THEN ''
    WHEN digits ~ '^[0-9]+$' THEN '3F-' || digits
    WHEN left(s, 3) = '3F-' THEN s
    ELSE '3F-' || s
  END
  FROM d;
$$;

REVOKE ALL ON FUNCTION public.portabilidade_norm_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portabilidade_norm_key(text) TO service_role;

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

  -- Fechamentos no mês: 1 linha canônica por proposta normalizada (ticket mais prioritário, depois retorno mais recente)
  WITH fech AS (
    SELECT DISTINCT ON (public.portabilidade_norm_key(proposta_isize))
      public.portabilidade_norm_key(proposta_isize) AS proposta_key,
      ticket_status
    FROM consultas_enviadas_pos_aceite
    WHERE ultimo_retorno_em >= v_start
      AND ultimo_retorno_em < v_end
      AND ticket_status IN ('Portado', 'Falha Parcial', 'Portabilidade Cancelada')
      AND public.portabilidade_norm_key(proposta_isize) <> ''
    ORDER BY public.portabilidade_norm_key(proposta_isize),
      CASE ticket_status
        WHEN 'Portado' THEN 3
        WHEN 'Falha Parcial' THEN 2
        WHEN 'Portabilidade Cancelada' THEN 1
        ELSE 0
      END DESC,
      ultimo_retorno_em DESC NULLS LAST
  )
  SELECT
    count(*) FILTER (WHERE ticket_status = 'Portado'),
    count(*) FILTER (WHERE ticket_status = 'Falha Parcial'),
    count(*) FILTER (WHERE ticket_status = 'Portabilidade Cancelada')
  INTO v_portados, v_falha, v_canceladas
  FROM fech;

  -- Universo cohort: proposta única (chave normalizada) com atividade no mês
  SELECT count(DISTINCT public.portabilidade_norm_key(proposta_isize)) INTO v_universo
  FROM consultas_enviadas_pos_aceite
  WHERE ((enviada_em >= v_start AND enviada_em < v_end)
     OR (ultimo_retorno_em >= v_start AND ultimo_retorno_em < v_end))
    AND public.portabilidade_norm_key(proposta_isize) <> '';

  SELECT count(DISTINCT public.portabilidade_norm_key(proposta_isize)) INTO v_quebras
  FROM aguardando_entrega
  WHERE status = 'quebra_logistica'
    AND updated_at >= v_start AND updated_at < v_end
    AND public.portabilidade_norm_key(proposta_isize) <> '';

  SELECT count(DISTINCT public.portabilidade_norm_key(proposta_isize)) INTO v_bko
  FROM fila_acoes_portabilidade
  WHERE status = 'bko'
    AND updated_at >= v_start AND updated_at < v_end
    AND public.portabilidade_norm_key(proposta_isize) <> '';

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
    'dedup_por_proposta', true,
    'chave_normalizada', true,
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

REVOKE ALL ON FUNCTION public.portabilidade_cohort_stats(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portabilidade_cohort_stats(text) TO service_role;

-- Índice de expressão (opcional; NÃO aplicar sem antes deduplicar):
-- 1) Conferir duplicatas que passam a colidir na chave normalizada:
--    SELECT public.portabilidade_norm_key(proposta_isize) AS k, count(*)
--    FROM consultas_enviadas_pos_aceite
--    GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC;
-- 2) Dedupe (manter a linha canônica = mesma prioridade do mergeCeRow: Portado > Falha Parcial >
--    Portabilidade Cancelada > outros, depois ultimo_retorno_em/enviada_em mais recente) e só então
--    criar o índice. Índice NÃO único serve ao DISTINCT ON/count(DISTINCT) acima:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ce_pos_aceite_norm_key
--   ON public.consultas_enviadas_pos_aceite (public.portabilidade_norm_key(proposta_isize));
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ce_pos_aceite_norm_key_retorno
--   ON public.consultas_enviadas_pos_aceite (public.portabilidade_norm_key(proposta_isize), ultimo_retorno_em DESC);
