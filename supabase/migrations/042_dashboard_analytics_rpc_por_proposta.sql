-- Projeto Supabase principal do dashboard (SUPABASE_URL) — não é o de portabilidade; paridade com aggregateCorrecao (functions/_lib/cuboAggregates.ts).

CREATE OR REPLACE FUNCTION public.dashboard_correcao_analytics(
  p_de date,
  p_ate date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ini timestamptz;
  v_fim timestamptz;
  v_out jsonb;
BEGIN
  IF p_de IS NULL OR p_ate IS NULL OR p_de > p_ate THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;
  v_ini := p_de::timestamp AT TIME ZONE 'UTC';
  v_fim := (p_ate + 1)::timestamp AT TIME ZONE 'UTC';

  WITH passagens AS (
    SELECT
      l.id,
      l.created_at,
      COALESCE(NULLIF(btrim(l.proposta_id, E' \t\r\n'), ''), 'avulsa:' || l.id::text) AS chave,
      l.vendedor,
      l.equipe,
      l.supervisor,
      COALESCE(l.campos_alterados, ARRAY[]::text[]) AS campos,
      COALESCE(l.tipos_erro, ARRAY[]::text[]) AS tipos,
      COALESCE(l.elapsed_ms, 0) AS elapsed_ms,
      COALESCE(l.vendedor, '') ~* '^\s*roboadm\d*\s*$' AS robo
    FROM public.correcao_logs l
    WHERE l.data_venda >= v_ini
      AND l.data_venda < v_fim
  ),
  atribuicao AS (
    SELECT DISTINCT ON (chave) chave, vendedor, equipe, supervisor
    FROM passagens
    WHERE NOT robo
    ORDER BY chave, created_at DESC, id DESC
  ),
  tipos_por_proposta AS (
    SELECT p.chave, array_agg(DISTINCT t) AS tipos
    FROM passagens p
    CROSS JOIN LATERAL unnest(p.tipos) AS t
    GROUP BY p.chave
  ),
  campos_por_proposta AS (
    SELECT p.chave, array_agg(DISTINCT c) AS campos
    FROM passagens p
    CROSS JOIN LATERAL unnest(p.campos) AS c
    GROUP BY p.chave
  ),
  propostas AS (
    SELECT
      a.chave,
      COALESCE(a.vendedor, '') AS vendedor,
      COALESCE(a.equipe, '') AS equipe,
      COALESCE(a.supervisor, '') AS supervisor,
      COALESCE(tp.tipos, ARRAY[]::text[]) AS tipos,
      COALESCE(cp.campos, ARRAY[]::text[]) AS campos,
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(tp.tipos, ARRAY[]::text[])) AS t
        WHERE t NOT IN ('referencia_tratamento', 'logradouro_acentuacao')
      ) AS com_erro,
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(tp.tipos, ARRAY[]::text[])) AS t
        WHERE t LIKE 'referencia\_%' AND t <> 'referencia_tratamento'
      ) AS erro_referencia
    FROM atribuicao a
    LEFT JOIN tipos_por_proposta tp USING (chave)
    LEFT JOIN campos_por_proposta cp USING (chave)
  ),
  resumo AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE com_erro)::int AS corrigidas,
      count(DISTINCT supervisor) FILTER (WHERE supervisor <> '')::int AS supervisores
    FROM propostas
  ),
  tempo AS (
    SELECT COALESCE(round(avg(elapsed_ms)), 0)::bigint AS tempo_medio
    FROM passagens
    WHERE NOT robo
  ),
  erros AS (
    SELECT t AS tipo, count(*) AS total
    FROM propostas
    CROSS JOIN LATERAL unnest(tipos) AS t
    WHERE t NOT IN ('referencia_tratamento', 'logradouro_acentuacao')
    GROUP BY t
  ),
  dash_sup AS (
    SELECT
      COALESCE(NULLIF(supervisor, ''), 'Não identificado') AS supervisor,
      COALESCE(NULLIF(equipe, ''), '-') AS equipe,
      count(*)::int AS total,
      count(*) FILTER (WHERE com_erro)::int AS corrigidas
    FROM propostas
    GROUP BY 1, 2
  ),
  op AS (
    SELECT
      COALESCE(NULLIF(vendedor, ''), 'Sem vendedor') AS vendedor,
      array_agg(DISTINCT equipe COLLATE "C" ORDER BY equipe COLLATE "C") FILTER (WHERE equipe <> '') AS equipes,
      array_agg(DISTINCT supervisor COLLATE "C" ORDER BY supervisor COLLATE "C") FILTER (WHERE supervisor <> '') AS supervisores,
      count(*)::int AS total,
      count(*) FILTER (WHERE com_erro)::int AS corrigidas,
      count(*) FILTER (WHERE 'cep' = ANY (campos))::int AS cep,
      count(*) FILTER (WHERE 'logradouro' = ANY (campos))::int AS logradouro,
      count(*) FILTER (WHERE 'bairro' = ANY (campos))::int AS bairro,
      count(*) FILTER (WHERE 'cidade' = ANY (campos))::int AS cidade,
      count(*) FILTER (WHERE 'uf' = ANY (campos))::int AS uf,
      count(*) FILTER (WHERE 'numero' = ANY (campos))::int AS numero,
      count(*) FILTER (WHERE 'complemento' = ANY (campos))::int AS complemento,
      count(*) FILTER (WHERE erro_referencia)::int AS referencia
    FROM propostas
    GROUP BY 1
  ),
  sup AS (
    SELECT
      COALESCE(NULLIF(supervisor, ''), 'Sem supervisor') AS supervisor,
      COALESCE(NULLIF(equipe, ''), '-') AS equipe,
      count(DISTINCT vendedor) FILTER (WHERE vendedor <> '')::int AS vendedores,
      count(*)::int AS total,
      count(*) FILTER (WHERE com_erro)::int AS corrigidas,
      count(*) FILTER (WHERE 'cep' = ANY (campos))::int AS cep,
      count(*) FILTER (WHERE erro_referencia)::int AS referencia,
      count(*) FILTER (WHERE 'bairro' = ANY (campos))::int AS bairro
    FROM propostas
    GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'dashboard', jsonb_build_object(
      'total_propostas', resumo.total,
      'total_corrigidas', resumo.corrigidas,
      'taxa_erro_pct', CASE WHEN resumo.total > 0
        THEN round(100.0 * resumo.corrigidas / resumo.total, 1) ELSE 0 END,
      'tempo_medio_ms', tempo.tempo_medio,
      'top_erro', COALESCE((SELECT e.tipo FROM erros e ORDER BY e.total DESC, e.tipo LIMIT 1), '-'),
      'supervisores_ativos', resumo.supervisores
    ),
    'dashboard_supervisores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'supervisor', d.supervisor,
        'equipe', d.equipe,
        'total_propostas', d.total,
        'total_corrigidas', d.corrigidas,
        'taxa_erro_pct', CASE WHEN d.total > 0 THEN round(100.0 * d.corrigidas / d.total, 1) ELSE 0 END
      ) ORDER BY CASE WHEN d.total > 0 THEN round(100.0 * d.corrigidas / d.total, 1) ELSE 0 END, d.supervisor, d.equipe)
      FROM dash_sup d
    ), '[]'::jsonb),
    'operadores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'vendedor', o.vendedor,
        'equipe', CASE WHEN cardinality(o.equipes) > 1
          THEN 'Múltiplas equipes: ' || array_to_string(o.equipes, ', ')
          ELSE COALESCE(o.equipes[1], '') END,
        'supervisor', CASE WHEN cardinality(o.supervisores) > 1
          THEN 'Múltiplos supervisores: ' || array_to_string(o.supervisores, ', ')
          ELSE COALESCE(o.supervisores[1], '') END,
        'total_propostas', o.total,
        'total_corrigidas', o.corrigidas,
        'taxa_erro_pct', CASE WHEN o.total > 0 THEN round(100.0 * o.corrigidas / o.total, 1) ELSE 0 END,
        'erros_cep', o.cep,
        'erros_logradouro', o.logradouro,
        'erros_bairro', o.bairro,
        'erros_cidade', o.cidade,
        'erros_uf', o.uf,
        'erros_numero', o.numero,
        'erros_complemento', o.complemento,
        'erros_referencia', o.referencia
      ) ORDER BY o.vendedor)
      FROM op o
    ), '[]'::jsonb),
    'supervisores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'supervisor', s.supervisor,
        'equipe', s.equipe,
        'total_vendedores', s.vendedores,
        'total_propostas', s.total,
        'total_corrigidas', s.corrigidas,
        'taxa_erro_pct', CASE WHEN s.total > 0 THEN round(100.0 * s.corrigidas / s.total, 1) ELSE 0 END,
        'erros_cep', s.cep,
        'erros_referencia', s.referencia,
        'erros_bairro', s.bairro
      ) ORDER BY CASE WHEN s.total > 0 THEN round(100.0 * s.corrigidas / s.total, 1) ELSE 0 END, s.supervisor, s.equipe)
      FROM sup s
    ), '[]'::jsonb)
  )
  INTO v_out
  FROM resumo, tempo;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_correcao_analytics(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_correcao_analytics(date, date) TO service_role;
