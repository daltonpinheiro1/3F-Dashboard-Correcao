-- Agregado de correção cadastral sem reabrir leitura pública.
-- Não aplicado automaticamente; o endpoint Worker permanece como referência de paridade.

CREATE OR REPLACE FUNCTION public.dashboard_correcao_analytics(
  p_de date,
  p_ate date
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT
      supervisor,
      COALESCE(equipe, '-') AS equipe,
      elapsed_ms,
      tipos_erro,
      EXISTS (
        SELECT 1
        FROM unnest(COALESCE(tipos_erro, ARRAY[]::text[])) AS tipo
        WHERE tipo NOT IN ('referencia_tratamento', 'logradouro_acentuacao')
      ) AS com_erro
    FROM public.correcao_logs
    WHERE data_venda >= p_de::timestamp
      AND data_venda < (p_ate + 1)::timestamp
  ),
  resumo AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE com_erro)::int AS corrigidas,
      COALESCE(round(avg(elapsed_ms)), 0)::int AS tempo_medio,
      count(DISTINCT supervisor) FILTER (WHERE supervisor IS NOT NULL)::int AS supervisores
    FROM base
  ),
  ranking AS (
    SELECT
      COALESCE(NULLIF(trim(supervisor), ''), 'Não identificado') AS supervisor,
      equipe,
      count(*)::int AS total_propostas,
      count(*) FILTER (WHERE com_erro)::int AS total_corrigidas
    FROM base
    GROUP BY 1, 2
  ),
  error_counts AS (
    SELECT tipo, count(*) AS total
    FROM base
    CROSS JOIN LATERAL unnest(COALESCE(tipos_erro, ARRAY[]::text[])) AS tipo
    WHERE tipo NOT IN ('referencia_tratamento', 'logradouro_acentuacao')
    GROUP BY tipo
  )
  SELECT jsonb_build_object(
    'dashboard', jsonb_build_object(
      'total_propostas', resumo.total,
      'total_corrigidas', resumo.corrigidas,
      'taxa_erro_pct', CASE WHEN resumo.total > 0
        THEN round(100.0 * resumo.corrigidas / resumo.total, 1) ELSE 0 END,
      'tempo_medio_ms', resumo.tempo_medio,
      'top_erro', COALESCE((SELECT tipo FROM error_counts ORDER BY total DESC, tipo LIMIT 1), '-'),
      'supervisores_ativos', resumo.supervisores
    ),
    'dashboard_supervisores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'supervisor', supervisor,
        'equipe', equipe,
        'total_propostas', total_propostas,
        'total_corrigidas', total_corrigidas,
        'taxa_erro_pct', CASE WHEN total_propostas > 0
          THEN round(100.0 * total_corrigidas / total_propostas, 1) ELSE 0 END
      ) ORDER BY
        CASE WHEN total_propostas > 0 THEN 100.0 * total_corrigidas / total_propostas ELSE 0 END
      )
      FROM ranking
      WHERE supervisor <> 'Não identificado' OR total_propostas > 2
    ), '[]'::jsonb)
  )
  FROM resumo;
$$;

REVOKE ALL ON FUNCTION public.dashboard_correcao_analytics(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_correcao_analytics(date, date) TO service_role;
