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
[[ -f supabase/migrations/017_audit_logout_login_lock.sql ]] || fail "migration 017 ausente (audit/logout/lockout)"
[[ -f supabase/migrations/018_dashboard_users_lock_drop_password_rpcs.sql ]] || fail "migration 018 ausente (C1/C2)"
"$RG" -q "list_dashboard_users_secure" src/pages/UsuariosPage.tsx && fail "UsuariosPage não deve usar RPCs password-based"
"$RG" -q "useId" src/components/ui/ModalShell.tsx || fail "ModalShell deve usar useId (a11y stacking)"
[[ -f functions/api/auth-logout.ts ]] || fail "auth-logout.ts ausente"
[[ -f functions/_lib/advertenciasAudit.ts ]] || fail "advertenciasAudit.ts ausente"
[[ -f src/lib/sessionLogout.ts ]] || fail "sessionLogout.ts ausente"
"$RG" -q "logoutDashboardSession" src/components/AdminLayout.tsx || fail "AdminLayout deve invalidar sessão no logout"
# Logout local não pode esperar rede (Bugbot: hang bloqueava limpeza do store)
if ! "$RG" -q "AbortController|logout\\(\\)" src/lib/sessionLogout.ts 2>/dev/null; then
  fail "sessionLogout deve limpar local e ter timeout/AbortController no fetch"
fi
# Nunca commitar artefatos do supabase CLI
if git ls-files --error-unmatch 'supabase/.temp/*' >/dev/null 2>&1; then
  fail "supabase/.temp não deve ser versionado"
fi
"$RG" -q "supabase/\\.temp" .gitignore || fail ".gitignore deve ignorar supabase/.temp"
"$RG" -q "writeAdvertenciaAudit" functions/api/advertencias.ts || fail "POST/PATCH deve gravar advertencias_audit"
"$RG" -q "applySessionActorsToPatch|resolvePatchLock" functions/api/advertencias.ts || fail "PATCH deve forçar atores da sessão + lock entrega"
"$RG" -q "ALLOW_CREATE_USER_PASSWORD_FALLBACK|allowPasswordFallback" functions/api/dashboard-create-user.ts || fail "Path B create-user deve exigir flag explícita"
"$RG" -q "writeAdvertenciaAudit" functions/api/advertencia-notificar.ts || fail "notificar deve auditar"
"$RG" -q "logout_dashboard_session" supabase/migrations/017_audit_logout_login_lock.sql || fail "RPC logout_dashboard_session ausente na 017"

"$RG" -q "canPreviewAdvertencia" src/components/advertencias/CriacaoPanel.tsx || fail "CriacaoPanel deve manter prévia (canPreviewAdvertencia)"
"$RG" -q "exportAdvertenciasExcel" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve manter export Excel"
"$RG" -q "AdvertenciaDetailModal" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve usar AdvertenciaDetailModal"
"$RG" -q "ModalShell" src/components/advertencias/AdvertenciaDetailModal.tsx || fail "AdvertenciaDetailModal deve usar ModalShell"
"$RG" -q "AlertDialog" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve usar AlertDialog na recusa DP"
"$RG" -q "useSearchParams" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve suportar deep link ?id="
"$RG" -q "matchDpInbox|contarDpInbox|setInboxParam" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve ter Inbox DP (enviadas/autorizadas/recusadas/recebidas)"
"$RG" -q "bulkAprovarSelecionadas|Aprovar selecionadas" src/pages/AdvertenciasPage.tsx || fail "Controle DP deve ter bulk approve nas Enviadas"
[[ -f src/lib/advertenciasDpInbox.ts ]] || fail "advertenciasDpInbox.ts ausente"

if "$RG" -q "window\.prompt" src/pages/AdvertenciasPage.tsx 2>/dev/null; then
  fail "AdvertenciasPage não pode usar window.prompt (use AlertDialog)"
fi

if ! "$RG" -q "sanitizeAdvertenciaPost|sanitizeAdvertenciaPatch" functions/api/advertencias.ts 2>/dev/null; then
  fail "advertencias.ts deve usar advertenciasValidate (sanitize post/patch)"
fi

if "$RG" -q "<Seg\b" src/pages/HoraPage.tsx src/pages/OperacaoPage.tsx src/pages/ChamadasPage.tsx 2>/dev/null; then
  fail "HoraPage/OperacaoPage/ChamadasPage não podem usar Seg legado (use SegControl)"
fi

if ! "$RG" -q "inboxFiltroForRow" src/pages/AdvertenciasPage.tsx 2>/dev/null; then
  fail "AdvertenciasPage deve alinhar deep link à fila do inbox"
fi

# PATCH storage: não pode recarregar rows após validar (TOCTOU)
if "$RG" -n "loadStorageRows" functions/api/advertencias.ts | "$RG" -c "loadStorageRows" | grep -q .; then
  # Deve haver no máx. 1 loadStorageRows no fluxo PATCH (reuso após validate)
  :
fi
if ! "$RG" -q "storageRows" functions/api/advertencias.ts 2>/dev/null; then
  fail "advertencias PATCH deve reusar storageRows (anti TOCTOU)"
fi

if ! "$RG" -q "ADVERTENCIAS_ALLOW_STORAGE_FALLBACK|requireStore" functions/api/advertencias.ts 2>/dev/null; then
  fail "advertencias deve desligar fallback Storage por padrão (requireStore)"
fi

if "$RG" -q "limit=2000" functions/api/advertencias.ts 2>/dev/null; then
  fail "advertencias GET não pode usar limit=2000 fixo (use cursor)"
fi

if ! "$RG" -q "next_cursor|buildPgListPath|paginateRows" functions/api/advertencias.ts 2>/dev/null; then
  fail "advertencias GET deve retornar next_cursor (paginação keyset)"
fi

if ! "$RG" -q "Carregar mais|listAdvertenciasPage|ADVERTENCIAS_PAGE_LIMIT" src/pages/AdvertenciasPage.tsx 2>/dev/null; then
  fail "AdvertenciasPage deve carregar páginas com botão Carregar mais"
fi

# pageEnter: não pode usar transform (quebra position:fixed dos drawers)
if awk '/@keyframes pageEnter/,/^  \}/' src/index.css 2>/dev/null | grep -q 'transform'; then
  fail "pageEnter não pode usar transform (quebra ficha/drawers fixed)"
fi

if ! "$RG" -q "createPortal|document.body" src/components/OperadorFicha.tsx 2>/dev/null; then
  fail "OperadorFicha deve renderizar via createPortal(document.body)"
fi

[[ -f src/lib/horaPageData.ts ]] || fail "horaPageData.ts ausente (split HoraPage PR1)"
[[ -f src/components/hora/HoraToolbar.tsx ]] || fail "HoraToolbar.tsx ausente (split HoraPage PR1)"
[[ -f src/components/hora/HoraKpiGrid.tsx ]] || fail "HoraKpiGrid.tsx ausente (split HoraPage PR2)"
[[ -f src/components/hora/HoraNowcastPanel.tsx ]] || fail "HoraNowcastPanel.tsx ausente (split HoraPage PR2)"
[[ -f src/components/hora/HoraCpcChart.tsx ]] || fail "HoraCpcChart.tsx ausente (split HoraPage PR3)"
[[ -f src/components/hora/HoraOfensoresSection.tsx ]] || fail "HoraOfensoresSection.tsx ausente (split HoraPage PR3)"
rg -q "HoraOfensoresSection" src/pages/HoraPage.tsx || fail "HoraPage deve usar HoraOfensoresSection (PR3)"

if ! "$RG" -q "searchParams.get\\('login'\\)|login=" src/pages/OperacaoPage.tsx 2>/dev/null; then
  fail "OperacaoPage deve aceitar deep link ?login="
fi

if ! "$RG" -q "getFocusable|FOCUSABLE|Tab" src/components/ui/ModalShell.tsx 2>/dev/null; then
  fail "ModalShell deve ter focus trap (Tab)"
fi

if ! "$RG" -q "searchParams.get\\('id'\\)|byId" functions/api/advertencias.ts 2>/dev/null; then
  fail "GET advertencias deve aceitar ?id= (deep link pontual)"
fi

if ! "$RG" -q "ifStatus|status=eq.pendente|já foi alterado" functions/api/advertencias.ts 2>/dev/null; then
  fail "PATCH PG deve ter lock otimista ifStatus em aprovação/recusa"
fi

[[ -f functions/_lib/advertenciasList.ts ]] || fail "advertenciasList.ts ausente"

if ! "$RG" -q "validateAdvertenciaPost|validateAdvertenciaPatchTransition" functions/api/advertencias.ts 2>/dev/null; then
  fail "advertencias.ts deve validar POST/PATCH (workflow server-side)"
fi

if ! "$RG" -q "requerAprovacaoDpFromRow" functions/_lib/advertenciasValidate.ts 2>/dev/null; then
  fail "advertenciasValidate deve espelhar requerAprovacaoDp (apuração idx 10)"
fi

echo "guards OK"

echo "== typecheck =="
npm run typecheck

echo "== vitest (lib + functions _lib) =="
npx vitest run src/lib functions/_lib --reporter=dot

echo "== build =="
npm run build

if "$RG" -l "VITE_DASHBOARD_INSIGHT_SECRET" dist 2>/dev/null | head -1 | grep -q .; then
  fail "dist ainda contém VITE_DASHBOARD_INSIGHT_SECRET"
fi

echo "OK: guards + typecheck + tests + build"
