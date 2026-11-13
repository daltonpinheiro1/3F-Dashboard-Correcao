#!/usr/bin/env bash
# Antirregressão Consulta TIM (poll + timeline + explain + SSE + force_live).
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
check "src/lib/scoreTimService.ts" 'waitScoreTimResult' "waitScoreTimResult com fallback poll"
check "src/lib/scoreTimService.ts" 'subscribeScoreTimEvents' "EventSource SSE cliente"
check "src/lib/scoreTimService.ts" 'force_live' "enqueue repassa force_live"
check "src/lib/consultaTimIdentity.ts" 'applyPhoneIdentityChange' "identidade telefone"
check "src/lib/consultaTimTimeline.ts" 'timelineStepsFromProgress' "timeline progressiva"
check "src/lib/scoreTimExplain.ts" 'explainScoreOutcome' "explicabilidade outcome"
check "src/pages/ConsultaTimPage.tsx" 'Aquecendo sessão' "copy AUTH aquecimento"
check "src/pages/ConsultaTimPage.tsx" 'openTerminalResult' "modal no onProgress terminal"
check "src/pages/ConsultaTimPage.tsx" 'Resultado em cache \(24h\)' "dual-track cache UI"
check "src/pages/ConsultaTimPage.tsx" '400' "debounce CPF 400ms"
check "functions/api/score-tim.ts" 'status_poll' "BFF log status_poll"
check "functions/api/score-tim.ts" 'upstream_ms' "BFF mede upstream_ms"
check "functions/api/score-tim.ts" 'stream=1|streamScoreTimStatus|text/event-stream' "BFF SSE stream"
check "functions/api/score-tim.ts" 'force_live' "BFF valida force_live"
check "functions/api/score-tim.ts" 'score-tim-stream' "rate-limit stream dedicado"
check "functions/api/score-tim.ts" 'stream_open' "BFF log stream_open"
check "functions/api/score-tim.ts" 'stream_done' "BFF log stream_done"
check "functions/api/score-tim.ts" 'stream_error' "BFF log stream_error"
if [[ "$fail" -ne 0 ]]; then
  echo "Invariantes Consulta TIM quebradas."
  exit 1
fi
echo "Todas as invariantes Consulta TIM OK."
