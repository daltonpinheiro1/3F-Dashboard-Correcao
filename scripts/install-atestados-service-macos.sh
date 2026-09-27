#!/usr/bin/env bash
# Instala o bridge SMB. O sync a cada 5 min fica na VM, pela VPN.
# O Mac só entra sob demanda: bash scripts/atestados-fallback-mac.sh
# Uso: bash scripts/install-atestados-service-macos.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
BASH_BIN="$(command -v bash || true)"
PLIST_BRIDGE="$HOME/Library/LaunchAgents/com.3f.atestados-bridge.plist"
PLIST_SYNC="$HOME/Library/LaunchAgents/com.3f.atestados-sync.plist"
PLIST_WATCH="$HOME/Library/LaunchAgents/com.3f.atestados-smb-watch.plist"

[[ -n "$NODE" ]] || { echo "node não encontrado" >&2; exit 1; }
[[ -n "$BASH_BIN" ]] || { echo "bash não encontrado" >&2; exit 1; }
chmod +x "$ROOT/scripts/run-atestados-sync-macos.sh" "$ROOT/scripts/mount-atestados-smb.sh"

if [[ -f "$ROOT/scripts/com.3f.atestados-bridge.plist.template" ]]; then
  sed "s|__PROJECT_ROOT__|$ROOT|g; s|/usr/local/bin/node|$NODE|g" \
    "$ROOT/scripts/com.3f.atestados-bridge.plist.template" > "$PLIST_BRIDGE"
fi

UID_NUM="$(id -u)"
launchctl bootout "gui/${UID_NUM}/com.3f.atestados-sync" 2>/dev/null || true
launchctl bootout "gui/${UID_NUM}/com.3f.atestados-smb-watch" 2>/dev/null || true
launchctl disable "gui/${UID_NUM}/com.3f.atestados-sync" 2>/dev/null || true
launchctl disable "gui/${UID_NUM}/com.3f.atestados-smb-watch" 2>/dev/null || true
rm -f "$PLIST_SYNC" "$PLIST_WATCH"
launchctl bootout "gui/${UID_NUM}/com.3f.atestados-bridge" 2>/dev/null || true
if [[ -f "$PLIST_BRIDGE" ]]; then
  launchctl bootstrap "gui/${UID_NUM}" "$PLIST_BRIDGE"
  launchctl enable "gui/${UID_NUM}/com.3f.atestados-bridge"
fi

echo "OK — sync a cada 5 min ficou na VM, pela VPN (192.168.10.33)."
echo "Fallback do Mac, só sob demanda: bash scripts/atestados-fallback-mac.sh"
echo "Ele chama run-atestados-sync-macos.sh apenas quando a VPN nao alcanca o servidor."
