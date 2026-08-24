# Operações pós-auditoria (P0) — Dashboard + sync EVA

## Aplicar no Supabase (Dashboard `ayhrw…`)

1. Rodar migration `supabase/migrations/009_harden_security.sql` no SQL Editor.
2. Confirmar que `pgcrypto` está habilitado (`digest` / `crypt`).
3. Testar login: resposta deve trazer `session_expires_at` e `session_nonce`.
4. Página Usuários: exige **novo login** (senha fica só em memória) e RPCs `*_secure`.

## Cloudflare Pages

1. Opcional: `DASHBOARD_INSIGHT_SECRET` em Pages → Settings → Environment.
2. Sem secret, `/api/hora-insight` exige header `X-Dashboard-Session` (nonce do login).
3. Redeploy do front após merge.

## VM Oracle (bot processamento)

1. `bash deploy.sh` agora copia `sync_eva_operacao.py` + `discagens_monitor.py` e roda testes EVA.
2. Cron live: se exit code `2`, lock ocupado (alerta).
3. Guards: não sobrescreve live vazio; preserva discagens; SMS não wipe com universo fraco.

## Não automatizado nesta entrega (ops humano)

- Rotacionar keys RobTX / service_role se vazaram em docs/git.
- Tornar bucket `eva-dash` privado + signed URLs (requer mudança de fetch no front).
- Migrar SPA para Supabase Auth completo (JWT) — sessão 12h + RPCs admin é o passo intermediário.
- Quebra completa dos monólitos Hora/Discagens (hook `useEvaLive` criado para migração gradual).
