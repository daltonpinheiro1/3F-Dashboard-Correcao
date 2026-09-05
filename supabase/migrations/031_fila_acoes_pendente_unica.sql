-- Anti-duplicata: no máximo uma ação ativa (pendente/executando/bko) por proposta+acao.
-- ⚠️  Rodar no Supabase QIGGER (fila_acoes_portabilidade), não no do dashboard.
--
-- Preview (opcional, só leitura):
--   SELECT proposta_isize, acao, count(*) AS n, array_agg(id ORDER BY id) AS ids
--   FROM public.fila_acoes_portabilidade
--   WHERE status IN ('pendente', 'executando', 'bko')
--   GROUP BY 1, 2
--   HAVING count(*) > 1;
--
-- 1) Neutraliza extras. Mantém 1 linha:
--    executando > bko > pendente; depois created_at mais novo; depois id maior.
--    Extras → status cancelado (worker não pega; não infla falha TIM).

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY proposta_isize, acao
      ORDER BY
        CASE status
          WHEN 'executando' THEN 1
          WHEN 'bko' THEN 2
          WHEN 'pendente' THEN 3
          ELSE 9
        END,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM public.fila_acoes_portabilidade
  WHERE status IN ('pendente', 'executando', 'bko')
    AND proposta_isize IS NOT NULL
    AND btrim(proposta_isize) <> ''
),
dups AS (
  SELECT id FROM ranked WHERE rn > 1
)
UPDATE public.fila_acoes_portabilidade AS f
SET
  status = 'cancelado',
  resultado_mensagem = left(
    concat_ws(
      ' | ',
      nullif(btrim(coalesce(f.resultado_mensagem, '')), ''),
      'dashboard_dedup: duplicata ativa (proposta+acao); mantida a linha em execução/mais recente'
    ),
    400
  )
FROM dups
WHERE f.id = dups.id
  AND f.status IN ('pendente', 'executando', 'bko');

-- 2) Unique parcial — só depois do cleanup.
CREATE UNIQUE INDEX IF NOT EXISTS fila_acoes_pendente_unica
  ON public.fila_acoes_portabilidade (proposta_isize, acao)
  WHERE status IN ('pendente', 'executando', 'bko')
    AND proposta_isize IS NOT NULL
    AND btrim(proposta_isize) <> '';
