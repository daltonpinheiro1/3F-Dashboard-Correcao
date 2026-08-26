# Operações pós-auditoria (P0/P1) — Dashboard Correção

## Obrigatório: migration 013 (projeto `ayhrwxsxqddpeukydblz`)

No SQL Editor do Supabase Dashboard, rode:

`supabase/migrations/013_session_harden.sql`

Isso:
- grava `session_nonce` + `session_expires_at` no login
- cria `verify_dashboard_session` / `*_by_session`
- remove overload perigoso `create_dashboard_user(4 args)` se existir
- fecha RLS aberto de `advertencias` (só service_role / Functions)

Depois: **logout/login** (sessões antigas sem nonce no banco invalidam).

## Cloudflare Pages

1. `DASHBOARD_INSIGHT_SECRET` — só no Pages (Functions) / `.dev.vars`. **Nunca** `VITE_*`.
2. `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` nas Functions.
3. Front autentica Functions com `X-Dashboard-Email` + `X-Dashboard-Session` (nonce).

### E-mail ao solicitante (aprovada/recusada + PDF anexo)

Secrets no Pages (produção) / `.dev.vars` (local):

| Secret | Descrição |
|--------|-----------|
| `ADVERTENCIAS_EMAIL_ENABLED` | `true` para ativar |
| `CF_ACCOUNT_ID` | Conta Cloudflare |
| `CF_API_TOKEN` | Token com permissão Email Sending |
| `ADVERTENCIAS_EMAIL_FROM` | Ex.: `RH 3F <rh@3fcontactcenter.com.br>` |
| `ADVERTENCIAS_EMAIL_REPLY_TO` | Opcional — caixa do DP |

Domínio do remetente deve estar onboarded no Cloudflare Email Sending.

Enquanto não configurado: dashboard avisa solicitante via **Minhas solicitações** + badge **Nova**; `notificacao_status` fica `desativada`.

**Estado atual (2026-08-26):** `ADVERTENCIAS_EMAIL_ENABLED=false` no Pages até domínio CF Email. Ver [OPS-FINAL.md](./OPS-FINAL.md).

### Migration 015 (notificação + entrega)

Rodar `supabase/migrations/015_advertencias_notificacao_entrega.sql` no projeto `ayhrwxsxqddpeukydblz`.

Campos: trilha de entrega (`entrega_status`, impressão, protocolo) e fila de e-mail (`notificacao_status`).

## Blindagem local

```bash
bash scripts/check-regressao.sh
```

Guards falham o build se o secret VITE voltar ao `src/` ou se o fallback 4-args voltar em UsuariosPage.

## Views UNRESTRICTED (Supabase Advisors)

Rodar também `014_views_security_invoker.sql`:
- `ALTER VIEW … SET (security_invoker = true)` em todas as views `public`
- RLS em `sms_eficiencia` / `sms_previo_eficiencia` (SELECT anon; write só service_role)

Isso remove o badge vermelho **UNRESTRICTED** em `sms_eficiencia_resumo`, `vw_sms_previo_*`, `top_vendedores_qualidade`, etc.
