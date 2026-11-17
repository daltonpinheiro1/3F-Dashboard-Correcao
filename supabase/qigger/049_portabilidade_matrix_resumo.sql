-- ⚠️  Projeto Qigger hatjmfkjnjbghmolveph — decision matrix agregada no banco.
-- Substitui a leitura paginada do /api/portabilidade-matrix (teto de 4.000 retornos,
-- ~40 mil em 30 dias): contagens exatas por proposta, fila por status, motivos,
-- versões [mx:] e propostas em loop, numa chamada só.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'retornos_reprocessamento'
  ) THEN
    RAISE EXCEPTION 'Projeto Supabase incorreto — use hatjmfkjnjbghmolveph (Qigger), não o dashboard.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_retornos_processed_at
  ON public.retornos_reprocessamento (processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fila_acoes_created_at
  ON public.fila_acoes_portabilidade (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fila_acoes_executed_at
  ON public.fila_acoes_portabilidade (executed_at DESC);

CREATE OR REPLACE FUNCTION public.portabilidade_matrix_resumo(
  p_since timestamptz,
  p_until timestamptz DEFAULT NULL,
  p_loop_min int DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
-- Chave da proposta = normPropostaKey/portabilidade_norm_key sem o sufixo da operação
-- (-consult, -open, ...). Motivo = sem a tag [mx:], primeiro trecho antes de '|', 72 caracteres.
-- COLLATE "C" nas chaves: DISTINCT/GROUP BY sem custo de collation de idioma.
-- Tudo inline (LATERAL): função auxiliar com SET search_path não é incorporada e custa ~7 s em 40 mil linhas.
WITH ret AS MATERIALIZED (
  SELECT
    coalesce(nullif(btrim(r.operacao), ''), '(vazio)') COLLATE "C" AS operacao,
    CASE WHEN k.s = '' THEN '' WHEN k.d ~ '^[0-9]+$' THEN '3F-' || k.d WHEN left(k.s, 3) = '3F-' THEN k.s ELSE '3F-' || k.s END COLLATE "C" AS proposta,
    coalesce(nullif(left(btrim(regexp_replace(split_part(
      regexp_replace(m.t, '\[mx:[0-9a-fA-F]{6,16}\]', '', 'g'), '|', 1
    ), '\s+', ' ', 'g')), 72), ''), '(sem motivo)') COLLATE "C" AS motivo,
    lower(substring(coalesce(r.adjustments, '') FROM '\[mx:([0-9a-fA-F]{6,16})\]')) COLLATE "C" AS versao,
    r.processed_at
  FROM public.retornos_reprocessamento r
  CROSS JOIN LATERAL (
    SELECT regexp_replace(regexp_replace(coalesce(r.proposta_isize, ''), '^\s+|\s+$', '', 'g'), '-[a-z_]+$', '') AS s
  ) k0
  CROSS JOIN LATERAL (SELECT k0.s, regexp_replace(k0.s, '^3[fF]-', '') AS d) k
  CROSS JOIN LATERAL (
    SELECT coalesce(CASE WHEN position('motivo=' IN lower(r.adjustments)) > 0
      THEN substr(r.adjustments, position('motivo=' IN lower(r.adjustments)) + 7) ELSE r.adjustments END, '') AS t
  ) m
  WHERE r.processed_at >= p_since
    AND (p_until IS NULL OR r.processed_at < p_until)
),
fila AS MATERIALIZED (
  SELECT
    coalesce(nullif(btrim(f.acao), ''), '(vazio)') COLLATE "C" AS acao,
    coalesce(nullif(btrim(f.status), ''), '(vazio)') COLLATE "C" AS status,
    CASE WHEN k.s = '' THEN '' WHEN k.d ~ '^[0-9]+$' THEN '3F-' || k.d WHEN left(k.s, 3) = '3F-' THEN k.s ELSE '3F-' || k.s END COLLATE "C" AS proposta,
    coalesce(nullif(left(btrim(regexp_replace(split_part(
      regexp_replace(coalesce(f.retorno_motivo, f.resultado_mensagem, ''), '\[mx:[0-9a-fA-F]{6,16}\]', '', 'g'), '|', 1
    ), '\s+', ' ', 'g')), 72), ''), '(sem motivo)') COLLATE "C" AS motivo,
    f.created_at,
    f.executed_at
  FROM public.fila_acoes_portabilidade f
  CROSS JOIN LATERAL (
    SELECT regexp_replace(regexp_replace(coalesce(f.proposta_isize, ''), '^\s+|\s+$', '', 'g'), '-[a-z_]+$', '') AS s
  ) k0
  CROSS JOIN LATERAL (SELECT k0.s, regexp_replace(k0.s, '^3[fF]-', '') AS d) k
  WHERE (f.created_at >= p_since AND (p_until IS NULL OR f.created_at < p_until))
     OR (f.acao = 'cancel' AND f.status = 'concluida'
         AND f.executed_at >= p_since AND (p_until IS NULL OR f.executed_at < p_until))
),
fila_janela AS MATERIALIZED (
  SELECT * FROM fila WHERE created_at >= p_since AND (p_until IS NULL OR created_at < p_until)
),
canc AS MATERIALIZED (
  SELECT proposta, motivo FROM fila
  WHERE acao = 'cancel' AND status = 'concluida'
    AND executed_at >= p_since AND (p_until IS NULL OR executed_at < p_until)
),
-- Motivos com balde "Demais" (top 12 por propostas) para os cards fecharem com o total.
mot_acao_rank AS (
  SELECT motivo, row_number() OVER (ORDER BY count(DISTINCT proposta) DESC, motivo) AS rk
  FROM ret WHERE operacao <> 'no_action' GROUP BY motivo
),
mot_sem_rank AS (
  SELECT motivo, row_number() OVER (ORDER BY count(DISTINCT proposta) DESC, motivo) AS rk
  FROM ret WHERE operacao = 'no_action' GROUP BY motivo
),
mot_fila_rank AS (
  SELECT motivo, row_number() OVER (ORDER BY count(DISTINCT proposta) DESC, motivo) AS rk
  FROM fila_janela GROUP BY motivo
),
loops AS (
  SELECT proposta, count(*) AS retornos,
         mode() WITHIN GROUP (ORDER BY operacao) AS operacao,
         mode() WITHIN GROUP (ORDER BY motivo) AS motivo,
         max(processed_at) AS ultimo
  FROM ret GROUP BY proposta HAVING count(*) > p_loop_min
)
SELECT jsonb_build_object(
  'versao_rpc', 1,
  'loop_min', p_loop_min,
  'retornos', (SELECT jsonb_build_object('linhas', count(*), 'propostas', count(DISTINCT proposta)) FROM ret),
  'decisoes', coalesce((
    SELECT jsonb_agg(jsonb_build_object('label', operacao, 'linhas', l, 'propostas', p) ORDER BY p DESC, operacao)
    FROM (SELECT operacao, count(*) l, count(DISTINCT proposta) p FROM ret GROUP BY operacao) x
  ), '[]'::jsonb),
  'motivos', coalesce((
    SELECT jsonb_agg(jsonb_build_object('label', b, 'linhas', l, 'propostas', p) ORDER BY (b = 'Demais'), p DESC, b)
    FROM (
      SELECT CASE WHEN k.rk <= 12 THEN r.motivo ELSE 'Demais' END b, count(*) l, count(DISTINCT r.proposta) p
      FROM ret r JOIN mot_acao_rank k USING (motivo) WHERE r.operacao <> 'no_action' GROUP BY 1
    ) x
  ), '[]'::jsonb),
  'sem_acao_motivos', coalesce((
    SELECT jsonb_agg(jsonb_build_object('label', b, 'linhas', l, 'propostas', p) ORDER BY (b = 'Demais'), p DESC, b)
    FROM (
      SELECT CASE WHEN k.rk <= 12 THEN r.motivo ELSE 'Demais' END b, count(*) l, count(DISTINCT r.proposta) p
      FROM ret r JOIN mot_sem_rank k USING (motivo) WHERE r.operacao = 'no_action' GROUP BY 1
    ) x
  ), '[]'::jsonb),
  'fila', coalesce((
    SELECT jsonb_agg(jsonb_build_object('acao', acao, 'status', status, 'linhas', l, 'propostas', p) ORDER BY acao, status)
    FROM (SELECT acao, status, count(*) l, count(DISTINCT proposta) p FROM fila_janela GROUP BY acao, status) x
  ), '[]'::jsonb),
  'fila_total', (SELECT jsonb_build_object('linhas', count(*), 'propostas', count(DISTINCT proposta)) FROM fila_janela),
  'fila_motivos', coalesce((
    SELECT jsonb_agg(jsonb_build_object('label', b, 'linhas', l, 'propostas', p) ORDER BY (b = 'Demais'), p DESC, b)
    FROM (
      SELECT CASE WHEN k.rk <= 12 THEN f.motivo ELSE 'Demais' END b, count(*) l, count(DISTINCT f.proposta) p
      FROM fila_janela f JOIN mot_fila_rank k USING (motivo) GROUP BY 1
    ) x
  ), '[]'::jsonb),
  'cancelamentos', jsonb_build_object(
    'linhas', (SELECT count(*) FROM canc),
    'propostas', (SELECT count(DISTINCT proposta) FROM canc),
    'motivos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('label', motivo, 'linhas', l, 'propostas', p) ORDER BY l DESC, motivo)
      FROM (SELECT motivo, count(*) l, count(DISTINCT proposta) p FROM canc GROUP BY motivo ORDER BY l DESC LIMIT 60) x
    ), '[]'::jsonb)
  ),
  'versoes', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'versao', v.versao, 'linhas', v.l, 'propostas', v.p, 'desde', v.desde, 'ate', v.ate,
      'decisoes', (
        SELECT jsonb_agg(jsonb_build_object('label', operacao, 'propostas', p2) ORDER BY p2 DESC, operacao)
        FROM (SELECT operacao, count(DISTINCT proposta) p2 FROM ret WHERE ret.versao = v.versao GROUP BY operacao) d
      )
    ) ORDER BY v.ate DESC)
    FROM (
      SELECT versao, count(*) l, count(DISTINCT proposta) p, min(processed_at) desde, max(processed_at) ate
      FROM ret WHERE versao IS NOT NULL GROUP BY versao
    ) v
  ), '[]'::jsonb),
  'loops', jsonb_build_object(
    'total', (SELECT count(*) FROM loops),
    'retornos', (SELECT coalesce(sum(retornos), 0) FROM loops),
    'por_operacao', coalesce((SELECT jsonb_object_agg(operacao, c) FROM (SELECT operacao, count(*) c FROM loops GROUP BY operacao) x), '{}'::jsonb),
    'top', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'proposta', proposta, 'retornos', retornos, 'operacao', operacao, 'motivo', motivo, 'ultimo', ultimo
      ) ORDER BY retornos DESC, proposta)
      FROM (SELECT * FROM loops ORDER BY retornos DESC, proposta LIMIT 15) t
    ), '[]'::jsonb)
  )
);
$$;

REVOKE ALL ON FUNCTION public.portabilidade_matrix_resumo(timestamptz, timestamptz, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portabilidade_matrix_resumo(timestamptz, timestamptz, int) TO service_role;

NOTIFY pgrst, 'reload schema';
