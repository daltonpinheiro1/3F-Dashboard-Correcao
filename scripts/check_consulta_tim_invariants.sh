#!/usr/bin/env bash
# Antirregressão Consulta TIM (poll adaptativo + identidade + BFF).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
check() {
  local file="$1" pat="$2" label="$3"
  if ! grep -qE "$pat" "$ROOT/$file"; then
    echo "FAIL: $label ($file ~ /$pat/)"
    fail=1
  else
    echo "OK: $label"
  fi
}
check "src/lib/scoreTimService.ts" 'export function pollIntervalMs' "pollIntervalMs exportado"
check "src/lib/scoreTimService.ts" 'return Math.min\(base, 500\)' "QUERY quente poll 500ms"
check "src/lib/scoreTimService.ts" 'POLL_DEADLINE_AUTH_MS' "prazo AUTH em parede"
check "src/lib/consultaTimIdentity.ts" 'applyPhoneIdentityChange' "identidade telefone"
check "src/pages/ConsultaTimPage.tsx" 'Aquecendo sessão' "copy AUTH aquecimento"
check "functions/api/score-tim.ts" 'status_poll' "BFF log status_poll"
check "functions/api/score-tim.ts" 'upstream_ms' "BFF mede upstream_ms"
if [[ "$fail" -ne 0 ]]; then
  echo "Invariantes Consulta TIM quebradas."
  exit 1
fi
echo "Todas as invariantes Consulta TIM OK."
