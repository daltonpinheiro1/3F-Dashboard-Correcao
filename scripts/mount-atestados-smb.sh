#!/usr/bin/env bash
# Monta o share 03 Operação (pasta Atestados em $SMB_MOUNT/Atestados).
# - Linux/VM: mount.cifs + credentials file (senha fora de argv/`ps`)
# - macOS: mount_smbfs -N + nsmb.conf temporário (senha fora da URI)
# Credenciais: .env.smb (parser KEY=VALUE — sem `source` shell)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ATESTADOS_SMB_ENV:-$ROOT/.env.smb}"
CRED_DIR="${ATESTADOS_SMB_CRED_DIR:-$ROOT/.cache}"
mkdir -p "$CRED_DIR"
chmod 700 "$CRED_DIR" 2>/dev/null || true

# Parser seguro (não interpreta \, # no meio via source, nem $)
load_env_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" != *=* ]] && continue
    local k="${line%%=*}"
    local v="${line#*=}"
    k="${k%"${k##*[![:space:]]}"}"
    k="${k#"${k%%[![:space:]]*}"}"
    v="${v#"${v%%[![:space:]]*}"}"
    v="${v%"${v##*[![:space:]]}"}"
    if [[ "${v}" == \"*\" && "${v}" == *\" ]]; then
      v="${v#\"}"
      v="${v%\"}"
    elif [[ "${v}" == \'*\' && "${v}" == *\' ]]; then
      v="${v#\'}"
      v="${v%\'}"
    fi
    case "$k" in
      SMB_HOST|SMB_SHARE|SMB_USER|SMB_PASSWORD|SMB_MOUNT|ATESTADOS_SMB_ROOT|SMB_DOMAIN)
        printf -v "$k" '%s' "$v"
        export "$k"
        ;;
    esac
  done < "$f"
}

load_env_file "$ENV_FILE"

SMB_HOST="${SMB_HOST:-files}"
SMB_SHARE="${SMB_SHARE:-03 Operação}"
SMB_USER="${SMB_USER:-}"
SMB_PASSWORD="${SMB_PASSWORD:-}"
SMB_DOMAIN="${SMB_DOMAIN:-3FCONTACTCENTER}"
OS="$(uname -s)"

if [[ "$OS" == "Linux" ]]; then
  SMB_MOUNT="${SMB_MOUNT:-/mnt/3f-files}"
else
  SMB_MOUNT="${SMB_MOUNT:-/Volumes/03 Operação}"
fi

if [[ -z "$SMB_USER" || -z "$SMB_PASSWORD" ]]; then
  echo "Defina SMB_USER e SMB_PASSWORD em $ENV_FILE" >&2
  exit 1
fi

# Normaliza user: tira domain\ ou domain/ — domain fica em SMB_DOMAIN / UPN
SMB_USER_RAW="$SMB_USER"
if [[ "$SMB_USER" == *@* ]]; then
  SMB_DOMAIN=""
elif [[ "$SMB_USER" == *\\* ]]; then
  SMB_DOMAIN="${SMB_USER%%\\*}"
  SMB_USER="${SMB_USER#*\\}"
elif [[ "$SMB_USER" == */* ]]; then
  SMB_DOMAIN="${SMB_USER%%/*}"
  SMB_USER="${SMB_USER#*/}"
fi

already_mounted() {
  if [[ "$OS" == "Linux" ]]; then
    findmnt -n "$SMB_MOUNT" >/dev/null 2>&1
  else
    # NFC: mount point no macOS pode vir em NFD
    local target
    target="$(printf '%s' "$SMB_MOUNT" | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>process.stdout.write(s.normalize('NFC')))")"
    mount | node -e "
      let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{
        const t=process.argv[1];
        const ok=s.split('\n').some(l=>/smbfs|cifs/i.test(l) && l.includes(' on ') && l.normalize('NFC').includes(' on '+t+' '));
        process.exit(ok?0:1);
      });
    " "$target"
  fi
}

if already_mounted; then
  echo "Já montado: $SMB_MOUNT"
  ls -la "$SMB_MOUNT/Atestados" 2>/dev/null || ls -la "$SMB_MOUNT" | head -5
  exit 0
fi

mkdir -p "$SMB_MOUNT"

if [[ "$OS" == "Linux" ]]; then
  CRED_FILE="$CRED_DIR/atestados-smb.cred"
  {
    echo "username=${SMB_USER}"
    echo "password=${SMB_PASSWORD}"
    if [[ -n "${SMB_DOMAIN}" ]]; then
      echo "domain=${SMB_DOMAIN}"
    fi
  } >"$CRED_FILE"
  chmod 600 "$CRED_FILE"

  echo "Montando //${SMB_HOST}/${SMB_SHARE} → $SMB_MOUNT (cifs)"
  if [[ "$(id -u)" -eq 0 ]]; then
    mount -t cifs "//${SMB_HOST}/${SMB_SHARE}" "$SMB_MOUNT" \
      -o "credentials=${CRED_FILE},uid=${SUDO_UID:-0},gid=${SUDO_GID:-0},iocharset=utf8,file_mode=0664,dir_mode=0775,vers=3.0,sec=ntlmssp,_netdev"
  else
    sudo mount -t cifs "//${SMB_HOST}/${SMB_SHARE}" "$SMB_MOUNT" \
      -o "credentials=${CRED_FILE},uid=$(id -u),gid=$(id -g),iocharset=utf8,file_mode=0664,dir_mode=0775,vers=3.0,sec=ntlmssp,_netdev"
  fi
else
  # macOS: senha em nsmb.conf temporário (HOME isolado) — não vai na URI/`ps`
  TMP_HOME="$(mktemp -d "${TMPDIR:-/tmp}/atestados-smb-home.XXXXXX")"
  cleanup() { rm -rf "$TMP_HOME"; }
  trap cleanup EXIT
  mkdir -p "$TMP_HOME/Library/Preferences"

  HOST_KEY="$(printf '%s' "$SMB_HOST" | tr '[:lower:]' '[:upper:]')"
  USER_KEY="$SMB_USER"
  {
    echo "[default]"
    echo "minauth=ntlmv2"
    echo "[${HOST_KEY}:${USER_KEY}]"
    echo "password=${SMB_PASSWORD}"
    if [[ "$SMB_HOST" =~ ^[0-9.]+$ ]]; then
      echo "[${HOST_KEY}]"
      echo "addr=${SMB_HOST}"
    fi
  } >"$TMP_HOME/Library/Preferences/nsmb.conf"
  chmod 600 "$TMP_HOME/Library/Preferences/nsmb.conf"

  SHARE_ENC="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$SMB_SHARE")"
  if [[ -n "${SMB_DOMAIN}" && "$SMB_USER_RAW" != *@* ]]; then
    URI="//${SMB_DOMAIN};${SMB_USER}@${SMB_HOST}/${SHARE_ENC}"
  else
    URI="//${SMB_USER_RAW}@${SMB_HOST}/${SHARE_ENC}"
  fi

  echo "Montando smb://${SMB_HOST}/${SMB_SHARE} → $SMB_MOUNT (smbfs -N)"
  HOME="$TMP_HOME" mount_smbfs -N "$URI" "$SMB_MOUNT"
fi

if [[ -d "$SMB_MOUNT/Atestados" ]]; then
  echo "OK — pasta Atestados acessível em: $SMB_MOUNT/Atestados"
else
  echo "Montado, mas pasta Atestados não encontrada em $SMB_MOUNT" >&2
  exit 2
fi
