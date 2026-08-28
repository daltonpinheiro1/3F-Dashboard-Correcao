#!/usr/bin/env bash
# Instala bridge + timer de sync (systemd — Linux / VM Oracle).
# Uso: sudo bash scripts/install-atestados-service-linux.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

[[ "$(id -u)" -eq 0 ]] || { echo "Execute com sudo" >&2; exit 1; }

sed "s|__PROJECT_ROOT__|$ROOT|g" "$ROOT/scripts/atestados-bridge.service.template" \
  > /etc/systemd/system/atestados-bridge.service
sed "s|__PROJECT_ROOT__|$ROOT|g" "$ROOT/scripts/atestados-sync.service.template" \
  > /etc/systemd/system/atestados-sync.service

cat > /etc/systemd/system/atestados-sync.timer <<'EOF'
[Unit]
Description=Sync SMB atestados a cada 5 min

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=atestados-sync.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now atestados-bridge.service
systemctl enable --now atestados-sync.timer

echo "OK — systemctl status atestados-bridge atestados-sync.timer"
echo "Monte SMB em ATESTADOS_SMB_ROOT (.env.smb) antes do sync."
