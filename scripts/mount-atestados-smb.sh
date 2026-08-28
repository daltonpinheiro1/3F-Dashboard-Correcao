#!/usr/bin/env bash
# Monta //files/03 Operação (pasta Atestados fica em $SMB_MOUNT/Atestados)
# Credenciais: .env.smb (não versionado) — ver .env.smb.example
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ATESTADOS_SMB_ENV:-$ROOT/.env.smb}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

SMB_HOST="${SMB_HOST:-files}"
SMB_SHARE="${SMB_SHARE:-03 Operação}"
SMB_USER="${SMB_USER:-}"
SMB_PASSWORD="${SMB_PASSWORD:-}"
SMB_MOUNT="${SMB_MOUNT:-/Volumes/03 Operação}"

if [[ -z "$SMB_USER" || -z "$SMB_PASSWORD" ]]; then
  echo "Defina SMB_USER e SMB_PASSWORD em $ENV_FILE" >&2
  exit 1
fi

if mount | grep -F " on $SMB_MOUNT " >/dev/null 2>&1; then
  echo "Já montado: $SMB_MOUNT"
  ls -la "$SMB_MOUNT/Atestados" 2>/dev/null || ls -la "$SMB_MOUNT" | head -5
  exit 0
fi

mkdir -p "$SMB_MOUNT"

# % na senha precisa ser %25 na URL
PASS_ENC="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$SMB_PASSWORD")"
SHARE_ENC="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$SMB_SHARE")"
USER_ENC="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$SMB_USER")"

URI="//${USER_ENC}:${PASS_ENC}@${SMB_HOST}/${SHARE_ENC}"
echo "Montando smb://${SMB_HOST}/${SMB_SHARE} → $SMB_MOUNT"
mount_smbfs "$URI" "$SMB_MOUNT"

if [[ -d "$SMB_MOUNT/Atestados" ]]; then
  echo "OK — pasta Atestados acessível em: $SMB_MOUNT/Atestados"
else
  echo "Montado, mas pasta Atestados não encontrada em $SMB_MOUNT" >&2
  exit 2
fi
