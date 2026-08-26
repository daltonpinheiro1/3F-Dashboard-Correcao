#!/usr/bin/env bash
# Blindagem anti-regressão — Dashboard Correção
# Uso: bash scripts/check-regressao.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "FAIL: $*" >&2; exit 1; }

RG="$(command -v rg || true)"
if [[ -z "$RG" ]]; then
  for c in \
    /Applications/Cursor.app/Contents/Resources/app/node_modules/@vscode/ripgrep/bin/rg \
    /usr/local/bin/rg \
    /opt/homebrew/bin/rg; do
    [[ -x "$c" ]] && RG="$c" && break
  done
fi
[[ -n "$RG" ]] || fail "ripgrep (rg) não encontrado"

echo "== guards (anti-regressão) =="

if "$RG" -n "import\.meta\.env\.VITE_DASHBOARD_INSIGHT_SECRET" src >/dev/null 2>&1; then
  "$RG" -n "import\.meta\.env\.VITE_DASHBOARD_INSIGHT_SECRET" src || true
  fail "VITE_DASHBOARD_INSIGHT_SECRET não pode ser usado em src/ (secret no bundle)"
fi

if "$RG" -n "create_dashboard_user" src/pages/UsuariosPage.tsx 2>/dev/null | "$RG" -v 'by_session' >/dev/null; then
  fail "UsuariosPage não pode chamar create_dashboard_user direto (use by_session / API)"
fi

if "$RG" -n "localStorage\.setItem" src/lib/advertenciasService.ts >/dev/null 2>&1; then
  fail "advertenciasService não pode gravar PII em localStorage"
fi

for f in functions/api/advertencias.ts functions/api/hora-insight.ts functions/api/advertencia-narrativa.ts functions/api/advertencia-notificar.ts functions/api/dashboard-create-user.ts; do
  "$RG" -q "authorizeRequest" "$f" || fail "$f deve usar authorizeRequest de _lib/auth"
done

if "$RG" -q "sessHeader === secret" functions/_lib/auth.ts 2>/dev/null; then
  fail "Secret não pode ser aceito via X-Dashboard-Session"
fi

if ! "$RG" -q "requireAdmin" functions/api/hora-insight.ts 2>/dev/null; then
  fail "hora-insight deve exigir requireAdmin"
fi

echo "guards OK"

echo "== vitest (todas suites lib) =="
npx vitest run src/lib --reporter=dot

echo "== build =="
npm run build

if "$RG" -l "VITE_DASHBOARD_INSIGHT_SECRET" dist 2>/dev/null | head -1 | grep -q .; then
  fail "dist ainda contém VITE_DASHBOARD_INSIGHT_SECRET"
fi

echo "OK: guards + tests + build"
