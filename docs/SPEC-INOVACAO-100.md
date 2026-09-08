# Spec — Inovação 100% (sem mexer no número da casa)

**Repo:** `3F_Dashboard_Correcao`  
**Baseline prod:** commit `3a5174a` (DROP canônico + Pulse Chamadas + hist 31d)  
**Data:** 2026-09-08  
**Objetivo:** implementar todos os casos de inovação já mapeados (INV-01…INV-24) **ao lado** dos KPIs atuais. Nenhum PR altera fórmula canônica.

---

## 0. Contratos imutáveis (gate)

Se um PR muda o valor exibido de CPC%, DROP%, TMA, tabuladas, Portados hoje ou consolidado SMS, **rejeitar**.

| KPI | Fórmula / função | Onde vive |
|---|---|---|
| CPC% casa | `round(1000 × cpc / tabuladas) / 10` → `cpcOperacional` / `kpisVolumeChamadas` | Chamadas, Operação, Hora |
| DROP casa | bit `desligue_agente` → `dropFromDiscagens` → `resolveOpDrop` / `dropTotalCanonico` | Chamadas, Operação, Hora, Discagens (agente) |
| TMA | `Σ(tma × chamadas) / Σ(chamadas)` → `tmaPonderadoJornada` | Chamadas, Operação, Hora |
| Deslogue | `tempoDeslogueEfetivo` (anti-fantasma) → `tempoPerdidoCanonico` | Chamadas, Operação, Hora |
| SMS Portados hoje | `isPortadoComBilhete` | `smsRules.ts` / SmsPage hero |
| SMS consolidado | `isPortadoConsolidado` (bilhete **ou** OS Concluído sem ticket, se não bloqueia) | SmsPage gráfico / Gross |
| Disparos Portado | `ticket_status === 'portado'` → fatia `sucesso_portado` | `portabilidadeAndamento.classificarFatia` |
| Disparos sucesso TIM | Portado + Falha parcial | funil `sucesso_tim` / meta |

**Não misturar:** EVA Storage ≠ Supabase SMS ≠ cohort CE/Disparos.  
**Não vazar:** Controle DP / advertências para `OperacaoPage`.  
**Não recalcular:** CPC das Discagens (dialer) para “parecer” o da Chamadas.

Gate de cada PR: `npm run typecheck` + vitest do recorte + smoke e2e se UI de rota mudar.

---

## 1. Inventário — 24 casos em 6 PRs

| PR | Nome | Casos | Risco de número |
|---|---|---|---|
| **PR1** | Inteligência dual + P0 | INV-01, INV-02, INV-03, INV-17 | Zero (só adiciona campos) |
| **PR2** | Pulse Hora + Discagens | INV-05, INV-06, INV-07, INV-09, INV-10 | Zero |
| **PR3** | Ação cruzada (crise, coaching, deep link) | INV-08, INV-11, INV-12, INV-13, INV-15 | Crivo Hora muda **rótulo/fonte VB**, não CPC% |
| **PR4** | What-if calibrado | INV-14, INV-16 | Zero (projeção) |
| **PR5** | Selos Portado Disparos ≠ SMS | INV-18, INV-19, INV-20 | Zero (copy + links) |
| **PR6** | Estrutural / ops | INV-21…INV-24 | Zero |

Ordem obrigatória: **PR1 → PR2 → PR3 → PR4 → PR5**. PR6 só depois, ou em paralelo se não tocar EVA.

---

## 2. Glossário (para a UI não mentir)

- **CPC dialer** — `eva.discagens.kpis.cpc_rate` (aba Discagens / snapshot atual da Inteligência).
- **CPC casa** — ranking da Chamadas (`kpisVolumeChamadas`). É o número da operação.
- **DROP dialer** — `desligue_agente_rate` no bloco discagens.
- **DROP casa** — `dropTotalCanonico` (mesmo da Chamadas).
- **Sucesso TIM** — Portado + Falha parcial no cohort Disparos.
- **Portado (Disparos)** — só ticket `Portado`.
- **Portados hoje (SMS)** — só bilhete (`isPortadoComBilhete`).
- **Consolidado SMS** — bilhete + OS Concluído sem ticket (corte TIM ~18/08).
- **What-if `cpc_por_operador_hora`** — no código atual é **vendas/op/hora**, não CPC%. A UI deve passar a dizer isso.

---

## PR1 — Inteligência dual + P0 real

### INV-01 — Snapshot: CPC/DROP casa **além** do dialer

**Arquivos:** `src/lib/inteligenciaSnapshot.ts`, `src/lib/inteligenciaSnapshot.test.ts`

**Fazer:**
- Manter `cpc_pct` e `eva_drop_pct` = dialer (compat + testes atuais).
- Adicionar `cpc_casa_pct`, `cpc_casa_n`, `tabuladas_casa`, `eva_drop_casa_pct`, `eva_drop_casa_n`, `eva_drop_casa_tabs`.
- Calcular casa com as **mesmas** funções da Chamadas:
  - `kpisVolumeChamadas({ ranking: eva.ranking_operadores, tabsHumanas })`
  - `dropTotalCanonico(jornada, dropFromDiscagens(eva), dropPorLogin(ofensores))`
- Não substituir o radar existente; campos novos são opt-in.

**Aceite:**
- Teste: ranking 13 CPC / 20 tabs → `cpc_casa_pct === 65` e `cpc_pct` (dialer) permanece 60 no fixture atual.
- Teste: `extractDisparosSignals` continua a não inventar P0 aqui (P0 é INV-03).
- `cpcOperacional(13, 20)` não é reimplementado no snapshot.

### INV-02 — UI: dois números + alerta > 2 p.p.

**Arquivos:** `src/pages/InteligenciaPage.tsx`, `src/components/inteligencia/IntelStatsPanel.tsx`

**Fazer:**
- No radar / hero: linha **Dialer** e linha **Casa** (CPC% e DROP%).
- Se `|cpc_casa_pct - cpc_pct| > 2` **ou** `|drop_casa - drop_dialer| > 2` → callout âmbar: “Desvio > 2 p.p. — a operação usa o número da Chamadas”.
- Link: `Ir à Chamadas` → `/chamadas`.
- Inputs manuais do radar **não** apagam os valores casa no refresh; casa vem do snapshot.

**Aceite:**
- Com dialer 60 e casa 65, o alerta aparece.
- Com diferença 1.5, o alerta **não** aparece.
- O score do radar **não muda** neste PR (ainda consome `cpc_pct` dialer). Sinal extra `cpc_casa` só como texto, não como weight novo (evita mudar o score sem spec de pesos).

### INV-03 — `portabilidade_p0` deixa de ser 0 fixo

**Arquivos:** `inteligenciaSnapshot.ts`, `portabilidadeProjecoes.ts` (`detectarOportunidades`)

**Fazer:**
- No job de disparos do snapshot, além de `/api/portabilidade-disparos`, buscar `/api/portabilidade-funil` do mês BRT corrente (mesmo contrato da aba Disparos).
- `portabilidade_p0 = detectarOportunidades({ g, rec, funil }).filter(o => o.prioridade === 'P0').length`
- Se o funil falhar: `p0 = 0` + aviso `"P0 indisponível (funil)"` — **não** cair em `mais_24h`.
- Preencher o input `P0 port.` do radar com esse valor (editável depois).

**Aceite:**
- Fixture com `g.bko = 51` → pelo menos 1 P0 (`bko_alto`).
- Fixture com bko 10 e sem demais gatilhos → 0.
- Teste unitário em `extractFunilP0` (função pura nova) — não depender de fetch.

### INV-17 — Deep link da Inteligência

**Arquivos:** `InteligenciaPage.tsx`

**Query:**
```
/inteligencia?tab=coaching|radar|simulador&login=&nome=&sugestao=
```

**Fazer:**
- Ler `useSearchParams` na montagem (espelho `/operacao?login=`).
- `tab` válido → seleciona a sub-aba.
- Se `tab=coaching` e `sugestao` → preenche o campo; **não** POST automático.
- Se `login`/`nome` → tags visíveis no form de coaching.

**Aceite:**
- Abrir `/inteligencia?tab=coaching&nome=Ana` cai em Coaching com nome preenchido.
- Tab inválida ignora e fica no default (`radar`).

---

## PR2 — Pulse na Hora e nas Discagens

### INV-05 — Pulse compacto na Hora

**Arquivos:** `src/pages/HoraPage.tsx`, reusar `ChamadasPulse` **ou** extrair `PulseOperacional` compartilhado se o layout da Hora for mais estreito.

**Conteúdo (mesmo motor):**
- CPC do **intervalo** (`cpcOperacional` da série filtrada) — já é o número da aba.
- DROP **do dia** (`dropTotalCanonico`) — rótulo explícito “DROP dia”, nunca “DROP da hora” neste card.
- TMA ponderado da jornada do recorte.
- Barras hora via `pulseHoraCpcDrop(payloadsPulseHora(...), campanha)`.

**Aceite:**
- Hist multi-dia: pulse usa **só o último dia** (`payloadsPulseHora`) — teste já existe em `chamadasVisoes.test.ts`; não somar o recorte.
- CPC do hero da Hora **não muda**.

### INV-06 — `StaleDataBanner` na Hora

**Arquivos:** `HoraPage.tsx`  
Reusar `StaleDataBanner` + `isLiveStale` / `liveAgeMs` (mesmo Discagens/Chamadas).

**Aceite:** live com `updated_at` > limiar mostra banner; hist não mostra.

### INV-07 — Aviso: hist da Hora = 1 dia

**Fato já no código:** `loadHist` chama `fetchEvaPeriodo(dateFrom, dateFrom)` e um effect força `dateTo = dateFrom`.

**Fazer:** banner permanente no hist: “Esta aba lê **um fechamento diário**. Para 31 dias use Chamadas / Operação / Discagens.”

**Aceite:** com filtro global 01–31, a Hora continua 1 dia **e** o texto explica. Não expandir o fetch.

### INV-09 — Pulse de funil nas Discagens

**Arquivos:** `DiscagensPage.tsx`, componente novo `src/components/discagens/DiscagensPulse.tsx`

**Conteúdo (números **já** calculados na página):**
- Loc% (só horas/dias com discadas reais — regra atual)
- CPC% **dialer** (não casa)
- DROP agente (`desligue_agente_rate`)
- Selo INV-10 logo abaixo

**Aceite:** os três percentuais no Pulse === cards atuais. Snapshot visual não inventa discadas = alo.

### INV-10 — Selo tabuladas Discagens vs ranking/jornada

**Fazer:** chamar `auditTabsVsJornada(discagens.kpis.tabuladas, jornada)` (ou ranking da Chamadas se jornada vazia).  
Texto: “Dialer N tabs · jornada M · Δ”. **Não** substituir `tabuladas` do funil.

**Aceite:** busca ativa → `comparavel === false` (já na função). Delta ≠ 0 não altera KPI.

---

## PR3 — Ação cruzada

### INV-08 — Crivo “por intervalo” deixa de misturar o dia

**Arquivo:** `HoraPage.tsx` (`crivoPct`)

**Bug atual:** com `hora !== 'todas'`, VB/aprovadas vêm da **jornada do dia**.

**Fazer:**
- Fonte do intervalo: `serie_hora` já mergeada (`mergeSerie`) filtrada pela hora — campos `vb` e `aprovadas`.
- `crivo = vb > 0 ? round(1000 * aprovadas / vb) / 10 : null`
- Se `vb === 0`: mostrar **—** e caption “sem VB neste intervalo (jornada do dia não é usada)”.
- Caption sempre: “Crivo = aprovadas ÷ VB da série da hora. CPC% continua CPC÷tabs.”

**Aceite:**
- Fixture série 14h vb=10 aprovadas=4 → crivo 40.0; jornada do dia vb=100 **não** entra.
- CPC% do recorte inalterado.
- Teste puro extraído para `horaPageData.ts` (`crivoDoIntervalo`).

### INV-11 — Modo crise na grade Discagens

**Constante:** `DROP_ALERTA_PCT = 25` (`operacaoVisoes.ts`) — **não duplicar**.

**Fazer:**
- Célula/linha com DROP agente ≥ 25% e amostra > 0 → fundo/rótulo “CRISE”.
- Clique → `/chamadas?ofensor=<tab>&campanha_op=<op>` (INV-15).

**Aceite:** 24.9% não pinta; 25.0% pinta. Link preserva campanha do filtro global.

### INV-12 — Outlier → Registrar coaching

**Arquivo:** `DiscagensPage.tsx` (lista `outliers_conversao`)

**Fazer:** botão “Registrar coaching” →  
`/inteligencia?tab=coaching&login=<id ou login>&nome=<nome>&sugestao=<template>`

Template (exemplo):  
`Outlier conversão · {fila} · {nome} · tabs={n} · conv={x}% vs pares.`

**Aceite:** não cria coaching sozinho (respeita INV-17). Supervisor confirma o POST.

### INV-13 — Card coaching na Chamadas

**Arquivo:** `ChamadasPage.tsx` / `ChamadasPulse.tsx`

**Fazer:** se `ofensorTabPrincipal` abaixo da meta **ou** DROP casa ≥ 25%:
- Card: tab, CPC%, DROP%, CTA “Coaching na Inteligência” (mesmo query INV-17).
- CTA “Ficha” → `/operacao?login=` do pior operador daquela tab **se** houver login; senão só coaching.

**Aceite:** sem ofensor / DROP ok → card oculto. Não altera `pctCpc` / `drop.rate`.

### INV-15 — `?ofensor=` na Chamadas

**Espelho:** `OperacaoPage` `?login=`.

**Query:** `/chamadas?ofensor=<nome da tab>&campanha_op=PORTABILIDADE|MIGRACAO|ACAO_BKO`

**Fazer:** no mount, `setOfensor({ nome, campanha_op })` se a tab existir no recorte; senão ignore + toast “tab não encontrada neste recorte”.

**Aceite:** URL compartilhável; limpar filtro remove query. Não conflita com busca `q`.

---

## PR4 — What-if calibrado (só projeção)

### INV-16 — Matar o `1.4` fixo

**Arquivos:** `InteligenciaPage.tsx` (`runSimulator`), `inteligenciaSnapshot.ts`, testes.

**Verdade:** `simulateWhatIf` usa `cpc_por_operador_hora` como **vendas por operador por hora** (`perdaBruta = rem × ritmo × horas_restantes`).

**Fazer:**
- Função pura `ritmoVendasOpHora({ vendasHoje, nOperadores, horasDecorridas })`:
  - `horasDecorridas = expediente - horasRestantesExpediente()` (mín 0.5)
  - `ritmo = vendasHoje / max(nOps,1) / horasDecorridas`
  - clamp `[0.2, 8]`; se amostra inválida (`nOps < 1` ou `vendasHoje === 0`) → **fallback 1.4** e aviso “ritmo insuficiente — usando 1.4”
- UI: label **“Vendas / op / hora (derivado)”**, valor editável, nunca esconder o número enviado à API.
- Enviar `elasticidade` e `n_operadores` como hoje.
- **Não** alterar `simulateWhatIf` além de aceitar o ritmo derivado (fórmula do motor permanece).

**Aceite:**
- 12 vendas, 6 ops, 6h decorridas → ritmo 0.333… clamp ≥ 0.2.
- 0 vendas → 1.4 + aviso.
- Teste unitário do ritmo; teste de regressão do `simulateWhatIf` (p50/p10/p90) inalterado para o mesmo input.

### INV-14 — What-if de deslogue na Chamadas

**Só projeção. Não mexe em DROP nem CPC.**

**Fazer:** função `projecaoDeslogueFantasma(jornada, tmaSeg)`:
- `bruto = Σ tempo_deslogue_raw` (se o campo existir) **ou** documentar que só há efetivo
- `efetivo = tempoPerdidoCanonico(jornada)`
- `fantasmaSeg = max(0, bruto - efetivo)` — se não houver bruto, usar 0 e texto “sem série bruta”
- `chamadasAMais = tmaSeg > 0 ? fantasmaSeg / tmaSeg : 0`
- Card: “Se o deslogue fantasma não existisse: ~N chamadas a mais neste recorte (projeção).”

**Aceite:** `tempoDeslogueEfetivo` **não** muda. Card some se fantasma = 0.

---

## PR5 — Selos Disparos ≠ SMS

Nada de unificar volume. Só rotular e cruzar.

### INV-18 — Selo no card Portado (Disparos)

**Arquivos:** `DisparosPage.tsx`, `GerencialCommandCenter.tsx`

**Copy obrigatória (1 linha):**
> Portado = `ticket_status = Portado`. Falha parcial é fatia à parte. OS Concluído sem ticket **não** entra. Meta / sucesso TIM = Portado + Falha parcial. **≠ SMS consolidado.**

**Aceite:** o número `g.portados` permanece `counts.sucesso_portado`. Link “Ver SMS” → `/sms`.

### INV-19 — Selo no SMS

**Arquivo:** `SmsPage.tsx` (hero Portados hoje + bloco consolidado)

**Copy:**
> Portados hoje = só bilhete (`isPortadoComBilhete`). Consolidado / Gross = bilhete **ou** OS Concluído sem ticket (corte TIM ~18/08). **≠ card Portado de Disparos.**

**Aceite:** `portadosHoje` e `totalSucesso` inalterados. Link “Ver Disparos” → `/disparos`.

### INV-20 — Cruzamento explícito no RR (se ainda genérico)

**Arquivo:** `RrPage.tsx` / `rr-360` UI

Já existem `portados_gross_dia` vs `portados_hoje_brt`.  
**Fazer:** tooltip de 1 linha apontando INV-18/19. Sem terceiro KPI.

---

## PR6 — Estrutural (100% engenharia; depois do produto)

### INV-21 — Split `DiscagensPage`

Padrão Hora PR1–3: extrair `discagensPageData.ts` (merges, Loc%, selo) + `DiscagensPulse` + grade. Página vira orquestração.  
**Aceite:** typecheck; nenhum KPI do funil muda (golden test dos totais atuais).

### INV-22 — Checklist IA pré-aprovação DP

Advertências: antes de aprovar, checklist gerado (campos obrigatórios + narrativa). Admin ainda confirma.  
**Aceite:** não auto-aprova. Atores continuam da sessão (gate 01).

### INV-23 — React Query: adotar ou remover

Hoje `QueryClientProvider` existe e as páginas EVA usam `useState` + fetch.  
**Decisão neste PR (uma só):**
- **A)** EVA live/hist via `useQuery` (staleTime 20–30s, `queryKey` com tab/campanha/datas), **ou**
- **B)** remover `@tanstack/react-query` e o provider.

Não deixar os dois. Preferência: **A** só em Discagens/Chamadas/Hora se o split (INV-21) já saiu.

### INV-24 — E-mail Cloudflare

Ops: secrets CF Email quando o domínio estiver pronto. Código só se `docs/AUDITORIA-EVOLUTIVA` Path e-mail for ligado. Fora disto, N/A no merge.

---

## 3. Matriz de testes (mínimo por PR)

| PR | Testes novos (vitest) | UI / e2e |
|---|---|---|
| 1 | `extractEvaSignals` casa vs dialer; `extractFunilP0`; ritmo não entra ainda | Radar mostra 2 CPC |
| 2 | pulse hist = último dia (já existe); audit Discagens | Pulse visível live |
| 3 | `crivoDoIntervalo`; DROP 25 pintado | `?ofensor=` abre furo |
| 4 | `ritmoVendasOpHora`; `simulateWhatIf` golden; deslogue fantasma | Label vendas/op/h |
| 5 | nenhum cálculo | copy visível nos dois cards |
| 6 | golden totais Discagens após split | smoke rotas |

Regressão obrigatória: `chamadasVisoes.test.ts`, `operacaoVisoes.test.ts`, `smsRules.test.ts`, `portabilidadeAndamento.test.ts`.

---

## 4. Fora de escopo (não é “caso de inovação”)

- Recalcular CPC Discagens para igualar Chamadas
- Contar Falha parcial no card verde Portado
- Contar OS Concluído sem ticket em Disparos ou em Portados hoje
- Expandir hist da Hora para 31 dias
- Mudar pesos do Risk Radar (salvo spec futura)
- HttpOnly nonce / WAF (app interno)
- Worker Qigger / Toutbox / eSIM (outro repo)

---

## 5. Definition of Done (100%)

- [ ] INV-01…INV-20 em produção (PR1–PR5)
- [ ] INV-21 feito **ou** explicitamente adiado com issue
- [ ] INV-22…INV-24 feitos **ou** N/A documentado (ops)
- [ ] Nenhum delta em CPC/DROP/TMA/SMS nos testes golden
- [ ] Copiloto/RR continuam a dizer: Portados hoje = bilhete; consolidado SMS ≠ Disparos Portado

---

## 6. Sequência de implementação sugerida (sessões)

1. PR1 (snapshot + UI dual + P0 + query Inteligência) — desbloqueia coaching e radar honesto  
2. PR2 (Pulse Hora/Discagens + banners) — consistência visual  
3. PR3 (crivo + crise + `?ofensor=` + CTAs coaching) — ação  
4. PR4 (ritmo real + deslogue fantasma) — projeção  
5. PR5 (selos portados) — o ponto Disparos vs SMS  
6. PR6 quando o produto estiver estável  

Começar pelo **INV-01**: sem CPC/DROP casa no snapshot, o restante da Inteligência continua cego.
