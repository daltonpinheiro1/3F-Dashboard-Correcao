# Auditoria Técnica Evolutiva — 3F Dashboard Correção

**Data:** 2026-08-27  
**Escopo:** Full-stack, QA, Web, Segurança, SQL, UX, IA  
**Baseline:** pós PR Hora 1–3 + audit/logout/lockout (`588b3e2`) + hardening atores/TOCTOU (este ciclo)  
**Validação:** guards + typecheck + vitest + build

---

## 1. Resumo Executivo

| Dimensão | Nota | Comentário |
|----------|------|------------|
| Maturidade geral | **B+ / A-** | App interno maduro; P0/P1 críticos fechados |
| Segurança | **A-** | Sessão nonce, audit, lockout, atores server-side |
| Escalabilidade | **B** | Paginação advertências OK; Discagens/Hora ainda grandes |
| UX / Design | **B+** | Design system `ui/` consistente; páginas monólitos |
| Testes | **B** | 46 unit + guards + e2e smoke/fluxo |
| IA aplicada | **B** | Narrativa jurídica admin-only; e-mail ainda off |

**Principais riscos residuais:** monólitos `DiscagensPage` (~2.5k) / `HoraPage` (~1.7k); nonce em localStorage (XSS); React Query instalado sem uso; e-mail CF pendente.

**Oportunidades:** checklist IA pré-aprovação DP; split Discagens; observabilidade Pages (logs estruturados).

---

## 2. Diagnóstico por área

### Arquitetura Full-Stack
- **Forte:** Pages Functions + service_role; single-store advertências; split Hora PR1–3; libs tipadas.
- **🟡 Médio:** `DiscagensPage` / `SmsPage` / `ChamadasPage` monólitos; React Query morto; Pattern Supabase direto em 8+ pages (depende RLS).
- **🟢 Baixo:** `AdvertenciasPage` ~1170 linhas (parcialmente componentizado).

### QA e Confiabilidade
- **Forte:** `check-regressao.sh`, 46 testes, e2e advertências mock.
- **🟡 Médio:** pouco teste de Functions HTTP reais; zero teste de Discagens.
- **🟢 Baixo:** vitest warn esbuild/oxc (ruído toolchain).

### Performance Web
- **Forte:** lazy routes, jspdf/recharts lazy, keyset list.
- **🟡 Médio:** HoraPage chunk ~79 KB gzip ainda pesado (recharts).
- **🟢 Baixo:** CSP já presente em `_headers`.

### Segurança e DevOps
- **Feito neste ciclo e anterior:** audit 017, logout server, lockout login, logout sem hang, atores sessão, TOCTOU entrega, Path B create-user off.
- **🟡 Médio:** nonce localStorage (HttpOnly = esforço alto); rate limit Workers in-memory; Path B desligado (ok se 013 estável).
- **Deploy:** Cloudflare Pages; VM Oracle = bots EVA (fora deste repo).

### Banco de Dados
- Migrations 013–017 aplicadas; `advertencias_audit` + `dashboard_login_attempts`.
- **🟢:** índices compostos 016; sem FK audit→advertencias de propósito (imutável).
- **🟡:** sem trigger DB audit (só Functions — SQL direto não audita).

### UI/UX e Acessibilidade
- **Forte:** ModalShell focus trap, TabBar/SegControl, safe-area, pageEnter sem transform.
- **🟡:** DetailModal advertências ainda legado em partes; Chamadas Seg legado.
- **SEO:** `noindex` correto (interno).

### IA e Automação
- Narrativa `gpt-4o-mini` com validação pós-resposta.
- **Oportunidade real:** checklist automático pré-aprovação DP (reduz erro humano).
- **Evitar:** RAG custoso sem corpus limpo; chat genérico no dashboard.

---

## 3. Melhorias priorizadas (impacto × esforço)

| # | Item | Impacto | Esforço | Status |
|---|------|---------|---------|--------|
| 1 | Atores impressão/entrega/aprovação só da sessão | Alto | Baixo | **Feito** |
| 2 | Optimistic lock `entrega_status` | Alto | Baixo | **Feito** |
| 3 | Desligar Path B create-user (senha) | Alto | Baixo | **Feito** |
| 4 | Audit em `/api/advertencia-notificar` | Médio | Baixo | **Feito** |
| 5 | Auto-aprovação carimba `aprovado_por` sessão | Médio | Baixo | **Feito** |
| 6 | Split DiscagensPage (PRs) | Médio | Alto | Backlog |
| 7 | HttpOnly cookie nonce | Médio | Alto | Backlog (app interno) |
| 8 | Checklist IA pré-aprovação DP | Médio | Médio | Backlog |
| 9 | Remover React Query ou adotar de verdade | Baixo | Médio | Backlog |
| 10 | Ativar e-mail CF | Médio | Ops | Manual |

---

## 4. Implementação deste ciclo

- `advertenciasValidate.ts`: strip atores no sanitize; `applySessionActorsToPatch`; `resolvePatchLock`
- `advertencias.ts`: lock entrega + atores sessão + auto-aprovação carimbada
- `dashboard-create-user.ts`: Path B só com `ALLOW_CREATE_USER_PASSWORD_FALLBACK=true`
- `advertencia-notificar.ts`: `writeAdvertenciaAudit`
- Testes + guards anti-regressão

---

## 5. Antes × Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Spoof `impressa_por` / `entregue_por` | Client podia forjar | Servidor sobrescreve da sessão |
| Corrida impressão/entrega | Só lock em approve/reject | Lock também em `entrega_status` |
| Create-user senha | Path B sempre disponível | Off por padrão |
| Trilha notificação | Invisível | Audit `notificacao_update` |
| Feedback formal | Sem `aprovado_por` | Carimbado na sessão |

---

## 6. Próximos passos

1. Smoke manual: aprovar → imprimir → entregar (conferir atores no SQL).
2. Quando domínio CF Email estiver pronto → ligar secrets.
3. Próximo PR de código: split `DiscagensPage` (mesmo padrão Hora PR1–3) **ou** checklist IA DP.
4. Não priorizar HttpOnly / WAF Supabase enquanto app for interno + lockout ativo.

---

## Histórico recente

| Commit | Entrega |
|--------|---------|
| `e94a964` | Hora PR3 |
| `5f4a382` | Audit + logout + lockout |
| `588b3e2` | Logout não-bloqueante + gitignore `.temp` |
| (este) | Hardening atores / TOCTOU / Path B / audit notificar |
