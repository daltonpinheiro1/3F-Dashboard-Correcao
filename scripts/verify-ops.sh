#!/usr/bin/env bash
# Verificação pós-deploy / ops final — Dashboard Correção
# Uso: bash scripts/verify-ops.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

PROJECT="3f-dashboard-correcao"
PROD_URL="${OPS_PROD_URL:-https://3f-dashboard-correcao.pages.dev}"
SUPABASE_REF="ayhrwxsxqddpeukydblz"

echo "== ops verify — $PROJECT =="

echo "-- regressão (guards + unit + build) --"
bash scripts/check-regressao.sh

echo "-- secrets Pages (nomes apenas) --"
REQUIRED_SECRETS=(
  DASHBOARD_INSIGHT_SECRET
  OPENAI_API_KEY
  SUPABASE_URL
  SUPABASE_SERVICE_KEY
)
SECRET_LIST="$(npx wrangler pages secret list --project-name="$PROJECT" 2>/dev/null || true)"
for s in "${REQUIRED_SECRETS[@]}"; do
  echo "$SECRET_LIST" | grep -q "$s" || fail "secret ausente no Pages: $s"
  ok "secret presente: $s"
done

if echo "$SECRET_LIST" | grep -q ADVERTENCIAS_EMAIL_ENABLED; then
  ok "ADVERTENCIAS_EMAIL_ENABLED configurado (ver valor no dashboard CF)"
else
  echo "WARN: ADVERTENCIAS_EMAIL_ENABLED não definido — e-mail desligado por padrão no código"
fi

echo "-- produção (HTTP) --"
for path in "/" "/login" "/hora" "/advertencias" "/controle-dp" "/atestados" "/atestados-solicitar"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$PROD_URL$path" || echo "000")"
  [[ "$code" == "200" ]] || fail "$PROD_URL$path retornou HTTP $code"
  ok "$path → $code"
done

echo "-- migrations (arquivos locais 013–016) --"
for m in 013_session_harden 014_views_security_invoker 015_advertencias_notificacao_entrega 016_advertencias_rls_guard; do
  [[ -f "supabase/migrations/${m}.sql" ]] || fail "migration ausente: ${m}.sql"
  ok "migration file: ${m}.sql"
done

echo ""
echo "== manual (confirmar no Supabase $SUPABASE_REF) =="
echo "  1. SQL: SELECT proname FROM pg_proc WHERE proname LIKE '%by_session%';"
echo "  2. SQL: SELECT column_name FROM information_schema.columns WHERE table_name='advertencias' AND column_name IN ('entrega_status','notificacao_status');"
echo "  3. SQL: SELECT policyname FROM pg_policies WHERE tablename = 'advertencias';  → esperado: vazio"
echo "  4. Pedir logout/login a todos os usuários após migration 013"
echo "  5. E-mail: quando domínio CF Email estiver pronto, setar ADVERTENCIAS_EMAIL_* + ENABLED=true"
echo ""
echo "OK: ops verify automatizado concluído"
