-- ============================================================
-- 044 — Atestados: ordem do período + agrupamento INSS por CID-raiz
-- Projeto: ayhrwxsxqddpeukydblz (Dashboard Correção)
--
-- 1) CHECK NOT VALID: novas escritas não aceitam data_fim < data_inicio;
--    linhas legadas continuam até o saneamento abaixo + VALIDATE.
-- 2) View somente leitura (security_invoker) espelhando functions/_lib/atestadosInss.ts:
--    mesmo colaborador (matrícula, senão nome normalizado) + CID-raiz (3 primeiros
--    caracteres sem espaço, maiúsculo), unidade dias, sem recusados; novo início em até
--    60 dias após o maior fim anterior continua a cadeia; dias sobrepostos contam uma vez.
--    Atestados sem CID ficam de fora (alerta isolado > 15 dias é calculado na aplicação).
--
-- Saneamento (rodar manualmente ANTES do VALIDATE; só leitura na 1ª query):
--
--   SELECT id, protocolo, colaborador_nome, data_inicio, data_fim, quantidade_dias, status
--   FROM public.atestados
--   WHERE data_inicio IS NOT NULL AND data_fim IS NOT NULL AND data_fim < data_inicio
--   ORDER BY data_inicio;
--
--   -- Após revisar caso a caso (datas invertidas na digitação/IA):
--   -- UPDATE public.atestados
--   --    SET data_inicio = data_fim, data_fim = data_inicio
--   --  WHERE data_inicio IS NOT NULL AND data_fim IS NOT NULL AND data_fim < data_inicio;
--
--   -- ALTER TABLE public.atestados VALIDATE CONSTRAINT atestados_periodo_ordem_chk;
-- ============================================================

ALTER TABLE public.atestados
  DROP CONSTRAINT IF EXISTS atestados_periodo_ordem_chk;

ALTER TABLE public.atestados
  ADD CONSTRAINT atestados_periodo_ordem_chk
  CHECK (data_inicio IS NULL OR data_fim IS NULL OR data_fim >= data_inicio) NOT VALID;

CREATE OR REPLACE VIEW public.atestados_inss_cadeias
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    a.id,
    a.protocolo,
    a.colaborador_nome,
    a.status,
    CASE
      WHEN NULLIF(btrim(a.colaborador_matricula), '') IS NOT NULL
        THEN 'mat:' || btrim(a.colaborador_matricula)
      ELSE 'nome:' || translate(
        lower(regexp_replace(btrim(a.colaborador_nome), '\s+', ' ', 'g')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      )
    END AS chave_colaborador,
    upper(left(regexp_replace(COALESCE(a.cid, ''), '\s', '', 'g'), 3)) AS cid_raiz,
    a.data_inicio,
    GREATEST(
      COALESCE(a.data_fim, a.data_inicio + (GREATEST(ceil(COALESCE(a.quantidade_dias, 0)), 1)::int - 1)),
      a.data_inicio
    ) AS fim
  FROM public.atestados a
  WHERE a.status <> 'recusado'
    AND a.unidade_periodo = 'dias'
    AND a.data_inicio IS NOT NULL
    AND regexp_replace(COALESCE(a.cid, ''), '\s', '', 'g') <> ''
),
ordenada AS (
  SELECT
    b.*,
    max(b.fim) OVER (
      PARTITION BY b.chave_colaborador, b.cid_raiz
      ORDER BY b.data_inicio, b.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) AS fim_max_anterior
  FROM base b
),
marcada AS (
  SELECT
    o.*,
    (o.fim_max_anterior IS NULL OR o.data_inicio - o.fim_max_anterior > 60) AS nova_cadeia,
    CASE
      WHEN o.fim_max_anterior IS NULL OR o.data_inicio - o.fim_max_anterior > 60 THEN o.data_inicio
      ELSE GREATEST(o.data_inicio, o.fim_max_anterior + 1)
    END AS inicio_novo
  FROM ordenada o
),
numerada AS (
  SELECT
    m.*,
    GREATEST(0, m.fim - m.inicio_novo + 1) AS dias_novos,
    sum(CASE WHEN m.nova_cadeia THEN 1 ELSE 0 END) OVER (
      PARTITION BY m.chave_colaborador, m.cid_raiz
      ORDER BY m.data_inicio, m.id
    ) AS cadeia_n
  FROM marcada m
),
acumulada AS (
  SELECT
    n.*,
    sum(n.dias_novos) OVER (
      PARTITION BY n.chave_colaborador, n.cid_raiz, n.cadeia_n
      ORDER BY n.data_inicio, n.id
    ) AS acc_ate
  FROM numerada n
)
SELECT
  chave_colaborador,
  cid_raiz,
  cadeia_n,
  min(colaborador_nome) AS colaborador_nome,
  count(*)::int AS atestados,
  array_agg(protocolo ORDER BY data_inicio, id) AS protocolos,
  array_agg(id ORDER BY data_inicio, id) AS atestado_ids,
  min(data_inicio) AS inicio,
  max(fim) AS fim,
  sum(dias_novos)::int AS dias_acumulados,
  min(
    CASE
      WHEN acc_ate - dias_novos <= 15 AND acc_ate > 15
        THEN inicio_novo + (15 - (acc_ate - dias_novos))::int
    END
  ) AS dia16,
  sum(dias_novos) > 15 AS alerta_inss
FROM acumulada
GROUP BY chave_colaborador, cid_raiz, cadeia_n;

COMMENT ON VIEW public.atestados_inss_cadeias IS
  'Cadeias INSS por colaborador + CID-raiz (recorrência <= 60 dias). Somente leitura; espelho de functions/_lib/atestadosInss.ts.';

REVOKE ALL ON TABLE public.atestados_inss_cadeias FROM anon;
REVOKE ALL ON TABLE public.atestados_inss_cadeias FROM authenticated;
GRANT SELECT ON TABLE public.atestados_inss_cadeias TO service_role;

NOTIFY pgrst, 'reload schema';
