#!/usr/bin/env bash
# Instala bridge SMB + sync (seg–sex, Mac logado) como LaunchAgents.
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

cat > "$PLIST_SYNC" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.3f.atestados-sync</string>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BASH_BIN</string>
    <string>$ROOT/scripts/run-atestados-sync-macos.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>
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

cat > "$PLIST_WATCH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.3f.atestados-smb-watch</string>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ROOT/scripts/smb-network-watcher.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>
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

UID_NUM="$(id -u)"
launchctl bootout "gui/${UID_NUM}/com.3f.atestados-bridge" 2>/dev/null || true
launchctl bootout "gui/${UID_NUM}/com.3f.atestados-sync" 2>/dev/null || true
launchctl bootout "gui/${UID_NUM}/com.3f.atestados-smb-watch" 2>/dev/null || true
if [[ -f "$PLIST_BRIDGE" ]]; then
  launchctl bootstrap "gui/${UID_NUM}" "$PLIST_BRIDGE"
  launchctl enable "gui/${UID_NUM}/com.3f.atestados-bridge"
fi
launchctl bootstrap "gui/${UID_NUM}" "$PLIST_SYNC"
launchctl bootstrap "gui/${UID_NUM}" "$PLIST_WATCH"
launchctl enable "gui/${UID_NUM}/com.3f.atestados-sync"
launchctl enable "gui/${UID_NUM}/com.3f.atestados-smb-watch"
launchctl kickstart -k "gui/${UID_NUM}/com.3f.atestados-sync" 2>/dev/null || true

echo "OK — este Mac (sessão logada, seg–sex) monta a pasta de rede e esvazia a fila a cada 5 min."
echo "Logs: /tmp/atestados-sync.log  /tmp/atestados-sync.err"
echo "Sábado/domingo não roda (forçar: ATESTADOS_SYNC_WEEKENDS=1)."
