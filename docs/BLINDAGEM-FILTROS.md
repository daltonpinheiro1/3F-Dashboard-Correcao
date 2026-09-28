# Blindagem: todo cálculo segue o filtro aplicado

Regra do produto: em qualquer aba com filtro (data, operação/campanha, supervisor,
equipe, nome), **todo número exibido é calculado sobre o recorte filtrado**. Quando a
fonte não tem granularidade para recortar (ex.: dado só por dia, sem hora/operador),
o bloco mostra um aviso explícito em vez de exibir o total da casa como se fosse o
recorte.

Cada regra abaixo tem um guard em `scripts/check-regressao.sh` (bloco
"Blindagem: todo cálculo segue o filtro aplicado"). O gate (`npm run gate`) falha se
o trecho protegido sumir; alterar a regra exige atualizar código, teste, guard e este
documento juntos.

## 1. Volume de correção: proposta conta uma vez

`correcao_logs` grava **uma linha por passagem do robô**; uma proposta pode ter
várias. Contar linhas inflava "enviados/total" (~3,6x em 60 dias).

- `shared/correcaoPropostas.ts` → `consolidarPorProposta`: agrupa por `proposta_id`,
  une `tipos_erro`/`campos_alterados` (tem erro se qualquer passagem teve), usa a
  última passagem humana para os campos de vendedor.
- Aplicado em `functions/_lib/cuboAggregates.ts`, `functions/_lib/analyticsOverview.ts`,
  Erros, Insights e Evolução. Tempo médio continua por passagem.
- `Roboadm*` (`/^roboadm\d*$/i`) fica fora de totais, rankings e Toutbox.
- Guards: `consolidarPorProposta(...)`, `ehVendedorRobo ... continue`,
  `if (!robo) bumpTbx`, teste "conta cada proposta uma vez".

## 2. Toutbox segue o período filtrado

Antes havia janela fixa (`toutboxDias: 60`). Agora Toutbox usa o mesmo `de/ate` do
filtro em Dashboard, Operadores, Supervisores, Insights e Evolução.

- Guard: falha se `toutboxDias` ou `tbxDias` reaparecer em `src/` ou `functions/`.

## 3. Paginação estável

PostgREST com offset/Range precisa de desempate único, senão linhas repetem ou somem
entre páginas: `correcao_logs.id`, `sms_eficiencia.id`, `toutbox_entrega.proposta_id`.

- Guard: `const chave = CHAVE_UNICA[table];` em `functions/api/cubo-query.ts`.

## 4. EVA: busca por nome (Hora, Chamadas, Operação)

`serie_hora`, `hora_supervisor` e `tab_hora` não têm operador; `hora_operador` tem.
Com busca ativa, séries, KPIs, heatmap, leaderboard e DROP são reconstruídos a partir
dos operadores encontrados. Blocos só disponíveis para a casa inteira somem ou são
zerados sob busca, com aviso âmbar.

- `dropTotalCanonico(..., { busca })` pula o atalho `tab_hora` e soma só os logins.
- Heatmap da Operação: `semDropHora` sob busca; Chamadas: ociosidade por hora oculta.
- Guards: `serieDeOperadores(opsBusca)`, `weekHist: weekHistCasa`,
  `{ busca: Boolean(q) }` nas três páginas, `mostrarOciosidadeHora={!q}`,
  `semDropHora: Boolean(q)`, teste "com busca soma só os logins achados".

## 5. Discagens: filtro de hora

Alertas de queda seguem campanha **e** hora. Blocos sem dado por hora mostram
`AvisoRecorte` e "—"; o CSV do dia inteiro sai como `*_dia_inteiro.csv`.

## 6. Disparos, Matrix, Inteligência e RR

- `/api/portabilidade-matrix?dias=N&ate=AAAA-MM-DD` ancora a janela no fim do dia
  `ate` (dias anteriores a hoje BRT). O teto vai na mesma consulta: continuam 3
  fetches (limite de 50 subrequests do Pages Free). Resposta traz `janela`.
- Disparos usa a janela do mês filtrado (mês passado de 31 dias exclui o dia 1, com
  rótulo, pois a matrix aceita no máximo 30 dias).
- Inteligência: CPC/DROP vêm do período (`carregarEvaPeriodo`); itens só ao vivo são
  rotulados.
- RR: bloco TIM rotulado pelo horizonte; refresh ao vivo só em `realtime`.

## 7. Advertências e Atestados

KPIs e contagens facetadas refletem o recorte. Filtros vão ao servidor **dentro do
escopo de autorização existente** (`criado_por_email` para não-admin):

- `parseAdvertenciasListFiltros` valida datas ISO, nível e tamanho do texto; o texto
  é sanitizado (remove `*%(),"\`) antes do `ilike`.
- Atestados: `?totais=1` (uma contagem por status) e `?anos=1`; ano inválido → 400.

## 8. Evolução, SMS, Operadores e Erros

- Evolução: janela de exatamente N dias vs janela anterior; Toutbox restrito ao
  universo filtrado.
- SMS: supervisor/equipe da URL recortam a página toda; rodapé "SOMA DO RANKING".
- Operadores: agregação por recorte (match exato de supervisor/equipe).
- Erros: modal com uma linha por proposta (até 5000).

## Como validar

```bash
npm run gate          # guards + typecheck + lint + vitest + build
npx vitest run        # suíte completa
```

Observação: `tsc -p .` não verifica nada (tsconfig raiz só tem references); use
`npm run typecheck`.
