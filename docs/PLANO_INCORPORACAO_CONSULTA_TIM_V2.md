# Plano de incorporação — Consulta TIM v2 (código → produção)

**Objetivo:** levar para o repositório e para o Pages tudo que já está pronto no working tree (UI celular/DDD, validações, BFF fail-closed), sem regressão na aba admin.

**Por que o print ainda mostra a UI antiga:** produção (`3f-dashboard-correcao.pages.dev`) está em `fe6388e` (form CPF + Buscar + CEP). As melhorias estão **só locais e não commitadas**.

---

## Escopo a incorporar (já implementado localmente)

| Item | Arquivos | Estado local |
|------|----------|--------------|
| Form: celular → CPF → UF(DDD) → nome → nasc → mãe | `src/pages/ConsultaTimPage.tsx` | pronto |
| Máscara/validação BR (DDD, CPF checksum, nasc 16–100) | `shared/brIdentity.ts`, `src/lib/brPhone.ts` | pronto |
| Service sem CEP; poll com cleanup de abort | `src/lib/scoreTimService.ts` | pronto |
| BFF: telefone obrigatório, UF do DDD, CPF exato, key obrigatória | `functions/api/score-tim.ts` | pronto |
| Testes (17) | `shared/brIdentity.test.ts`, `functions/api/score-tim.test.ts`, `src/lib/brPhone.test.ts` | pronto |
| Secrets Pages `SCORE_TIM_*` | Cloudflare | já gravados |
| Bot + túnel VM | Score_TIM na VM | health ok (URL quick tunnel volátil) |

**Fora deste plano:** F4 perfil non-admin; túnel Cloudflare **nomeado**; mudanças no código Python do Score_TIM.

---

## Pré-condições

1. Confirmar que o print é produção antiga (não cache local do Vite).
2. Bot na VM respondendo `GET /health`.
3. Secrets Pages: `SCORE_TIM_BASE_URL` + `SCORE_TIM_API_KEY` (já feitos; **atualizar BASE_URL** se o quick tunnel mudou).
4. Não commitar `.wrangler/`, `config.json` com key, nem `/tmp/score_tim_secrets`.

---

## Fases (ordem obrigatória)

### Fase A — Congelar qualidade (local)

| # | Ação | Gate |
|---|------|------|
| A1 | `npx vitest run shared/brIdentity.test.ts src/lib/brPhone.test.ts functions/api/score-tim.test.ts` | 17 pass |
| A2 | `npm run build` (ou script de typecheck do projeto) | exit 0 |
| A3 | Diff review: sem CEP no payload; CPF sem `padStart` de CPF curto | ok |

### Fase B — Incorporar no Git (Dashboard)

| # | Ação | Gate |
|---|------|------|
| B1 | `git add` só arquivos da feature (lista abaixo) | status limpo da feature |
| B2 | Commit único (mensagem focada no *porquê*) | hash criado |
| B3 | `git push origin main` (ou branch + PR se preferir review) | remote atualizado |

**Arquivos a incluir no commit:**

```
shared/brIdentity.ts
shared/brIdentity.test.ts
src/lib/brPhone.ts
src/lib/brPhone.test.ts
src/lib/scoreTimService.ts
src/pages/ConsultaTimPage.tsx
functions/api/score-tim.ts
functions/api/score-tim.test.ts
docs/PLANO_INCORPORACAO_CONSULTA_TIM_V2.md
docs/PLANO_CONSULTA_TIM.md   # atualizar status F3 → v2 (opcional na mesma entrega)
```

**Mensagem sugerida:**

```
feat(consulta-tim): celular/DDD define PDV; validações CPF/nasc; UI alinhada ao dash

Remove CEP e lookup da UX. BFF fail-closed com API key e rejeita CPF curto.
```

### Fase C — Deploy Pages

| # | Ação | Gate |
|---|------|------|
| C1 | Deploy automático do Git **ou** `npx wrangler pages deploy` conforme o fluxo do repo | build verde |
| C2 | Confirmar Functions da produção usam o BFF novo | POST sem telefone → 422 |
| C3 | Hard refresh na aba Consulta TIM | UI nova (hero + celular primeiro) |

### Fase D — Rede bot (ops, paralelo seguro)

| # | Ação | Gate |
|---|------|------|
| D1 | `curl $SCORE_TIM_BASE_URL/health` | `{"status":"ok"...}` |
| D2 | Se túnel morreu: subir `start_tunnel_cf.bat` na VM (WMI) e `wrangler pages secret put SCORE_TIM_BASE_URL` | health público ok |
| D3 | (Recomendado) trocar quick tunnel por **túnel nomeado** com hostname fixo | URL estável |

### Fase E — Homologação funcional (1 CPF real)

| # | Cenário | Esperado |
|---|---------|----------|
| E1 | Celular inválido / CPF inválido / data inválida | erro local ou 422, sem enqueue |
| E2 | Submit válido admin | 202 → poll → APPROVED/REJECTED/FAILED |
| E3 | Viewer sem aba | 403 |
| E4 | Cancelar espera no meio do poll | “Consulta cancelada.” |

---

## Contrato pós-incorporação (fonte da verdade)

**UI / body POST**

| Campo | Obrigatório | Nota |
|-------|-------------|------|
| `telefone` | sim | 11 dígitos, DDD válido, 3º=9 → PDV |
| `cpf` | sim | 11 dígitos + checksum (Crivo) |
| `nome` | sim | trim, máx 120 |
| `data_nascimento` | sim | DD/MM/AAAA, idade 16–100 |
| `nome_mae` | sim | trim, máx 120 |
| `uf` | derivado | BFF sobrescreve pelo DDD |
| `cep` | não | sempre `""` no proxy |

---

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Deploy sobe UI mas túnel caiu | E2 falha 502; D1–D2 antes do teste humano |
| Push direto em `main` | Preferir PR se o time exigir review; senão push + smoke E1–E3 |
| Idade 16–100 rejeitar caso edge | Ajustar só `normalizeBirthDate` em `shared/brIdentity.ts` |
| Quick tunnel muda URL | D3 túnel nomeado; até lá atualizar secret |

---

## Checklist de aceite (definição de pronto)

- [ ] Commit no Git com os 8–9 arquivos da feature
- [ ] Produção mostra form **sem** “Buscar cadastro” e **sem** CEP
- [ ] Celular primeiro; UF somente leitura via DDD
- [ ] Vitest da feature verde
- [ ] 1 consulta real APPROVED ou REJECTED (não só FAILED de rede)
- [ ] `PLANO_CONSULTA_TIM.md` marcado com F3-v2 feito

---

## Ordem resumida

```
A qualidade → B commit/push → C deploy Pages → D health/túnel/secret → E smoke real
```

**Próximo comando humano (quando autorizar):** “pode commit + push + deploy”.
