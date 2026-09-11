#!/usr/bin/env bash
# LaunchAgent (Mac logado): monta a pasta de rede e esvazia a fila SMB, seg–sex.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
export HOME="${HOME:-/Users/mac}"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

if [[ "${ATESTADOS_SYNC_WEEKENDS:-0}" != "1" ]]; then
  dow="$(date +%u)"
  if [[ "$dow" -gt 5 ]]; then
    echo "Fora de segunda a sexta — sync não roda."
    exit 0
  fi
fi

bash "$ROOT/scripts/mount-atestados-smb.sh"

NODE_BIN="$(command -v node || true)"
[[ -n "$NODE_BIN" ]] || { echo "node não encontrado" >&2; exit 1; }

# LaunchAgent não herda TCC do Terminal; osascript no Aqua vê o volume do Finder.
if [[ -n "${XPC_SERVICE_NAME:-}" ]]; then
  /usr/bin/osascript - "$ROOT" "$NODE_BIN" <<'APPLESCRIPT'
on run argv
  set projectRoot to item 1 of argv
  set nodeBin to item 2 of argv
  with timeout of 3600 seconds
    do shell script "export PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin; cd " & quoted form of projectRoot & " && " & quoted form of nodeBin & " scripts/sync-atestados-smb.mjs"
  end timeout
end run
APPLESCRIPT
  exit $?
fi

exec "$NODE_BIN" "$ROOT/scripts/sync-atestados-smb.mjs"
