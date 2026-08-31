#!/usr/bin/env bash
# Linux/VM: garante VPN→CIFS e roda sync da fila SMB.
# Usado pelo systemd (atestados-sync.service) ou manualmente:
#   bash scripts/run-atestados-sync-linux.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ATESTADOS_SMB_ENV:-$ROOT/.env.smb}"
LOG="${ATESTADOS_SYNC_LOG:-$ROOT/sync.log}"
NODE="$(command -v node || true)"
[[ -n "$NODE" ]] || NODE=/usr/local/bin/node

mkdir -p "$(dirname "$LOG")"

{
  date -Is
  # Carrega só ATESTADOS_SMB_ROOT / SMB_HOST para checagens (parser simples)
  SMB_HOST=192.168.10.33
  ATESTADOS_SMB_ROOT=/mnt/3f-files/Atestados
  SMB_MOUNT=/mnt/3f-files
  if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "${line// }" || "$line" == \#* || "$line" != *=* ]] && continue
      k="${line%%=*}"; v="${line#*=}"
      k="${k%"${k##*[![:space:]]}"}"; k="${k#"${k%%[![:space:]]*}"}"
      v="${v#"${v%%[![:space:]]*}"}"; v="${v%"${v##*[![:space:]]}"}"
      v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
      case "$k" in
        SMB_HOST) SMB_HOST="$v" ;;
        SMB_MOUNT) SMB_MOUNT="$v" ;;
        ATESTADOS_SMB_ROOT) ATESTADOS_SMB_ROOT="$v" ;;
      esac
    done < "$ENV_FILE"
  fi

  if ! ping -c1 -W2 "$SMB_HOST" >/dev/null 2>&1; then
    echo "ERRO: $SMB_HOST inacessível — VPN/OpenVPN?"
    exit 3
  fi

  if ! findmnt -n "$SMB_MOUNT" >/dev/null 2>&1; then
    bash "$ROOT/scripts/mount-atestados-smb.sh" || {
      echo "ERRO: mount CIFS falhou"
      exit 2
    }
  fi

  if [[ ! -d "$ATESTADOS_SMB_ROOT" ]]; then
    echo "ERRO: pasta Atestados ausente em $ATESTADOS_SMB_ROOT"
    exit 2
  fi

  "$NODE" "$ROOT/scripts/sync-atestados-smb.mjs"
} >>"$LOG" 2>&1
