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
        SMB_HOST)
          case "$v" in
            files|files.*) SMB_HOST=192.168.10.33 ;;
            *) SMB_HOST="$v" ;;
          esac
          ;;
        SMB_MOUNT) SMB_MOUNT="$v" ;;
        ATESTADOS_SMB_ROOT) ATESTADOS_SMB_ROOT="$v" ;;
      esac
    done < "$ENV_FILE"
  fi

  ok=0
  for _ in 1 2 3 4 5 6; do
    if ping -c1 -W2 "$SMB_HOST" >/dev/null 2>&1; then
      ok=1
      break
    fi
    sleep 5
  done
  if [[ "$ok" -ne 1 ]]; then
    echo "adiado: $SMB_HOST sem resposta"
    exit 0
  fi

  fonte=$(findmnt -n -o SOURCE "$SMB_MOUNT" 2>/dev/null || true)
  if [[ -n "$fonte" && "$fonte" == *//files* ]]; then
    umount -l "$SMB_MOUNT" 2>/dev/null || true
    fonte=""
  fi
  if [[ -z "$fonte" ]]; then
    montou=0
    for _ in 1 2 3; do
      if bash "$ROOT/scripts/mount-atestados-smb.sh"; then
        montou=1
        break
      fi
      sleep 5
    done
    if [[ "$montou" -ne 1 ]]; then
      echo "ERRO: mount CIFS falhou"
      exit 2
    fi
  fi

  if ! timeout 8 test -d "$ATESTADOS_SMB_ROOT"; then
    echo "pasta ausente, remontando $SMB_MOUNT"
    umount -l "$SMB_MOUNT" 2>/dev/null || true
    bash "$ROOT/scripts/mount-atestados-smb.sh" || {
      echo "ERRO: mount CIFS falhou"
      exit 2
    }
    if ! timeout 8 test -d "$ATESTADOS_SMB_ROOT"; then
      echo "ERRO: pasta Atestados ausente em $ATESTADOS_SMB_ROOT"
      exit 2
    fi
  fi

  timeout 60 "$NODE" "$ROOT/scripts/sync-atestados-smb.mjs" || {
    echo "ERRO: sync falhou ou excedeu 60s"
    exit 1
  }
} >>"$LOG" 2>&1
