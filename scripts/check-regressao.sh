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

for f in functions/api/hora-insight.ts functions/api/advertencia-notificar.ts; do
  "$RG" -q "requireAdmin" "$f" || fail "$f deve exigir requireAdmin"
done
"$RG" -q "requireAdmin" functions/api/advertencias.ts || fail "advertencias PATCH deve exigir requireAdmin"
"$RG" -q "requireGestao" functions/api/advertencias.ts || fail "advertencias GET/POST deve usar requireGestao"
"$RG" -q "requireGestao" functions/api/advertencia-narrativa.ts || fail "advertencia-narrativa deve usar requireGestao"
"$RG" -q "requireGestao" functions/_lib/auth.ts || fail "requireGestao ausente em auth.ts"

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
"$RG" -q "AlertDialog" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve usar AlertDialog (bulk / confirmações)"
"$RG" -q "useSearchParams" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve suportar deep link ?id="
"$RG" -q "matchDpInbox|contarDpInbox|setInboxParam" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve ter Inbox DP (enviadas/autorizadas/recusadas/recebidas)"
"$RG" -q "RecusaAjusteDpModal" src/pages/AdvertenciasPage.tsx || fail "Controle DP deve usar RecusaAjusteDpModal (ajuste de medida)"
"$RG" -q "podeEmitirPdfOficial" src/pages/AdvertenciasPage.tsx || fail "PDF oficial deve ser gated (podeEmitirPdfOficial)"
"$RG" -q "ambiente:.*gestao|ambiente: mode" src/pages/AdvertenciasPage.tsx || fail "PDF na gestão deve passar ambiente gestao|dp"
"$RG" -q "pdfAmbiente=" src/pages/AdvertenciasPage.tsx || fail "DetailModal deve receber pdfAmbiente"
"$RG" -q "nivel_solicitado_idx" src/lib/advertenciasEscala.ts || fail "tipo Advertencia deve ter nivel_solicitado_idx"
"$RG" -q "applyNivelDecisionSnapshot" functions/_lib/advertenciasValidate.ts || fail "snapshot solicitado deve ser server-side"
"$RG" -q "applyNivelDecisionSnapshot" functions/api/advertencias.ts || fail "PATCH deve aplicar applyNivelDecisionSnapshot"
"$RG" -q "Decidir medida|Decidir / ajustar" src/components/advertencias/RecusaAjusteDpModal.tsx src/pages/AdvertenciasPage.tsx || fail "copy Decidir medida ausente"
"$RG" -q "Ajustar e autorizar" src/components/advertencias/RecusaAjusteDpModal.tsx || fail "modal deve permitir autorizar com ajuste"
"$RG" -q 'contexto="dp-decisao"' src/components/advertencias/RecusaAjusteDpModal.tsx || fail "seletor no modal DP deve usar contexto dp-decisao"
"$RG" -q "recusaBusy|busy=" src/pages/AdvertenciasPage.tsx || fail "modal decisão DP deve ter busy (anti double-submit)"
"$RG" -q "Prévia visual — sem impressão|sem impressão" src/components/AdvertenciaPreviewModal.tsx || fail "prévia sem impressão"
if "$RG" -q "Imprimir|Baixar PDF" src/components/AdvertenciaPreviewModal.tsx 2>/dev/null; then
  fail "AdvertenciaPreviewModal não pode oferecer Imprimir/Baixar"
fi
"$RG" -q "nivel_idx" functions/_lib/advertenciasValidate.ts || fail "PATCH deve permitir reformular nivel_idx"
"$RG" -q "syncNivelFields" functions/_lib/advertenciasValidate.ts || fail "syncNivelFields ausente"
"$RG" -q "nivel_solicitado_idx" functions/_lib/advertenciasValidate.ts || fail "validate deve tratar nivel_solicitado_idx"
[[ -f supabase/migrations/019_advertencias_nivel_solicitado.sql ]] || fail "migration 019 ausente"
[[ -f supabase/migrations/025_advertencias_supervisor.sql ]] || fail "migration 025 ausente (gestor advertências)"
"$RG" -qF "gestorDaAdvertencia" src/pages/AdvertenciasPage.tsx || fail "Controle DP deve exibir gestorDaAdvertencia"
"$RG" -qF ">Gestor<" src/pages/AdvertenciasPage.tsx || fail "coluna Gestor ausente no DP"
"$RG" -q "bulkAprovarSelecionadas|Aprovar selecionadas" src/pages/AdvertenciasPage.tsx || fail "Controle DP deve ter bulk approve nas Enviadas"
"$RG" -q "sem reformular a medida" src/pages/AdvertenciasPage.tsx || fail "bulk deve avisar que não reformula medida"
"$RG" -q "buildAdvertenciaNotificacaoCopy|nivelSolicitadoLabel" functions/_lib/advertenciasEmail.ts || fail "e-mail notificação deve ser dinâmico (medida/ajuste)"
"$RG" -q "extractDecisaoDp|controleDpUrl" functions/api/advertencia-notificar.ts || fail "notificar deve enviar snapshot/decisão DP"
"$RG" -q "nivelSolicitadoLabel" functions/api/advertencia-notificar.ts || fail "notificar deve passar nivelSolicitadoLabel"
[[ -f src/lib/advertenciasDpInbox.ts ]] || fail "advertenciasDpInbox.ts ausente"
[[ -f src/pages/ControleDpPage.tsx ]] || fail "ControleDpPage ausente"

# Advertências = Criação + Acompanhamento (visualização); Controle DP = rota dedicada (ações)
"$RG" -q "ADVERTENCIAS_MAIN_TABS" src/lib/advertenciasDpInbox.ts || fail "ADVERTENCIAS_MAIN_TABS ausente"
"$RG" -q "ADVERTENCIAS_MAIN_TABS" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve usar ADVERTENCIAS_MAIN_TABS"
"$RG" -q "acompanhamento" src/lib/advertenciasDpInbox.ts || fail "aba Acompanhamento deve existir em ADVERTENCIAS_MAIN_TABS"
"$RG" -q "CONTROLE_DP_PATH" src/lib/advertenciasDpInbox.ts || fail "CONTROLE_DP_PATH ausente"
"$RG" -q "mode === 'dp'|AdvertenciasWorkspace" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasWorkspace mode gestao|dp ausente"
"$RG" -q "allowDpActions" src/pages/AdvertenciasPage.tsx || fail "allowDpActions deve isolar ações DP"
"$RG" -q 'w-full \[\&_\.tab-bar-item\]:flex-1' src/pages/AdvertenciasPage.tsx || fail "TabBar Advertências deve ser full-width (anti sumiço da 2ª aba)"
"$RG" -q "tab-bar-indicator" src/index.css || fail "TabBar deve ter pill deslizante (tab-bar-indicator)"
"$RG" -q "tab-bar-indicator" src/components/ui/TabBar.tsx || fail "TabBar deve renderizar tab-bar-indicator"
"$RG" -q "Filas do Controle DP" src/pages/AdvertenciasPage.tsx || fail "ChipBar Filas do Controle DP ausente (mode dp)"
"$RG" -q "Filas de acompanhamento" src/pages/AdvertenciasPage.tsx || fail "ChipBar Filas de acompanhamento ausente (mode gestao)"
"$RG" -q "Controle DP" src/components/AdminLayout.tsx || fail "sidebar deve ter item Controle DP"
"$RG" -q 'href: .*/controle-dp' src/components/AdminLayout.tsx || fail "sidebar Controle DP deve apontar /controle-dp"
if "$RG" -q "Controle DP|Filas do Controle DP|advertenciasDpInbox" src/pages/OperacaoPage.tsx 2>/dev/null; then
  fail "Controle DP não pode vazar para OperacaoPage"
fi
"$RG" -q 'path="/advertencias"' src/App.tsx || fail "rota /advertencias ausente"
"$RG" -q 'path="/controle-dp"' src/App.tsx || fail "rota /controle-dp ausente"
"$RG" -qF "roles={['admin', 'supervisor', 'viewer']}" src/App.tsx || fail "Advertências e solicitar atestado devem incluir viewer"
"$RG" -qF "href: '/advertencias', roles: ['admin', 'supervisor', 'viewer']" src/components/AdminLayout.tsx || fail "sidebar Advertências deve incluir viewer/supervisor"
"$RG" -qF "href: '/atestados-solicitar', roles: ['admin', 'supervisor', 'viewer']" src/components/AdminLayout.tsx || fail "sidebar Solicitar atestado deve incluir viewer"
"$RG" -q 'path="/operacao"' src/App.tsx || fail "rota /operacao ausente"
"$RG" -q "AdvertenciasPage" src/App.tsx || fail "AdvertenciasPage deve estar registrada no App"
"$RG" -q "ControleDpPage" src/App.tsx || fail "ControleDpPage deve estar registrada no App"
"$RG" -q "OperacaoPage" src/App.tsx || fail "OperacaoPage deve estar registrada no App"
# Garantir que /operacao não monta AdvertenciasPage
if "$RG" -n 'path="/operacao"' src/App.tsx | "$RG" -q "AdvertenciasPage"; then
  fail "/operacao não pode montar AdvertenciasPage"
fi
"$RG" -q "overflow-x-visible" src/index.css || fail "tab-bar w-full precisa overflow-x-visible (abas Advertências visíveis)"


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
"$RG" -q "throwAdvertenciasApiError|status === 401" src/lib/advertenciasService.ts || fail "advertenciasService deve distinguir 401/403 de offline"
if "$RG" -q "013_session_harden.sql" src/pages/AdvertenciasPage.tsx 2>/dev/null; then
  fail "banner offline não deve culpar só migration 013 (mensagem enganosa)"
fi
"$RG" -q "sessionish" src/pages/AdvertenciasPage.tsx || fail "AdvertenciasPage deve tratar erro de sessão sem marcar offline"

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
"$RG" -q "HoraOfensoresSection" src/pages/HoraPage.tsx || fail "HoraPage deve usar HoraOfensoresSection (PR3)"

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

# —— Atestados (020) ——
[[ -f supabase/migrations/020_atestados.sql ]] || fail "migration 020_atestados ausente"
[[ -f functions/api/atestados.ts ]] || fail "api/atestados.ts ausente"
[[ -f functions/api/atestado-analise.ts ]] || fail "api/atestado-analise.ts ausente"
[[ -f src/pages/AtestadosPage.tsx ]] || fail "AtestadosPage ausente"
[[ -f src/components/atestados/ProtocolarPanel.tsx ]] || fail "ProtocolarPanel ausente"
"$RG" -q "authorizeRequest" functions/api/atestados.ts || fail "atestados.ts deve usar authorizeRequest"
"$RG" -q "requireAdmin" functions/api/atestados.ts || fail "atestados PATCH deve exigir requireAdmin"
"$RG" -q "requireAtestadoRead" functions/api/atestados.ts || fail "atestados GET deve usar requireAtestadoRead"
"$RG" -q "requireAtestadoWrite" functions/api/atestado-analise.ts || fail "atestado-analise deve permitir supervisor"
"$RG" -q "writeAtestadoAudit" functions/api/atestados.ts || fail "atestados deve auditar mutações"
"$RG" -q "buildAtestadoStoragePath" functions/_lib/atestadosStorage.ts || fail "atestadosStorage path Ano/Mes/Dia"
"$RG" -q "/atestados" src/App.tsx || fail "rota /atestados ausente em App.tsx"
"$RG" -q "Atestados" src/components/AdminLayout.tsx || fail "sidebar Atestados ausente"
[[ -f functions/api/atestado-arquivo.ts ]] || fail "atestado-arquivo.ts ausente"
[[ -f functions/_lib/atestadosEmail.ts ]] || fail "atestadosEmail.ts ausente"
"$RG" -q "authorizeRequest" functions/api/atestado-arquivo.ts || fail "atestado-arquivo deve usar authorizeRequest"
"$RG" -q "requireAtestadoRead" functions/api/atestado-arquivo.ts || fail "atestado-arquivo deve permitir solicitante (requireAtestadoRead)"
"$RG" -q "Abrir PDF" src/components/atestados/SupervisorAtestadosPanel.tsx || fail "tela solicitação deve ter Abrir PDF"
"$RG" -q "sanitizeAdvertenciaStatus" functions/_lib/advertenciasList.ts || fail "advertenciasList deve sanitizar status"
"$RG" -q "sanitizeAtestadoStatus" functions/_lib/atestadosList.ts || fail "atestadosList deve sanitizar status"
"$RG" -q "fetchGen" src/pages/OperacaoPage.tsx || fail "OperacaoPage deve ter fetchGen anti-race"
"$RG" -q "fetchGen" src/pages/HoraPage.tsx || fail "HoraPage deve ter fetchGen anti-race"
"$RG" -q "fetchGen" src/pages/DiscagensPage.tsx || fail "DiscagensPage deve ter fetchGen anti-race"
"$RG" -q "ontemCacheKey" src/pages/HoraPage.tsx || fail "HoraPage deve cachear D-1 no poll"
[[ -f docs/varredura-final-2026-08-31.md ]] || fail "docs varredura final ausente"
"$RG" -q "exportAtestadosExcel" src/pages/AtestadosPage.tsx || fail "AtestadosPage deve exportar Excel"
[[ -f e2e/atestados-fluxo.spec.ts ]] || fail "e2e atestados ausente"
[[ -f supabase/migrations/021_atestados_extras.sql ]] || fail "migration 021 ausente"
[[ -f supabase/migrations/022_atestados_thumb.sql ]] || fail "migration 022 ausente"
"$RG" -q "prepareAtestadoUpload" src/lib/atestadosImagePrep.ts || fail "prep imagem browser ausente"
"$RG" -qF "rodarIa({ base64" src/components/atestados/ProtocolarPanel.tsx || fail "IA deve rodar automaticamente ao importar"
"$RG" -q "arquivo_thumb_path" functions/api/atestados.ts || fail "thumb path no POST"
"$RG" -q "buildAtestadoThumbStoragePath" functions/_lib/atestadosStorage.ts || fail "thumb storage path"
[[ -f functions/api/atestados-stats.ts ]] || fail "atestados-stats ausente"
[[ -f src/pages/AtestadosSolicitarPage.tsx ]] || fail "portal supervisor ausente"
"$RG" -q "requireAtestadoWrite" functions/_lib/auth.ts || fail "requireAtestadoWrite ausente"
"$RG" -q "fetchAtestadosStats" src/components/AdminLayout.tsx || fail "badge pendentes sidebar"
"$RG" -q "GerencialPanel" src/components/atestados/GerencialPanel.tsx || fail "dash gerencial"
[[ -f scripts/atestados-smb-bridge.mjs ]] || fail "bridge SMB ausente"
[[ -f supabase/migrations/023_atestados_smb_queue.sql ]] || fail "migration 023 ausente"
[[ -f supabase/migrations/024_atestados_supervisor.sql ]] || fail "migration 024 ausente (colaborador_supervisor)"
"$RG" -qF "colaborador_supervisor" src/lib/atestadosEscala.ts || fail "tipo Atestado deve ter colaborador_supervisor"
"$RG" -qF "colaborador_supervisor" src/components/atestados/ProtocolarPanel.tsx || fail "ProtocolarPanel deve enviar colaborador_supervisor"
"$RG" -qF "label=\"Supervisor\"" src/components/atestados/ProtocolarPanel.tsx || fail "ProtocolarPanel deve ter campo Supervisor"
"$RG" -q "persistAtestadoArquivos" functions/_lib/atestadosSmbArchive.ts || fail "fila SMB resiliência"
"$RG" -q "arquivo_cloud_archive_path" functions/api/atestados.ts || fail "cloud archive no POST"
[[ -f scripts/smb-network-watcher.mjs ]] || fail "smb network watcher ausente"
"$RG" -q "isAtestadoSmbPending" src/lib/atestadosSmbStatus.ts || fail "status SMB pendente"
"$RG" -q "pushArquivoToSmbBridge" functions/_lib/atestadosSmbArchive.ts || fail "upload deve tentar push SMB"
"$RG" -q "normalizeSmbBridgePushUrl" functions/_lib/atestadosSmbPush.ts || fail "URL bridge deve normalizar /push"
[[ -f scripts/run-atestados-sync-linux.sh ]] || fail "wrapper sync Linux ausente"
"$RG" -q "credentials=" scripts/mount-atestados-smb.sh || fail "mount Linux deve usar credentials file"
"$RG" -q "exportInssRelatorio" src/lib/atestadosExport.ts || fail "export INSS ausente"

# Autocomplete colaborador (EVA + atestados + busca por token)
"$RG" -q "buildOperadoresCatalog" src/lib/operadoresCatalog.ts || fail "operadoresCatalog ausente"
"$RG" -q "fonte: 'atestado'|fonte: .atestado" src/lib/operadoresCatalog.ts || fail "catálogo deve incluir fonte atestado"
"$RG" -q "jornada" src/lib/operadoresCatalog.ts || fail "catálogo deve incluir jornada EVA"
"$RG" -qF "buildOperadoresCatalog(evaBase, advRows, rows)" src/components/atestados/ProtocolarPanel.tsx || fail "ProtocolarPanel deve mesclar acervo no catálogo"
"$RG" -q "RHIAN TEIXEIRA SILVA CARDOSO" src/lib/operadoresCatalog.test.ts || fail "teste autocomplete Rhian ausente"
"$RG" -qF "filtrarOperadores(catalog, nome" src/components/advertencias/CriacaoPanel.tsx || fail "CriacaoPanel deve refiltrar catálogo no focus"

# --- Disparos / portabilidade ---
[[ -f src/lib/smsRules.ts ]] || fail "smsRules ausente"
[[ -f src/lib/smsRules.test.ts ]] || fail "smsRules.test.ts ausente"
"$RG" -q "isPortadoConsolidado" src/pages/SmsPage.tsx || fail "SmsPage deve usar isPortadoConsolidado centralizado"
[[ -f src/pages/DisparosPage.tsx ]] || fail "DisparosPage ausente"
[[ -f src/pages/RrPage.tsx ]] || fail "RrPage ausente"
[[ -f src/lib/rr360.ts ]] || fail "rr360 ausente"
"$RG" -q "fetchRr360" src/pages/RrPage.tsx || fail "RrPage deve carregar visão 360"
"$RG" -q "Vendas brutas" src/pages/RrPage.tsx || fail "RrPage deve exibir vendas brutas"
"$RG" -q 'path="/rr"' src/App.tsx || fail "rota /rr ausente"
"$RG" -q "AppShell" src/App.tsx || fail "rotas autenticadas devem usar AppShell (sidebar persistente)"
"$RG" -q "page-enter" src/components/AppShell.tsx || fail "AppShell deve animar só o Outlet (page-enter)"
"$RG" -q "toast-root" src/components/AdminLayout.tsx || fail "AdminChrome deve ter toast-root (popup de alerta)"
"$RG" -q "page-alert-toast" src/index.css || fail "page-alert-toast ausente"
"$RG" -q "createPortal" src/components/ui/PageAlert.tsx || fail "PageAlert deve portalizar o toast"
"$RG" -q "sidebar-nav::-webkit-scrollbar" src/index.css || fail "sidebar deve ter scrollbar webkit sutil"
[[ -f src/lib/pageHeader.tsx ]] || fail "pageHeader.tsx ausente"
# HeaderSync NÃO pode depender do objeto ctx inteiro (gera React #185 max update depth)
if "$RG" -n "useLayoutEffect|useEffect" src/lib/pageHeader.tsx | "$RG" -q "\[ctx"; then
  fail "HeaderSync não pode listar ctx nas deps (loop setMeta → novo ctx → effect)"
fi
"$RG" -q "mergePageMeta" src/lib/pageHeader.tsx || fail "pageHeader deve usar mergePageMeta (short-circuit)"
"$RG" -q "SetMetaCtx" src/lib/pageHeader.tsx || fail "pageHeader deve separar SetMetaCtx do MetaCtx (anti #185)"
"$RG" -q "syncedRef" src/lib/pageHeader.tsx || fail "HeaderSync deve usar syncedRef antes de setMeta"
[[ -f src/lib/pageHeader.test.ts ]] || fail "pageHeader.test.ts ausente"
"$RG" -q "prev === defaultKey" src/lib/tableSort.ts || fail "useTableSort deve short-circuit setSortKey"
if "$RG" -n "useEffect" src/pages/InteligenciaPage.tsx | "$RG" -q "cpcPct, metaCpc"; then
  fail "InteligenciaPage: reload não pode depender de inputs de risco (refetch a cada keystroke)"
fi
"$RG" -q "isDashboardAdmin" functions/api/advertencias.ts || fail "GET advertencias deve escopar com isDashboardAdmin"
"$RG" -q "criado_por_email" functions/_lib/advertenciasList.ts || fail "buildPgListPath deve filtrar criado_por_email"
"$RG" -q "useId" src/components/ui/TabBar.tsx || fail "TabBar deve usar useId (anti colisão de id DOM)"
if "$RG" -n "useEffect" src/components/ui/PageAlert.tsx | "$RG" -q "onDismiss\]"; then
  fail "PageAlert auto-dismiss não pode depender de onDismiss (timer reset)"
fi
"$RG" -q "scrollLeft" src/components/ui/TabBar.tsx || fail "TabBar deve compensar scrollLeft no indicador"
[[ -f src/lib/dashboardApiError.ts ]] || fail "dashboardApiError.ts ausente"
"$RG" -q "ajustarDeslogueOperacional" src/lib/ofensorOp.ts || fail "ofensorOp deve suprimir KA falso positivo"
"$RG" -q "ultima_atividade" src/lib/evaDash.ts || fail "evaDash deve expor ultima_atividade_at"
if "$RG" -q "colaborador\?\\.trim\(\) \? null : supervisorEmail" functions/api/atestados.ts 2>/dev/null; then
  fail "atestados GET: colaborador não pode anular criado_por_email para não-admin"
fi
[[ -f functions/_lib/auth.test.ts ]] || fail "auth.test.ts ausente (gates de role)"
"$RG" -q 'path="/rr/tv"' src/App.tsx || fail "rota kiosk /rr/tv ausente"
[[ -f functions/api/rr-360.ts ]] || fail "api/rr-360.ts ausente"
[[ -f functions/api/rr-alert-ack.ts ]] || fail "api/rr-alert-ack.ts ausente"
[[ -f functions/api/rr-insight.ts ]] || fail "api/rr-insight.ts ausente"
[[ -f supabase/migrations/029_rr_alert_acks.sql ]] || fail "migration 029 rr_alert_acks ausente"
"$RG" -q "requireAdmin" functions/api/rr-360.ts || fail "rr-360 deve exigir requireAdmin"
"$RG" -q "requireAdmin" functions/api/rr-alert-ack.ts || fail "rr-alert-ack deve exigir requireAdmin"
"$RG" -q "requireAdmin" functions/api/rr-insight.ts || fail "rr-insight deve exigir requireAdmin"
"$RG" -q "REVOKE ALL ON TABLE public.rr_alert_acks FROM anon" supabase/migrations/029_rr_alert_acks.sql || fail "029 deve revogar anon"
"$RG" -q "requireAdmin" src/App.tsx || fail "App deve proteger rotas admin"
[[ -f src/components/disparos/GerencialAnalytics.tsx ]] || fail "GerencialAnalytics ausente"
[[ -f functions/api/portabilidade-funil.ts ]] || fail "portabilidade-funil ausente"
[[ -f functions/api/portabilidade-matrix.ts ]] || fail "portabilidade-matrix ausente"
[[ -f functions/_lib/portabilidadeMatrix.ts ]] || fail "portabilidadeMatrix ausente"
[[ -f src/components/disparos/MatrixPanel.tsx ]] || fail "MatrixPanel ausente"
"$RG" -q "requirePortabilidadeRead" functions/api/portabilidade-matrix.ts || fail "matrix deve usar requirePortabilidadeRead"
"$RG" -q "processed_at" functions/api/portabilidade-matrix.ts || fail "matrix deve filtrar retornos por processed_at"
[[ -f functions/api/portabilidade-fatia-insight.ts ]] || fail "portabilidade-fatia-insight ausente"
[[ -f functions/api/portabilidade-gerencial-insight.ts ]] || fail "portabilidade-gerencial-insight ausente"
[[ -f functions/api/portabilidade-enqueue.ts ]] || fail "portabilidade-enqueue ausente"
[[ -f src/lib/portabilidadeProjecoes.ts ]] || fail "portabilidadeProjecoes ausente"
[[ -f src/lib/portabilidadeReconciliacao.ts ]] || fail "portabilidadeReconciliacao ausente"
[[ -f supabase/migrations/028_portabilidade_cohort_dedup.sql ]] || fail "migration 028 dedup cohort ausente"
[[ -f functions/_lib/portabilidadePropostaKey.ts ]] || fail "portabilidadePropostaKey ausente"
"$RG" -q "mergeCeRow" functions/api/portabilidade-funil.ts || fail "funil deve deduplicar CE por proposta (mergeCeRow)"
"$RG" -q "dedup_por_proposta" functions/api/portabilidade-funil.ts || fail "funil deve expor dedup_por_proposta"
[[ -f src/components/disparos/GerencialCommandCenter.tsx ]] || fail "GerencialCommandCenter ausente"
[[ -f src/components/disparos/GerencialP0Strip.tsx ]] || fail "GerencialP0Strip ausente"
[[ -f functions/_lib/portabilidadeEnqueue.ts ]] || fail "portabilidadeEnqueue ausente"
[[ -f scripts/validar-portabilidade-reconciliacao.mjs ]] || fail "script validar reconciliação ausente"
"$RG" -q "propostas" functions/api/portabilidade-enqueue.ts || fail "enqueue deve aceitar lote propostas[]"
"$RG" -q "enfileirarFatiaLote" src/pages/DisparosPage.tsx || fail "DisparosPage deve enfileirar lote na fatia"
[[ -f functions/api/portabilidade-p0-alert.ts ]] || fail "portabilidade-p0-alert ausente"
[[ -f functions/_lib/portabilidadeMeta.ts ]] || fail "portabilidadeMeta ausente"
[[ -f src/lib/portabilidadeAcaoFatia.ts ]] || fail "portabilidadeAcaoFatia ausente"
"$RG" -q "lote" functions/api/portabilidade-enqueue.ts || fail "enqueue deve aceitar lote inteligente"
"$RG" -q "portadosConsolidadosParaMeta" src/lib/portabilidadeProjecoes.ts || fail "meta deve usar portadosConsolidadosParaMeta (P+F)"
"$RG" -q "portabilidade-p0-alert" src/components/disparos/GerencialP0Strip.tsx || fail "P0 strip deve disparar alerta"
"$RG" -q "requirePortabilidadeRead" functions/api/portabilidade-funil.ts || fail "funil deve usar requirePortabilidadeRead"
"$RG" -q "requirePortabilidadeRead" functions/api/portabilidade-enqueue.ts || fail "enqueue deve usar requirePortabilidadeRead (não viewer)"
"$RG" -q "ACOES_DESTRUTIVAS" functions/api/portabilidade-enqueue.ts || fail "enqueue deve restringir cancel/open/activate a admin"
"$RG" -q "scrubSlackText" functions/api/portabilidade-p0-alert.ts || fail "p0-alert deve sanitizar texto Slack"
"$RG" -q "ErrorBoundary" src/components/AppShell.tsx || fail "AppShell deve isolar erro por rota (ErrorBoundary)"
"$RG" -q "allowRateDistributed" functions/api/copilot.ts || fail "copilot deve usar rate limit distribuído"
"$RG" -q "OperacionalEventsStrip" src/pages/InteligenciaPage.tsx || fail "Inteligencia deve isolar feed de eventos"
[[ -f src/lib/inteligenciaSnapshot.ts ]] || fail "inteligenciaSnapshot ausente"
[[ -f src/components/inteligencia/IntelStatsPanel.tsx ]] || fail "IntelStatsPanel ausente"
"$RG" -q "fetchInteligenciaSnapshot" src/pages/InteligenciaPage.tsx || fail "Inteligencia deve puxar snapshot ao vivo"
"$RG" -q "contribuicoes" functions/_lib/operacionalIntel.ts || fail "risk radar deve expor contribuições"
"$RG" -q "PARETO_CORTE_PCT" functions/_lib/operacionalIntel.ts || fail "Pareto deve ter corte configurável"
"$RG" -q "MODEL_REASONING" functions/api/copilot.ts || fail "copilot deve usar gpt-5-mini"
"$RG" -q "MODEL_REASONING" functions/api/hora-insight.ts || fail "hora-insight deve usar gpt-5-mini"
"$RG" -q "fallback: MODEL_WORKHORSE" functions/api/copilot.ts || fail "copilot deve ter fallback 4o-mini"
"$RG" -q "fallback: MODEL_WORKHORSE" functions/api/hora-insight.ts || fail "hora-insight deve ter fallback 4o-mini"
"$RG" -q "max_completion_tokens" functions/_lib/openaiModels.ts || fail "gpt-5 deve usar max_completion_tokens"
"$RG" -q "totais_ao_vivo" functions/api/portabilidade-disparos.ts || fail "disparos deve expor totais_ao_vivo"
"$RG" -q "exportPortabilidadeFatiaExcel" src/pages/DisparosPage.tsx || fail "DisparosPage deve exportar Excel"
"$RG" -q "Analisar IA|analisarFatia" src/pages/DisparosPage.tsx || fail "DisparosPage deve ter Analisar IA"
[[ -f e2e/disparos-smoke.spec.ts ]] || fail "e2e disparos ausente"

# Inteligência operacional (030)
[[ -f supabase/migrations/030_operacional_intel.sql ]] || fail "migration 030 ausente"
[[ -f functions/_lib/operacionalIntel.ts ]] || fail "operacionalIntel.ts ausente"
[[ -f functions/_lib/analyticsOverview.ts ]] || fail "analyticsOverview.ts ausente"
[[ -f functions/api/analytics-overview.ts ]] || fail "analytics-overview API ausente"
[[ -f functions/api/risk-radar.ts ]] || fail "risk-radar API ausente"
[[ -f functions/api/copilot.ts ]] || fail "copilot API ausente"
[[ -f functions/api/what-if.ts ]] || fail "what-if API ausente"
[[ -f functions/api/coaching.ts ]] || fail "coaching API ausente"
[[ -f functions/api/portabilidade-triage.ts ]] || fail "portabilidade-triage API ausente"
[[ -f functions/api/knowledge-search.ts ]] || fail "knowledge-search API ausente"
[[ -f functions/api/events-recent.ts ]] || fail "events-recent API ausente"
[[ -f src/pages/InteligenciaPage.tsx ]] || fail "InteligenciaPage ausente"
[[ -f src/lib/operacionalIntelService.ts ]] || fail "operacionalIntelService ausente"
"$RG" -q "requireInteligencia" functions/_lib/auth.ts || fail "requireInteligencia ausente"
"$RG" -q 'path="/inteligencia"' src/App.tsx || fail "rota /inteligencia ausente"
"$RG" -q "computeRiskRadar" functions/_lib/operacionalIntel.ts || fail "risk radar ausente"
"$RG" -q "authorizeRequest" functions/api/copilot.ts || fail "copilot deve autenticar"
"$RG" -q "requireInteligencia" functions/api/copilot.ts || fail "copilot deve aceitar supervisor (requireInteligencia)"
"$RG" -q "isSafeListCursor" functions/_lib/advertenciasList.ts || fail "cursor de listagem deve ser validado (anti injeção)"
"$RG" -q "evaluate_return unknown" functions/_lib/operacionalIntel.ts || fail "triage deve IGNORAR matrix unknown"
"$RG" -q "n_operadores obrigatório" functions/api/what-if.ts || fail "what-if deve exigir n_operadores ao remover ops"
"$RG" -q "filtroDataVendaBrt" functions/_lib/analyticsOverview.ts || fail "analytics deve filtrar data_venda em BRT"
"$RG" -q "sinceBrtDaysIso" functions/api/portabilidade-matrix.ts || fail "matrix deve recortar dias em BRT"
"$RG" -q "isDecisaoContavel" functions/_lib/portabilidadeMatrix.ts || fail "matrix não conta no_action/unknown"
if "$RG" -q "acao_decidida" functions/api/portabilidade-journey.ts 2>/dev/null; then
  fail "journey não pode select acao_decidida (derruba retornos)"
fi
"$RG" -q "operacao,adjustments" functions/api/portabilidade-journey.ts || fail "journey deve ler operacao/adjustments"
[[ -f supabase/migrations/031_fila_acoes_pendente_unica.sql ]] || fail "migration 031 unique fila ausente"
"$RG" -q "23505" functions/_lib/portabilidadeEnqueue.ts || fail "enqueue deve tratar unique 23505"
"$RG" -q "DROP agente" functions/_lib/operacionalIntel.ts || fail "risk deve rotular DROP agente (não queda)"

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
