#!/usr/bin/env node
/**
 * Sincroniza fila SMB pendente + catch-up legado.
 * 1) Pendentes: arquivo_cloud_archive_path → SMB, marca synced, remove archive
 * 2) Legado: arquivo_path no bucket (sem _thumb/_pending) → SMB se ausente
 *
 * Agendar (cron a cada 5 min):
 *   cd /path && npm run smb:sync
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LOCK_PATH = path.join(ROOT, '.cache', 'smb-sync.lock');

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (override || process.env[k] === undefined) process.env[k] = v;
  }
}

// Arquivos do projeto têm prioridade sobre env herdado do shell (evita Qigger vs dashboard).
loadEnvFile(path.join(ROOT, '.env'), { override: true });
loadEnvFile(path.join(ROOT, '.dev.vars'), { override: true });
loadEnvFile(path.join(ROOT, '.env.smb'), { override: true });

/** Atestados vivem no Supabase do dashboard (VITE_*), não no Qigger/portabilidade. */
const SUPABASE_URL = String(
  process.env.ATESTADOS_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '',
).replace(/\/$/, '');
/** Pages usa SUPABASE_SERVICE_KEY; scripts também aceitam SERVICE_ROLE_KEY. */
const SERVICE_KEY = String(
  process.env.ATESTADOS_SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_KEY ||
    '',
).trim();
const SMB_ROOT = (process.env.ATESTADOS_SMB_ROOT || '/Volumes/03 Operação/Atestados').replace(/\/+$/g, '');
const BUCKET = 'atestados-docs';
const LIMIT = Number(process.env.ATESTADOS_SYNC_LIMIT || 100);

function acquireLock() {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  try {
    const fd = fs.openSync(LOCK_PATH, 'wx');
    fs.writeSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
    return () => {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(LOCK_PATH);
      } catch {
        /* ignore */
      }
    };
  } catch {
    try {
      const prev = Number(String(fs.readFileSync(LOCK_PATH, 'utf8').split('\n')[0] || '').trim());
      if (prev > 1) {
        try {
          process.kill(prev, 0);
          return null; // ainda rodando
        } catch {
          fs.unlinkSync(LOCK_PATH);
          return acquireLock();
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}

function normPath(p) {
  return path.resolve(p).normalize('NFC');
}

function isRemoteMount(dir) {
  const resolved = normPath(dir);
  try {
    if (process.platform === 'linux') {
      const out = execSync(`findmnt -T ${JSON.stringify(resolved)} -n -o FSTYPE`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      return /^(cifs|smb3?)$/i.test(out);
    }
    if (process.platform === 'darwin') {
      const mounts = execSync('mount', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return mounts.split('\n').some((line) => {
        if (!/smbfs|cifs/i.test(line) || !line.includes(' on ')) return false;
        const m = line.match(/ on (.+?) \(/);
        const mp = m?.[1] ? normPath(m[1]) : '';
        return Boolean(mp && (resolved === mp || resolved.startsWith(`${mp}/`)));
      });
    }
  } catch {
    /* fallback abaixo */
  }
  return fs.existsSync(resolved);
}

function toSmbRelativePath(arquivoPath) {
  const p = String(arquivoPath || '').replace(/^\/+/, '').replace(/\\/g, '/');
  const prefix = 'Atestados/';
  if (p.toLowerCase().startsWith(prefix.toLowerCase())) return p.slice(prefix.length);
  return p;
}

function safeSmbDest(arquivoPath) {
  const rel = toSmbRelativePath(arquivoPath);
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) {
    throw new Error(`path SMB inválido: ${arquivoPath}`);
  }
  const dest = path.resolve(SMB_ROOT, ...rel.split('/').filter(Boolean));
  const rootResolved = path.resolve(SMB_ROOT) + path.sep;
  if (dest !== path.resolve(SMB_ROOT) && !dest.startsWith(rootResolved)) {
    throw new Error(`path SMB fora do root: ${arquivoPath}`);
  }
  return dest;
}

async function sb(pathname, init = {}) {
  return fetch(`${SUPABASE_URL}${pathname}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(init.headers || {}),
    },
  });
}

function writeSmb(arquivoPath, buf) {
  const dest = safeSmbDest(arquivoPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  const st = fs.statSync(dest);
  if (st.size !== buf.length) {
    throw new Error(`tamanho divergente após write (${st.size} != ${buf.length})`);
  }
  return dest;
}

async function downloadStorage(objectPath) {
  const r = await sb(`/storage/v1/object/${BUCKET}/${objectPath}`);
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

async function deleteStorage(objectPath) {
  const r = await sb(`/storage/v1/object/${BUCKET}/${objectPath}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) {
    throw new Error(`deleteStorage ${r.status}: ${await r.text()}`);
  }
}

async function markSynced(id) {
  const now = new Date().toISOString();
  const r = await sb(`/rest/v1/atestados?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      arquivo_smb_synced_at: now,
      arquivo_cloud_archive_path: null,
      updated_at: now,
    }),
  });
  if (!r.ok) {
    throw new Error(`markSynced ${r.status}: ${await r.text()}`);
  }
}

async function syncPendingQueue() {
  const list = await sb(
    `/rest/v1/atestados?select=id,protocolo,arquivo_path,arquivo_cloud_archive_path,arquivo_mime` +
      `&arquivo_cloud_archive_path=not.is.null&arquivo_smb_synced_at=is.null` +
      `&order=created_at.asc&limit=${LIMIT}`,
  );
  if (!list.ok) {
    throw new Error(`Falha ao listar pendentes: ${list.status} ${await list.text()}`);
  }
  const rows = await list.json();
  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    const archivePath = String(row.arquivo_cloud_archive_path || '').trim();
    const smbPath = String(row.arquivo_path || '').trim();
    if (!archivePath || !smbPath) {
      failed++;
      continue;
    }
    const buf = await downloadStorage(archivePath);
    if (!buf) {
      console.warn('Download archive falhou', row.protocolo, archivePath);
      failed++;
      continue;
    }
    try {
      writeSmb(smbPath, buf);
      await markSynced(String(row.id));
      try {
        await deleteStorage(archivePath);
      } catch (e) {
        // Já marcado synced — órfão de storage é preferível a reprocessar sem archive.
        console.warn('deleteStorage falhou (já synced)', row.protocolo, e);
      }
      synced++;
    } catch (e) {
      console.warn('Sync pendente falhou', row.protocolo, e);
      failed++;
    }
  }
  return { pending: rows.length, synced, failed };
}

async function syncLegacyCatchup() {
  const list = await sb(
    `/rest/v1/atestados?select=id,protocolo,arquivo_path` +
      `&arquivo_path=not.is.null&arquivo_cloud_archive_path=is.null` +
      `&order=created_at.desc&limit=${LIMIT}`,
  );
  if (!list.ok) return { legacy: 0, copied: 0, skipped: 0, failed: 0 };
  const rows = await list.json();
  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const arquivoPath = String(row.arquivo_path || '').trim();
    if (!arquivoPath || arquivoPath.includes('_thumb.') || arquivoPath.includes('_pending_smb/')) {
      skipped++;
      continue;
    }
    let dest;
    try {
      dest = safeSmbDest(arquivoPath);
    } catch {
      failed++;
      continue;
    }
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      skipped++;
      continue;
    }
    const buf = await downloadStorage(arquivoPath);
    if (!buf) {
      skipped++;
      continue;
    }
    try {
      writeSmb(arquivoPath, buf);
      await markSynced(String(row.id));
      copied++;
    } catch {
      failed++;
    }
  }
  return { legacy: rows.length, copied, skipped, failed };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error(
      'Defina VITE_SUPABASE_URL (ou ATESTADOS_SUPABASE_URL) + SUPABASE_SERVICE_KEY do projeto dashboard (ayhrwxsxqddpeukydblz) em .env / .env.smb',
    );
    process.exit(1);
  }

  const release = acquireLock();
  if (!release) {
    console.error('Sync já em execução (lock).');
    process.exit(0);
  }

  try {
    console.log(`Supabase: ${SUPABASE_URL.replace(/https:\/\//, '')} · SMB: ${SMB_ROOT}`);
    if (!/ayhrwxsxqddpeukydblz/.test(SUPABASE_URL)) {
      console.warn(
        'AVISO: URL não parece o dashboard (ayhrwxsxqddpeukydblz). Atestados podem não existir neste projeto.',
      );
    }
    if (!fs.existsSync(SMB_ROOT) || !isRemoteMount(SMB_ROOT)) {
      console.error(`SMB não montado: ${SMB_ROOT}`);
      process.exit(2);
    }

    const pending = await syncPendingQueue();
    const legacy = await syncLegacyCatchup();

    console.log(
      JSON.stringify(
        {
          smb_root: SMB_ROOT,
          pending_queue: pending,
          legacy_catchup: legacy,
        },
        null,
        2,
      ),
    );

    if (pending.failed > 0 || legacy.failed > 0) {
      process.exit(3);
    }
  } finally {
    release();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
