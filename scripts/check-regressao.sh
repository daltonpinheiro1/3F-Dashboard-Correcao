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

for f in functions/api/hora-insight.ts functions/api/advertencias.ts functions/api/advertencia-narrativa.ts functions/api/advertencia-notificar.ts; do
  "$RG" -q "requireAdmin" "$f" || fail "$f deve exigir requireAdmin"
done

[[ -f functions/_lib/advertenciasValidate.ts ]] || fail "advertenciasValidate.ts ausente"
[[ -f src/components/ui/TabBar.tsx ]] || fail "TabBar (design system) ausente"
[[ -f src/components/advertencias/CriacaoPanel.tsx ]] || fail "CriacaoPanel extraído ausente"
[[ -f src/components/advertencias/AdvertenciaDetailModal.tsx ]] || fail "AdvertenciaDetailModal ausente"
[[ -f supabase/migrations/015_advertencias_notificacao_entrega.sql ]] || fail "migration 015 ausente"
[[ -f supabase/migrations/016_advertencias_rls_guard.sql ]] || fail "migration 016 ausente"

"$RG" -q "canPreviewAdvertencia" src/components/advertencias/CriacaoPanel.tsx || fail "CriacaoPanel deve manter prévia (canPreviewAdvertencia)"
"$RG" -q "exportAdvertenciasExcel" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve manter export Excel"
"$RG" -q "AdvertenciaDetailModal" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve usar AdvertenciaDetailModal"
"$RG" -q "ModalShell" src/components/advertencias/AdvertenciaDetailModal.tsx || fail "AdvertenciaDetailModal deve usar ModalShell"
"$RG" -q "AlertDialog" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve usar AlertDialog na recusa DP"
"$RG" -q "useSearchParams" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve suportar deep link ?id="

if "$RG" -q "window\.prompt" src/pages/AdvertenciasPage.tsx 2>/dev/null; then
  fail "AdvertenciasPage não pode usar window.prompt (use AlertDialog)"
fi

if ! "$RG" -q "sanitizeAdvertenciaPost|sanitizeAdvertenciaPatch" functions/api/advertencias.ts 2>/dev/null; then
  fail "advertencias.ts deve usar advertenciasValidate (sanitize post/patch)"
fi

if "$RG" -q "<Seg\b" src/pages/HoraPage.tsx src/pages/OperacaoPage.tsx 2>/dev/null; then
  fail "HoraPage/OperacaoPage não podem usar Seg legado (use SegControl)"
fi

if ! "$RG" -q "validateAdvertenciaPost|validateAdvertenciaPatchTransition" functions/api/advertencias.ts 2>/dev/null; then
  fail "advertencias.ts deve validar POST/PATCH (workflow server-side)"
fi

if ! "$RG" -q "requerAprovacaoDpFromRow" functions/_lib/advertenciasValidate.ts 2>/dev/null; then
  fail "advertenciasValidate deve espelhar requerAprovacaoDp (apuração idx 10)"
fi

echo "guards OK"

echo "== vitest (lib + functions _lib) =="
npx vitest run src/lib functions/_lib --reporter=dot

echo "== build =="
npm run build

if "$RG" -l "VITE_DASHBOARD_INSIGHT_SECRET" dist 2>/dev/null | head -1 | grep -q .; then
  fail "dist ainda contém VITE_DASHBOARD_INSIGHT_SECRET"
fi

echo "OK: guards + tests + build"
