#!/usr/bin/env bash
# Sob demanda. O Mac só grava na rede se a VM não alcançar o servidor pela VPN.
# Uso: bash scripts/atestados-fallback-mac.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${VM_SSH_KEY:-$HOME/Downloads/ssh-key-2026-04-07.key}"
HOST="${VM_SSH_HOST:?defina VM_SSH_HOST (ex.: ubuntu@<ip-da-vm>)}"

vpn=$(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 "$HOST" '
  if ping -c1 -W3 192.168.10.33 >/dev/null 2>&1 \
    && findmnt -n -o SOURCE /mnt/3f-files 2>/dev/null | grep -q "192.168.10.33"; then
    echo ok
  else
    echo fail
  fi
' 2>/dev/null || echo fail)

if [[ "$vpn" == "ok" ]]; then
  echo "VPN da VM alcanca 192.168.10.33. O Mac nao sincroniza."
  exit 0
fi

echo "VPN sem acesso ao servidor. Fallback do Mac, uma vez, pelo IP."
exec bash "$ROOT/scripts/run-atestados-sync-macos.sh"
