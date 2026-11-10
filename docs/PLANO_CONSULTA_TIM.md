# Plano de incorporação — Aba Consulta TIM (Score)

Escopo: **adicionar** uma função no Dashboard 3F, sem alterar abas/fluxos existentes.  
Origem do crédito: bot **Score_TIM** (`POST /queries` → poll `GET /queries/{id}`).  
Acesso inicial: **somente administrador** (mesmo login/sessão do dash). Perfil homologável depois via `ABA_CATALOG` (já alimenta a tela de Perfis).

---

## 1. Compreensão do objetivo

| Quem | O quê |
|------|--------|
| Admin logado no 3F | Preenche dados do cliente e envia consulta |
| Sistema | Enfileira no bot → aguarda desfecho |
| UI | Mostra **APROVADO + score** (e planos se vierem) **ou** **REPROVADO + motivo** / falha operacional |

**Não fazer neste ciclo:** mudar layout global, auth, outras abas, 2º login no bot, dashboard HTML do Score_TIM.

---

## 2. Princípios cirúrgicos (anti-regressão)

1. **Só append** — catálogo + 1 item de nav + 1 rota + arquivos **novos**.
2. **Não tocar** `AuthGuard` genérico, `authStore`, `AppShell`, tokens CSS, login.
3. **API key do bot nunca no browser** — só BFF Cloudflare (`SCORE_TIM_*` em secrets).
4. **Auth dash no BFF** — cookie de sessão + `requireAdmin` / `requireAba('consulta-tim')`.
5. **Identidade visual** — reutilizar `.card`, `.input-field`, `.btn-primary`, `PageAlert`, Lucide.

---

## 3. Arquitetura

```
[ConsultaTimPage]  --cookie sessão-->  [/api/score-tim]  --X-API-Key-->  [Score_TIM]
     React SPA              Pages Function (BFF)              FastAPI bot
```

- Front: `fetch('/api/score-tim', …)` com `dashboardSessionHeaders()`.
- BFF: valida sessão → proxy `POST /queries` → poll interno (teto de tempo) → devolve desfecho ao front **ou** enqueue + status (ver trade-off).
- Bot: inalterado; só precisa rede alcançável + key + (se cross-origin direto) CORS — **com BFF, CORS no bot não é necessário**.

---

## 4. Fases de implementação

### Fase 0 — Prep (ops)

| # | Entrega |
|---|---------|
| 0.1 | Definir `SCORE_TIM_BASE_URL` (ex. `http://192.168.10.107:8000` ou túnel) e `SCORE_TIM_API_KEY` |
| 0.2 | Documentar em `.env.example` / `.dev.vars` (sem valores) |
| 0.3 | Smoke bot: `GET /health` + 1 `POST /queries` com key |

### Fase 1 — Catálogo + rota + nav (zero lógica de crédito)

| Arquivo | Ação |
|---------|------|
| `shared/abasCatalog.ts` | id `consulta-tim` em `ABA_CATALOG` + `ABAS_SO_ADMIN` |
| `shared/abasCatalog.test.ts` | admin vê; viewer sem aba não vê |
| `src/App.tsx` | lazy + `/consulta-tim` + `AuthGuard aba="consulta-tim"` |
| `src/components/AdminLayout.tsx` | **append** 1 `navItem` (ícone Lucide) |

Gate: build + teste de catálogo; sidebar só admin.

### Fase 2 — BFF proxy

| Arquivo | Ação |
|---------|------|
| `functions/api/score-tim.ts` | `authorizeRequest` + `requireAdmin` (ou `requireAba`) |
| | Body → `POST {BASE}/queries` com `X-API-Key` |
| | Poll `GET …/queries/{id}` até terminal ou timeout (~120–180s) |
| | Resposta normalizada `{ status, score, rejection_reason, outcome_code, plans? }` |
| | Rate limit leve + sem logar CPF em claro |
| Teste | 401 sem cookie; 403 non-admin; mock 200 APPROVED/REJECTED |

**Decisão (performance):** poll no **front** via BFF fino.
- `POST /api/score-tim` → enqueue (202 + `query_id`) em ms
- `GET /api/score-tim?query_id=` → status pontual
- Browser faz poll ~2s (até ~3 min) — Worker não segura o crivo inteiro
- `GET ?lookup=1&cpf=` → autofill do cache 24h

### Fase 3 — Página (UI)

| Arquivo | Ação |
|---------|------|
| `src/pages/ConsultaTimPage.tsx` | Form: CPF, nome, data_nascimento, nome_mae, UF, telefone?, cep? |
| `src/lib/scoreTimService.ts` | Client tipado |
| UX | Loading (“Consultando…”); `PageAlert` success/error; motivo em texto; score em destaque |

Opcional MVP+: `GET /lookup` via BFF para autofill (mesmo padrão).

### Fase 4 — Homologação de perfil (depois)

- Remover de `ABAS_SO_ADMIN` **somente** quando houver perfil “consulta crédito” na Administracao.
- Manter id `consulta-tim` no catálogo → checkbox de perfil já funciona.
- Sem mudar o modelo de login.

---

## 5. Contrato bot (referência)

**Request:** `cpf`, `nome`, `data_nascimento`, `nome_mae`, `uf` (+ `telefone`, `cep` opcionais).  
**Fluxo:** 202 `{ query_id }` → poll até `APPROVED` | `REJECTED` | `FAILED` | `INDETERMINATE`.  
**UI mínima:**  
- APPROVED → score (+ plans se existirem)  
- REJECTED → `rejection_reason` / `outcome_code`  
- FAILED → mensagem operacional (não confundir com reprovação de crédito)

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Key no bundle | Só secret Pages / `.dev.vars` |
| Regressão nav | Append-only em `navItems` |
| Aba vazando para viewer | `ABAS_SO_ADMIN` + teste |
| Timeout Worker | Teto + status intermediário |
| PII em logs CF | Mascarar CPF nos logs do BFF |
| Bot inacessível da CF | Rede/VPN/túnel; health check na Fase 0 |

---

## 7. Ordem de execução (quando autorizado)

```
F0 ops/rede → F1 catálogo/rota/nav → F2 BFF → F3 página → testes → (F4 perfil homolog)
```

Cada fase: diff mínimo → validar → só então avança.

### Status

| Fase | Estado |
|------|--------|
| F0 secrets documentados | `.env.example` |
| F1 catálogo/rota/nav | feito (`consulta-tim` + `ABAS_SO_ADMIN`) |
| F2 BFF enqueue+status+lookup | feito (`functions/api/score-tim.ts`) |
| F3 página + poll front | feito (`ConsultaTimPage`) |
| F4 perfil homolog | pendente (quando liberar non-admin) |

---

## 8. Fora de escopo (explícito)

- Alterar Score_TIM (exceto rede/key se necessário para alcançar o bot)
- Dashboard embutido do bot
- Multi-usuário TIM / 2ª RSA
- IA preditiva neste ciclo (autofill lookup é o ganho UX imediato; ML fica backlog)
