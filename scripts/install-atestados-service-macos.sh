#!/usr/bin/env bash
# Instala bridge SMB + sync periódico como LaunchAgents (macOS).
# Uso: bash scripts/install-atestados-service-macos.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
PLIST_BRIDGE="$HOME/Library/LaunchAgents/com.3f.atestados-bridge.plist"
PLIST_SYNC="$HOME/Library/LaunchAgents/com.3f.atestados-sync.plist"

[[ -n "$NODE" ]] || { echo "node não encontrado" >&2; exit 1; }

sed "s|__PROJECT_ROOT__|$ROOT|g; s|/usr/local/bin/node|$NODE|g" \
  "$ROOT/scripts/com.3f.atestados-bridge.plist.template" > "$PLIST_BRIDGE"

cat > "$PLIST_SYNC" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.3f.atestados-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ROOT/scripts/sync-atestados-smb.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/atestados-sync.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/atestados-sync.err</string>
</dict>
</plist>
EOF

PLIST_WATCH="$HOME/Library/LaunchAgents/com.3f.atestados-smb-watch.plist"

cat > "$PLIST_WATCH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.3f.atestados-smb-watch</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ROOT/scripts/smb-network-watcher.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/atestados-smb-watch.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/atestados-smb-watch.err</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/com.3f.atestados-bridge" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.3f.atestados-sync" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.3f.atestados-smb-watch" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_BRIDGE"
launchctl bootstrap "gui/$(id -u)" "$PLIST_SYNC"
launchctl bootstrap "gui/$(id -u)" "$PLIST_WATCH"
launchctl enable "gui/$(id -u)/com.3f.atestados-bridge"
launchctl enable "gui/$(id -u)/com.3f.atestados-sync"
launchctl enable "gui/$(id -u)/com.3f.atestados-smb-watch"

echo "OK — bridge (8788) + sync (5 min) + watcher rede (90s) instalados."
echo "Logs: /tmp/atestados-bridge.log /tmp/atestados-sync.log"
echo "Configure .env.smb e monte o SMB antes do sync."
