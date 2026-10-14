# Auditoria completa e blindagem — 3F Dashboard Correção

**Data:** 2026-10-14
**Escopo:** todas as 22 abas, 48 endpoints de `functions/api`, migrations Supabase e syncs externos que gravam no banco.
**Baseline:** `6dde5e7` (gate OK, 117 arquivos / 614 testes).
**Resultado:** gate OK, 160+ arquivos / 1080+ testes, migrations 040–047 aplicadas e validadas em produção.

Este documento é a referência das **regras canônicas** de cálculo. Toda aba que
mostra a mesma métrica tem de seguir a mesma regra; os guards de
`scripts/check-regressao.sh` e os testes listados em cada seção falham se alguém
reintroduzir a regra antiga.

---

## 1. Resumo executivo

| Antes | Depois |
|---|---|
| Abas de correção não fechavam entre si (Roboadm entrava em Erros/Evolução/Insights/RR, não no Dashboard) | Todas consolidam por proposta e excluem o Roboadm pela mesma função |
| Vendedor de proposta com mais de um humano escolhido ao acaso (ordenação por `id` UUID) | Ordem cronológica por `created_at`, último humano vence |
| Respostas antigas sobrescreviam filtros novos em 10+ telas | Contador de geração + `AbortController` |
| Endpoints de dados checavam só o papel, não a aba do perfil | `requireAba`/`requireAlgumaAba` em todos os endpoints de dados |
| Anon conseguia gravar em `sms_previo_eficiencia` e executar RPCs de sessão | Fechado (040, 047) e validado em produção |
| Export Excel da fatia cortado em 80 linhas; enqueue podia pegar dados de outra proposta | Corrigido, com teste |
| INSS só considerava atestado isolado > 15 dias | Soma do mesmo CID-raiz em 60 dias |
| Pausa estourava só por tempo | Tempo **ou** ocorrências (alimentação > 1, descanso > 2) |
| Login pré-carregava o chunk de gráficos (435 KB) | Login carrega só runtime, vendor e UI |

---

## 2. Regras canônicas (fonte única)

### 2.1 Propostas de correção (`correcao_logs`)

| Regra | Implementação única | Quem usa |
|---|---|---|
| Uma proposta conta uma vez | `consolidarPorProposta` em `shared/correcaoPropostas.ts` | todas as abas de correção, RR, analytics |
| Roboadm fora dos totais | `propostasSemRobo` (consolida e remove `^roboadm\d*$`) | Erros, Evolução, Insights, `analyticsOverview`, `cuboAggregates`, `rrKpis` |
| Vendedor atribuído | último humano em ordem cronológica | cubo, Erros, Insights, `operadoresRecorte` |
| Ordem das passagens | `created_at` asc (nunca `id`: é UUID) | toda leitura paginada de `correcao_logs` |
| Tempo médio | só passagens humanas | Dashboard, Evolução, analytics |
| Dia | `data_venda` em UTC (`gte dT00:00Z`, `lte dT23:59:59.999Z`) | todas |
| Erros "% das propostas" | propostas com o erro ÷ total de propostas (não soma 100%) | Erros |
| Linhas de fechamento | "Sem vendedor", "Sem supervisor", "Não identificado" e "Outros" sempre visíveis | Operadores, Supervisores, analytics |

### 2.2 SMS (`sms_eficiencia`)

| Regra | Implementação |
|---|---|
| Linha por proposta | a mais recente por `retorno_atualizado_em` (`pickSmsMaisRecente`) — SMS, Evolução, Insights e RR |
| Sucesso | inclui "OS Concluído sem bilhete" (decisão de negócio 2026-10-14). Na aba Disparos isso é `base_tim` e **não** entra no sucesso TIM |
| Robô | excluído também no SMS da Evolução/Insights |
| Universo do RR | `fluxo in (portabilidade, esim)`, igual à aba SMS |

### 2.3 Portabilidade

| Regra | Implementação |
|---|---|
| Chave de proposta | `normPropostaKey` (TS) ≡ `portabilidade_norm_key` (SQL, 043): `3F-N` e `N` são a mesma |
| Fechados TIM | Portado + Falha + Cancelada (`fechados_tim`). `fechados` legado continua incluindo `base_tim` |
| Etapa "Fechados" do funil de conversão | usa `fechados_tim` e fica contida em "Com ticket" |
| Em voo | universo − fechados − quebras (vivo = coorte) |
| Meta/projeção em mês congelado | denominador `universo_cohort` |
| Taxa vs histórico | P+F / (P+F+C), sem `base_tim` |
| Histórico por contagem | `taxa_portado_pct = null` quando não há universo (nunca troca de base) |

### 2.4 Telefonia (EVA)

| Regra | Implementação |
|---|---|
| Robô | fora da jornada em Operação, Chamadas e Hora (nome e login) |
| DROP do dia | host único por `id_user` em `sanitizeDropDiscagens` |
| Espera/ociosidade média | `fmtEspera` (segundos), nunca `fmtDur` (minutos truncados) |
| Pausa | `estourosPausa` / `estouroPausaJornada`: alimentação 1×20m, descanso 2×10m, demais 8m somadas; ocorrência a mais estoura |
| Sinônimos de pausa | `chavePausaRegulamentar` (almoço/refeição → alimentação; intervalo → descanso) |
| KPI da casa | cor pelo estouro + "N operadores estourados" |
| Sábado | expediente 09–16h (7 faixas) no nowcast |
| Período > 31 dias | mantém os 31 mais recentes e sinaliza `truncado` |
| `ociosidade_hora_camp` OUTROS | vira ACAO_BKO quando o dia tem operadores BKO (sync publica OUTROS) |

### 2.5 RR

| Regra | Implementação |
|---|---|
| Taxa de erro | por proposta, sem robô (= aba Erros) |
| Reconcile em TODAS | EVA só Port × Gross SMS (Port) |
| Crivo em TODAS | só Port no numerador e no denominador |
| Meta em janela que cruza o mês | meta/peso do mês de cada dia; mês passado usa a meta cadastrada ou avisa |
| Ponte no live | mesma régua do hero (nowcast) |
| CPC dos comparativos | cpc ÷ tabuladas |
| Alerta preditivo | chance de bater a meta < 35% a partir das 12h BRT (crítico < 15%) |

### 2.6 Atestados e advertências

| Regra | Implementação |
|---|---|
| Dias | `diasEfetivos` (fim − início + 1); divergência com `quantidade_dias` é sinalizada |
| Absenteísmo | sem recusados, igual no gerencial e por supervisor |
| INSS | isolado > 15 dias **ou** soma do mesmo CID-raiz (3 caracteres) com intervalo ≤ 60 dias > 15; prazo a partir do 16º dia acumulado + 5 (`functions/_lib/atestadosInss.ts`, view `atestados_inss_cadeias`) |
| Selo INSS | mesmo cálculo e recorte (ano corrente BRT) do gerencial |
| Duplicidade de arquivo | hash em qualquer colaborador |
| Nomes | tokens completos, ≥ 2 palavras, sem acentos (`atestadosNomes.ts`) |
| E-mail de decisão | só na transição de status |
| Notificação de advertência | claim condicional `enviando` (045) |
| LGPD | supervisor continua vendo o CID dos atestados que criou (decisão: ambiente local seguro) |

---

## 3. Segurança

| Item | Estado |
|---|---|
| Autorização por aba | `requireAba` / `requireAlgumaAba` (`functions/_lib/auth.ts`), regra única com o front em `shared/abasCatalog.ts`; admin e secret passam; sem perfil segue o papel |
| `cubo-query` | exige aba compatível com a **tabela** pedida |
| Rate limit | por IP em todos; por usuário (`allowRateForUser`) nos endpoints de IA; Map em memória com limpeza e teto |
| Login | 8 falhas por e-mail+IP, 50 por e-mail (não dá para travar o admin de fora); inativo só após a senha; troca de senha derruba a sessão |
| Headers | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` também em `/api/*` |
| Uploads | MIME pelos bytes (`sniffAtestadoMime`), miniatura só JPEG, tamanho antes de decodificar |
| IA | PII mascarada no Copiloto, contexto limitado, erro da OpenAI nunca repassado, modelo por env (`OPENAI_MODEL_WORKHORSE`/`OPENAI_MODEL_REASONING`), fallback só em 429/5xx/timeout, cache do briefing 10 min |
| CSV | neutraliza `= + @ \t \r` e `-` não numérico |
| Banco | anon sem EXECUTE em RPCs de sessão, sem SELECT em views, sem acesso a `sms_previo_eficiencia` |

O polling global do `AdminLayout` só consulta `eva-data` quando o perfil tem a aba Operação.

---

## 4. Migrations aplicadas (validadas em 2026-10-14)

| Migration | Projeto | Validação em produção |
|---|---|---|
| 040 hardening grants/RLS | Dashboard `ayhrwxsxqddpeukydblz` | anon executa 0 RPCs de sessão; 0 views legíveis |
| 041 login_user | Dashboard | só `login_user(text,text,text)`; nonce zerado na troca de senha |
| 042 analytics por proposta | Dashboard | exclui robô; anon sem EXECUTE |
| 043 chave normalizada | **Qigger** `hatjmfkjnjbghmolveph` | anon 42501; `3F-123` ≡ `123`; `chave_normalizada: true` |
| 044 período/INSS | Dashboard | constraint validada; view sem anon |
| 045 claim de notificação | Dashboard | coluna e status `enviando` |
| 046 índices RR | Dashboard | 3 índices válidos |
| 047 policies legadas | Dashboard | só `service_write_*`; anon/authenticated sem privilégio |
| 048 policies anon inertes | Dashboard | ver seção 8 |

Consultas de verificação (somente leitura) para repetir após qualquer mudança:

```sql
-- Nenhuma tabela pública aberta para anon/authenticated via policy
SELECT DISTINCT c.relname
FROM pg_class c, unnest(ARRAY['anon','authenticated']) r, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p') AND has_table_privilege(r, c.oid, p)
  AND (NOT c.relrowsecurity OR EXISTS (
    SELECT 1 FROM pg_policies pol WHERE pol.schemaname = 'public' AND pol.tablename = c.relname
      AND pol.roles && ARRAY['public','anon','authenticated']::name[] AND pol.cmd IN ('ALL', p)));
-- esperado: vazio

-- anon não executa RPCs de sessão
SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  AND (p.proname LIKE '%by_session' OR p.proname IN ('login_user','verify_dashboard_session','logout_dashboard_session'))
  AND has_function_privilege('anon', p.oid, 'EXECUTE');
-- esperado: vazio
```

---

## 5. Syncs externos que gravam no Dashboard

| Script | Projeto | Chave | Estado |
|---|---|---|---|
| `3F_ISize_Bot_Processamento/scripts/sync_sms_eficiencia.py` | VM | `SUPABASE_SERVICE_KEY` (service_role) | ok |
| `.../sync_toutbox_entrega.py` | VM | service_role | ok |
| `.../sync_mailing_saude.py` | VM | service_role | ok |
| `.../sync_eva_operacao.py` | VM | service_role | ok; publica `OUTROS` em `ociosidade_hora_camp` (tratado no front) |
| `3FScore_Qigger1/scripts/enriquecer_sms_previo.py` | Mac | `DASHBOARD_SUPABASE_KEY_SERVICE` (antes caía na anon e recebia 401 desde a 033) | corrigido |
| `3FScore_Qigger1/scripts/recovery_ticket_status.py` | Mac | idem | corrigido |

**Regra:** script que grava no Dashboard usa sempre a chave `service_role`. A anon
key não tem acesso a nenhuma tabela pública desde a 033/040/047.

---

## 6. Números que mudaram de propósito

Avisar quem acompanha os indicadores: as mudanças abaixo são correções para as
abas fecharem entre si, não regressões.

- Taxa de erro e Gross do RR: caem (sem passagens duplicadas, sem robô, só Port/eSIM).
- Tempo médio: muda (sem robô).
- Erros: coluna "% das propostas" não soma 100%.
- Operadores: linha "Sem vendedor"; a soma passa a bater com o Dashboard.
- SMS na Evolução e no Insights: sem robô.
- Crivo em TODAS: só Port (sobe).
- Funil de portabilidade: "Fechados" sem `base_tim`; "em voo" sem quebras.
- Pausas: mais operadores marcados (ocorrência a mais).
- Hora em sábado: meta/hora = meta do dia ÷ 7.
- Atestados: dias sem recusados; INSS conta alertas (inclui somas por CID).

---

## 7. Blindagem anti-regressão

1. **Gate obrigatório** (`npm run gate`, também na CI a cada push): guards +
   typecheck + ESLint + testes + build.
2. **Guards** em `scripts/check-regressao.sh` travam cada regra das seções 2 e 3
   (ex.: `propostasSemRobo` nas abas, `estouroPausaJornada` no `ofensorOp`,
   `requireAba` nos endpoints, `requireGestao(` proibido nos endpoints de dados,
   migrations 043/044/045/047 presentes, polling do layout condicionado à aba).
3. **Testes de paridade**: `shared/correcaoPropostas.test.ts` (fecha com
   `aggregateCorrecao`), `abasCatalog` (front × back), `portabilidadePropostaKey`
   (TS × SQL), `functions/api/abasEnforcement.test.ts` (~200 casos de aba/papel/limite).
4. **Testes de corrida**: `src/pages/overviewRace.test.tsx`.
5. **Ops pós-deploy**: `npm run test:ops` e as consultas da seção 4.

Ao mudar uma regra canônica: altere a função única, atualize o teste de paridade
e o guard correspondente **no mesmo commit**, e registre aqui.

---

## 8. Pendências — encerradas em 2026-10-14

| Pendência | Resolução |
|---|---|
| KV dedicado | Namespace `3f-dashboard-rate-limit` ligado como `RATE_LIMIT` no `wrangler.jsonc`. Grava só em login e IA (`usaKvNoBucket`), pois o plano Free aceita 1.000 gravações/dia; leituras com polling seguem com limite em memória. Também passa a valer para o cache do briefing do RR e o dedupe do alerta P0. |
| `auth-bootstrap` e headers legados | Removidos. A sessão é só pelo cookie `__Host-3f-dashboard-session`; `sessionCredentials` ignora `X-Dashboard-*`; `ALLOW_LEGACY_SESSION_HEADERS` saiu do `wrangler.jsonc`. Seguro porque a sessão dura 12 h e o corte foi em 2026-09-09. Quem ainda tiver nonce antigo na memória tem o valor limpo pelo `AuthGuard`. O script `validar-portabilidade-reconciliacao.mjs` envia o cookie. |
| Reenvio de atestado recusado | O mesmo colaborador pode reenviar o arquivo de um atestado recusado (`escolherDuplicidadeHash`). Atestado ativo de qualquer colaborador ou recusado de outro colaborador continua bloqueando, e o 409 do servidor vira "Confirmar mesmo assim" na tela. |
| Modal da aba Erros com robô | O detalhe exclui passagens do Roboadm, igual à contagem. |
| `atestados-stats` | Liberado para quem vê Atestados ou Inteligência (só contadores, sem PII) e com cache de 60 s por isolate. |
| `portabilidadeEnqueue` com `limit 50` | Busca por substring com teto de 1.000 antes do filtro exato. |
| Policies anon inertes | Migration `048_policies_legadas_anon.sql` remove as policies legadas de `correcao_logs`, `dashboard_users` (inclui UPDATE anon) e `sms_eficiencia`, e revoga os privilégios de anon/authenticated nessas tabelas e nas views. Não há usuários em `auth.users`, e front e syncs usam `service_role`. |
| Disparos no escopo mês | Mantido: as leituras já têm teto de páginas e marcam `truncado` (≈ 49 subrequests no pior caso, dentro do limite de 50). |
| Quebras/BKO por status × fatia do funil | Mantido: são definições diferentes e a nota da reconciliação explica. |

## 9. Revisão final (pré-commit)

Revisão independente de todo o diff. Corrigido com teste:

- Inteligência: período parcial não fica mais no cache quando a requisição é abortada.
- `usePeriodoCompartilhado`: duas mudanças no mesmo evento não misturam início/fim (`useRef`).
- `diasEntreInfo` e `listarDiasHistoricos`: ano digitado pela metade não trava a UI (sem laço de centenas de milhares de dias).
- Erros: spinner do modal não fica preso com período incompleto.
- Badge de atestados no layout: 403 tratado (sem rejeição não tratada a cada 2 min).

Verificado sem problema: mapeamento endpoint → abas contra todas as chamadas do front,
regras duplicadas entre módulos (robô, dedupe SMS, chave de portabilidade, pausa, INSS),
padrões de corrida, mascaramento de PII e headers.

## 10. Decision matrix (aba Disparos)

Medição em produção (Qigger, 30 dias): 40.874 retornos de 15.153 propostas, 6.669
registros na fila, 209 cancelamentos concluídos.

| Problema | Antes | Depois |
|---|---|---|
| Truncamento | Lia 4.000 retornos e 3.000 da fila: a janela de 7 dias cobria ~5 dias e a do mês, menos de 1 semana | RPC `portabilidade_matrix_resumo` (049) agrega no banco: exato, 1 chamada, ~0,3 s (7 dias) a ~3 s (30 dias) |
| Unidade | Linhas (`consult_portability`: 6.763 linhas = 574 propostas) | Propostas distintas; registros no tooltip. Chave = `normPropostaKey` sem o sufixo da operação (`-consult`, `-open`...) |
| Fila | Ações somavam executadas e descartadas (cancel: 1.285 descartadas × 209 concluídas) | Tabela por ação × status: executada, pendente, descartada, BKO/outros e % executada |
| Categorias | "Rejeição ... via SMS" caía em "sem resposta" (acento); 39% em "outros" | Normalização sem acento, ordem explícita e 6 categorias novas; 0% em "outros" no período medido |
| Sem ação | `no_action` (51% dos retornos) invisível | KPI e card com os motivos (crivo, pré-pago, já portado, score...) |
| Versão | Mais frequente na janela | Vigente = a mais recente; comparativo de decisões vigente × anterior em p.p. |
| Loops | Não aparecia | Propostas com > 20 retornos; o alerta conta só as de `no_action` (inesperadas). Ciclos de reconsulta de entrega/ticket são esperados |

Os cards com lista fecham com o total: o balde "Demais" agrega o que passa do top 12.
Enquanto a 049 não estiver aplicada, o endpoint usa a leitura paginada antiga e mostra o
aviso de truncamento. Qualquer erro diferente de "função ausente" retorna 502, sem cair
silenciosamente na leitura truncada.

Desempenho da 049: a normalização é feita inline (`LATERAL`), porque funções auxiliares com
`SET search_path` não são incorporadas e custavam ~7 s; as chaves usam `COLLATE "C"`.
