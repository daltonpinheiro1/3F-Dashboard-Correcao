# Auditoria Técnica — 3F Dashboard Correção

**Data:** 2026-08-26  
**Escopo:** Full-stack, QA, Web, IA, SQL, Segurança  
**Build:** guards OK · 29 testes unitários · vite build OK  
**Typecheck:** falhas pré-existentes em Hora/Discagens (WIP); Advertencias corrigido

---

## Resumo executivo

| Área | Nota | Estado |
|------|------|--------|
| Arquitetura | B+ | Pages Functions + Postgres service_role + sessão nonce (013) |
| Segurança | B | Endurecida nesta entrega (P0/P1); RLS depende de migrations aplicadas |
| Advertências | A- | Fluxo completo: criação, DP, notificação, entrega, export |
| IA narrativa | B+ | Prompt refinado; admin-only; validação pós-resposta |
| Testes | B- | 7 suites unitárias; e2e smoke limitado |
| Performance web | B | Lazy routes; jspdf dynamic; AdvertenciasPage grande (1470 linhas) |
| Escalabilidade | B- | list 2000 sem paginação; rate limit in-memory |

---

## P0 — Crítico

| ID | Achado | Status |
|----|--------|--------|
| P0-1 | RLS aberto em `advertencias` se migration 013 ausente | **Mitigado** — 016 reforça REVOKE; validar no Supabase |
| P0-2 | Secret aceito em `X-Dashboard-Session` | **Corrigido** — só `Authorization: Bearer` |
| P0-3 | RPCs `list_dashboard_users` / `toggle_user_active` sem auth | **Corrigido** — migration 016 DROP |

---

## P1 — Alto

| ID | Achado | Status |
|----|--------|--------|
| P1-1 | GET `/api/advertencias` sem admin | **Corrigido** — `requireAdmin` |
| P1-2 | Mass assignment POST/PATCH | **Corrigido** — `advertenciasValidate.ts` allowlist |
| P1-3 | IA aberta a qualquer sessão | **Corrigido** — `requireAdmin` narrativa |
| P1-4 | Brute force login RPC | **Backlog** — rate limit DB |
| P1-5 | Rate limit in-memory Workers | **Backlog** — KV/WAF |
| P1-6 | Nonce em localStorage (XSS) | **Backlog** — HttpOnly cookie |
| P1-7 | PDF base64 sem limite | **Corrigido** — máx 5 MB + magic `%PDF` |
| P1-8 | create-user Path B com senha admin | **Backlog** — remover após 013 estável |
| P1-9 | Enumeração via verify_session | **Backlog** — resposta genérica |

---

## P2 — Médio (backlog)

- Paginação GET advertências (>2000 registros)
- Split `AdvertenciasPage.tsx` em componentes
- `tsc` no CI (bloquear deploy com erros TS)
- e2e `/advertencias` (criar, aprovar, entrega)
- CSP completa em `public/_headers`
- Remover fallback Storage JSON em produção
- Tabela `advertencias_audit` para trilha imutável
- Logout server-side (invalidar nonce)
- Lazy `DashboardPage` no entry bundle

---

## Engenharia Full-Stack

**Pontos fortes**
- Single-store advertências via API (sem localStorage PII)
- Guards anti-regressão (`check-regressao.sh`)
- Tipos centralizados em `advertenciasEscala.ts`
- Separação lib/service/pages/functions

**Dívida**
- `AdvertenciasPage.tsx` monolítico (~1470 linhas)
- React Query instalado mas não usado
- Padrão Supabase direto em 8+ pages (depende de RLS)

---

## QA e Confiabilidade

**Cobertura atual (29 testes)**
- `advertenciasEscala`, `advertenciasDraft`, `advertenciasNotificacao`, `advertenciasExport`
- `dashboardSession`, `operadoresCatalog`, `evaDash.drop`

**Lacunas**
- Zero teste de Functions API
- e2e smoke não cobre advertências
- `advertenciasPdf`, `advertenciasService` sem testes

**Guards expandidos** — todas suites `src/lib/*.test.ts` + `advertencia-notificar.ts`

---

## Engenharia Web

| Métrica | Valor (gzip) |
|---------|--------------|
| Entry | 18.8 KB |
| AdvertenciasPage | 17.5 KB |
| jspdf (lazy) | 128.8 KB |
| recharts (lazy) | 109.6 KB |

**A11y:** modais sem focus trap; tabs sem ARIA; alertas sem `role="alert"` — backlog P2.

**SEO:** `noindex` correto para app interno.

---

## IA aplicada

**Narrativa jurídica (`advertencia-narrativa.ts`)**
- Modelo: `gpt-4o-mini`, temp 0.25, JSON mode
- Melhorias aplicadas: sem cláusula CLT completa no contexto; categoria Siscad; validação 40–280 palavras; detecção eco art. 482
- Custo: rate 12 req/min/IP — migrar para quota por usuário

**Oportunidades**
- RAG com histórico do colaborador (escala pedagógica) no prompt
- Agente de revisão DP (checklist automático antes de aprovar)
- Sumário executivo para export Excel via IA

---

## Banco de Dados

**Migrations aplicáveis:** 013 → 014 → 015 → **016**

| Migration | Conteúdo |
|-----------|----------|
| 013 | Sessão nonce, RLS advertencias |
| 014 | security_invoker views, RLS SMS |
| 015 | notificacao_* + entrega_* |
| 016 | RLS guard, drop RPCs legadas, índices compostos |

**Índices novos (016):** `(status, entrega_status)`, notificação pendente parcial, `(matricula, data)`.

**Modelagem:** JSONB `anexos` sem schema — considerar CHECK ou tabela filha.

---

## Segurança e escalabilidade

**Secrets (Cloudflare Pages)**
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `DASHBOARD_INSIGHT_SECRET` (só Bearer server-side)
- `OPENAI_API_KEY`
- `ADVERTENCIAS_EMAIL_*`, `CF_ACCOUNT_ID`, `CF_API_TOKEN` (quando ativar e-mail)

**Rotacionar** `DASHBOARD_INSIGHT_SECRET` após deploy desta correção (P0-2).

**Escalabilidade:** Workers stateless OK até ~2000 advertências; depois paginação + cache EVA catalog.

---

## Checklist pós-deploy

Ver **[OPS-FINAL.md](./OPS-FINAL.md)** — status completo e comandos.

1. ~~Aplicar migration **016**~~ ✅
2. ~~Rotacionar `DASHBOARD_INSIGHT_SECRET`~~ ✅ (2026-08-26)
3. E-mail: aguardando domínio CF (`ADVERTENCIAS_EMAIL_ENABLED=false`)
4. **Logout/login** de todos os usuários — comunicar equipe
5. Validar RLS advertências (SQL em OPS-FINAL.md)

---

## Correções incluídas neste commit

- Secret removido do header de sessão
- GET advertências + IA narrativa + hora-insight: admin-only
- Allowlist POST/PATCH advertências
- Validação PDF anexo e-mail
- Prompt IA refinado + pós-validação
- Export `EntregaModo` TypeScript
- Migration 016 RLS guard
- Guards expandidos
- Documentação OPS atualizada

---

## Design System & Mobile (2026-08-26)

### Componentes UI (`src/components/ui/`)

| Componente | Uso |
|------------|-----|
| `TabBar` | Abas padronizadas ARIA + scroll horizontal mobile |
| `ChipBar` | Filtros segmentados (campanha, etc.) |
| `SegControl` | Wrapper compatível com Seg legado |
| `KpiCard` | Cards de métricas premium |
| `PageAlert` | Alertas com `role="alert"` / `aria-live` |
| `ModalShell` | Modal acessível (Escape, focus, safe-area) |

### Mobile / iOS / Android

- `viewport-fit=cover` + `safe-area-inset` (notch, home indicator)
- `min-h-[100dvh]` / `100dvh` — altura real em mobile browsers
- Touch targets mínimos **44px** (botões, inputs, tabs)
- `-webkit-tap-highlight-color: transparent`
- `touch-action: manipulation` — reduz delay de 300ms
- `prefers-reduced-motion` respeitado
- Tabelas com `.table-scroll` + momentum scroll iOS
- Modais bottom-sheet no mobile, centered no desktop
- `theme-color` + PWA meta tags (Apple/Android)

### Páginas migradas para TabBar/SegControl

- AdvertenciasPage, DiscagensPage, HoraPage, OperacaoPage
- AdminLayout: header blur, sidebar a11y, page-enter animation
- LoginPage: redirect se sessão válida, gradiente brand
- App: Dashboard lazy-loaded (entry −24% gzip)

### CSS premium

- Tokens `--brand-navy`, shadows, easing expo
- Cards com gradientes sutis em KPIs warn/critical
- Animações: pageEnter, slideUp, cardEnter, hover-lift ( só desktop hover)

### Backlog UI (próxima iteração)

- Migrar ChamadasPage Seg → SegControl
- DetailModal advertências → ModalShell
- Split AdvertenciasPage em subcomponentes
- Bottom nav mobile (opcional)
- `tsc` no CI
