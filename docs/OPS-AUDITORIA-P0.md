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
