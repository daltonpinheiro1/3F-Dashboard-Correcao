#!/usr/bin/env bash
# Instala timer de sync SMB (systemd — Linux / VM Oracle).
# Bridge é opcional (INSTALL_BRIDGE=1) — na VM Oracle preferir só o timer (menos RAM).
# Uso: sudo bash scripts/install-atestados-service-linux.sh
#      sudo INSTALL_BRIDGE=1 bash scripts/install-atestados-service-linux.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_BRIDGE="${INSTALL_BRIDGE:-0}"

[[ "$(id -u)" -eq 0 ]] || { echo "Execute com sudo" >&2; exit 1; }

chmod +x "$ROOT/scripts/mount-atestados-smb.sh" "$ROOT/scripts/run-atestados-sync-linux.sh" \
  "$ROOT/scripts/sync-atestados-smb.mjs" "$ROOT/scripts/atestados-smb-bridge.mjs" 2>/dev/null || true

sed "s|__PROJECT_ROOT__|$ROOT|g" "$ROOT/scripts/atestados-sync.service.template" \
  > /etc/systemd/system/atestados-sync.service

cat > /etc/systemd/system/atestados-sync.timer <<'EOF'
[Unit]
Description=Sync SMB atestados a cada 5 min

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s
Unit=atestados-sync.service

[Install]
WantedBy=timers.target
EOF

if [[ "$INSTALL_BRIDGE" == "1" ]]; then
  sed "s|__PROJECT_ROOT__|$ROOT|g" "$ROOT/scripts/atestados-bridge.service.template" \
    > /etc/systemd/system/atestados-bridge.service
fi

systemctl daemon-reload
systemctl enable --now atestados-sync.timer

if [[ "$INSTALL_BRIDGE" == "1" ]]; then
  systemctl enable --now atestados-bridge.service
  echo "OK — atestados-sync.timer + atestados-bridge.service"
else
  systemctl disable --now atestados-bridge.service 2>/dev/null || true
  echo "OK — atestados-sync.timer (bridge omitido; INSTALL_BRIDGE=1 para ligar)"
fi

echo "Monte SMB: bash scripts/mount-atestados-smb.sh (ou deixe o timer montar)"
echo "ATESTADOS_SMB_ROOT tipicamente /mnt/3f-files/Atestados"
echo "Credenciais: .env.smb + domain 3FCONTACTCENTER (SMB_DOMAIN)"
