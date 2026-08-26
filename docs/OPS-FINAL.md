# Ops final — Dashboard Correção

**Projeto Supabase:** `ayhrwxsxqddpeukydblz`  
**Produção:** https://3f-dashboard-correcao.pages.dev  
**Repositório:** `daltonpinheiro1/3F-Dashboard-Correcao`

---

## Status (2026-08-26)

| Item | Status | Notas |
|------|--------|-------|
| Deploy Pages (último) | ✅ | Hora + Advertências + guards |
| Secrets core (SUPABASE, OPENAI, INSIGHT) | ✅ | Via `wrangler pages secret list` |
| `DASHBOARD_INSIGHT_SECRET` rotacionado | ✅ | P0-2 — rotacionado em 2026-08-26 |
| Migration 013 session_harden | ✅ | RPCs `*_by_session` confirmados no remoto |
| Migration 014 views security_invoker | ✅ | Aplicada |
| Migration 015 notificação + entrega | ✅ | Aplicada |
| Migration 016 RLS guard advertências | ✅ | Aplicada |
| E-mail solicitante (CF Email) | ⏸ | `ADVERTENCIAS_EMAIL_ENABLED=false` até domínio |
| Logout/login usuários | 📋 | Comunicar equipe (sessões pré-013 invalidam) |
| Blindagem `check-regressao.sh` | ✅ | Guards + 29 testes + build |
| Smoke e2e advertências + hora | ✅ | `npm run test:e2e:smoke` |

---

## Comandos

```bash
# Regressão completa (CI local)
npm run test:guards

# Ops pós-deploy (secrets + HTTP prod + migrations files)
npm run test:ops

# Smoke Playwright
npm run test:e2e:smoke
```

---

## Secrets Cloudflare Pages

### Obrigatórios (produção)

| Secret | Uso |
|--------|-----|
| `SUPABASE_URL` | Functions → Postgres REST |
| `SUPABASE_SERVICE_KEY` | Service role (RLS bypass controlado) |
| `DASHBOARD_INSIGHT_SECRET` | Bearer server-side apenas — **nunca** `VITE_*` |
| `OPENAI_API_KEY` | Narrativa IA advertências + hora-insight |

### E-mail (quando ativar)

| Secret | Valor inicial |
|--------|----------------|
| `ADVERTENCIAS_EMAIL_ENABLED` | `false` (desligado) → `true` quando domínio onboarded |
| `CF_ACCOUNT_ID` | Conta Cloudflare |
| `CF_API_TOKEN` | Permissão Email Sending |
| `ADVERTENCIAS_EMAIL_FROM` | Ex.: `RH 3F <rh@3fcontactcenter.com.br>` |
| `ADVERTENCIAS_EMAIL_REPLY_TO` | Opcional — DP |

Enquanto desligado: UI **Minhas solicitações** + badge **Nova** cobrem o solicitante.

---

## Rotacionar secret (futuro)

```bash
openssl rand -hex 32 | npx wrangler pages secret put DASHBOARD_INSIGHT_SECRET --project-name=3f-dashboard-correcao
```

Atualizar o mesmo valor em `.dev.vars` local (não commitar). Usuários do dashboard **não** precisam relogar — só integrações que usam `Authorization: Bearer`.

---

## Validação SQL (Supabase SQL Editor)

```sql
-- 013: sessão hardened
SELECT proname FROM pg_proc
WHERE proname IN ('verify_dashboard_session','create_dashboard_user_by_session');

-- 015: colunas entrega/notificação
SELECT column_name FROM information_schema.columns
WHERE table_name = 'advertencias'
  AND column_name IN ('entrega_status','notificacao_status');

-- 016: RLS advertências fechado para anon
SELECT policyname FROM pg_policies WHERE tablename = 'advertencias';
-- esperado: 0 linhas
```

---

## Checklist comunicação equipe

1. **Logout/login** uma vez após go-live da migration 013  
2. Advertências: suspensão → DP aprova → imprimir → protocolar entrega  
3. Feedback/advertência leve → PDF na hora (sem fila DP)  
4. Export Excel na aba **Controle (RH)**  
5. E-mail ao solicitante: avisar quando CF Email estiver configurado  

---

Ver também: [OPS-AUDITORIA-P0.md](./OPS-AUDITORIA-P0.md) · [AUDITORIA-TECNICA.md](./AUDITORIA-TECNICA.md)
