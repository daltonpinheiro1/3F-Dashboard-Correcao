# Plano reestruturado — Consulta TIM (melhoria contínua)

**Atualizado:** 2026-11-10 · cobre Dashboard + Score_TIM + fila ao vivo  
**Estado do código:** pronto para commit/push (Dashboard + Score_TIM)  
**Estado produção Pages:** sobe automaticamente após push em `main` (Git Provider)

---

## 1. Mapa do sistema (estado atual)

```
[ConsultaTimPage] --cookie--> [/api/score-tim] --X-API-Key--> [Score_TIM VM]
     │ painel fila 3–8s              │ ?queue=1 / status          │ GET /queue
     │ poll 2s + posição             │ POST /queries              │ position_info
```

| Camada | Forte | Fraco |
|--------|-------|-------|
| UI | Design system, DDD→UF, fila live | Não deployada |
| BFF | Validação CPF/tel/nasc, fail-closed key | Lookup órfão; 404 sem posição |
| Bot | Fila SQLite + position; soft-reject | Quick tunnel volátil; código VM ≠ git limpo |
| Ops | Secrets Pages gravados | Túnel nomeado ausente |

---

## 2. Backlog priorizado (impacto × esforço)

### P0 — Entregar o que já existe (ops)

| ID | Item | Esforço | Impacto |
|----|------|---------|---------|
| P0.1 | Commit + push Dashboard (feature completa) | S | ✅ `aab4010` |
| P0.2 | Deploy Pages | S | ✅ Active em produção |
| P0.3 | Confirmar `SCORE_TIM_BASE_URL` = túnel atual | S | ✅ secrets + health/queue ok |
| P0.4 | Smoke E2E 1 CPF real | S | ⏳ validação humana na aba (API/túnel ok) |

### P1 — Estabilidade fila / UX (feito nesta revisão ou próximo)

| ID | Item | Status |
|----|------|--------|
| P1.1 | Memory queue: tracking PROCESSING + ack | **feito** |
| P1.2 | BFF 404 sem inventar `queue_ahead=0` | **feito** |
| P1.3 | Poll pausa com `document.hidden` | **feito** |
| P1.4 | Abort no unmount + guard `mountedRef` | **feito** |
| P1.5 | Labels: próximo vs em atendimento + ETA ~90s | **feito** |
| P1.6 | Commit Score_TIM (queue/position) no git do bot | **feito** |

### P2 — Rede e observabilidade

| ID | Item | Trade-off |
|----|------|-----------|
| P2.1 | Túnel Cloudflare **nomeado** + hostname fixo | **feito** `score-tim.dupper.com.br` (sem dup.api) |
| P2.2 | Task Scheduler Windows (API+tunnel no boot) | **feito** `ScoreTIM_NamedTunnel` + Availability |
| P2.3 | Métrica p50 Crivo → ETA real (em vez de 90s) | **feito** `eta_hint_seconds` no `/queue` |

### P3 — Produto / IA (só com valor claro)

| ID | Item | Nota |
|----|------|------|
| P3.1 | Autofill via `lookup` (cache 24h) | **feito** blur CPF na ConsultaTimPage |
| P3.2 | F4: perfil non-admin com aba explícita | Já catalogado |
| P3.3 | Alertas Slack/Telegram fila > N | Ops (opcional; catálogo P0/P1 já existe) |
| P3.4 | Sugestão de plano pós-APPROVED (ranking) | IA só se catálogo + regras forem fonte |

### Fora de escopo (explícito)

- 2ª credencial RSA / multi-sessão
- Dashboard HTML embutido do bot
- Expor fila sem auth
- Mudar soft-reject / orquestrador sem lote de assertividade

---

## 3. Ordem de execução recomendada

```
P0.1 commit dash → P0.2 deploy → P0.3 túnel/secret → P0.4 smoke
     ↓
P1.6 commit bot (se ainda não)
     ↓
P2.1 túnel nomeado (quando ops autorizar)
     ↓
P3.1 lookup autofill (próximo ciclo produto)
```

---

## 4. Gates de qualidade (antes de cada push)

```bash
# Dashboard
npx vitest run shared/brIdentity.test.ts src/lib/brPhone.test.ts functions/api/score-tim.test.ts

# Bot
pytest tests/unit/test_queue_manager.py tests/unit/test_sqlite_store.py -q
```

Aceite UI produção:

- [ ] Sem “Buscar cadastro” / sem CEP
- [ ] Painel Fila ao vivo com números
- [ ] Durante espera: “X na frente” ou “Em atendimento”
- [ ] 1 consulta terminal (APPROVED/REJECTED)

---

## 5. Riscos residuais

| Risco | Mitigação |
|-------|-----------|
| Quick tunnel muda URL | P2.1; até lá atualizar secret |
| Rate limit 120 GET/min | Intervalo 8s sob loading + pause hidden |
| ETA 90s impreciso | Texto “estimado”; P2.3 |
| VM com working tree sujo | Commit bot + pull limpo; scp só de hotfix |

---

## 6. Próximo comando humano

Quando autorizar: **“pode commit + push + deploy”** (Dashboard; opcionalmente Score_TIM na mesma leva).
