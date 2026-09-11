#!/usr/bin/env node
/**
 * Sincroniza fila SMB pendente + catch-up legado + cura da nuvem.
 * Dual-write: pasta de rede E archive na nuvem. Nunca apaga o arquivo da nuvem após o sync.
 *
 * 1) Pendentes: archive nuvem → SMB, marca synced, **mantém** archive
 * 2) Cura: synced sem archive → lê SMB e reenvia à nuvem
 * 3) Legado: objeto no bucket (sem _thumb/_pending) → SMB + archive nuvem
 *
 * Agendar no Mac logado (seg–sex): npm run smb:install-macos
 *   (wrapper monta o SMB e esvazia a fila). Manual: npm run smb:sync
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
function configuredSmbRoots() {
  const configured = (process.env.ATESTADOS_SMB_ROOT || '/Volumes/03 Operação/Atestados').replace(/\/+$/g, '');
  const home = String(process.env.HOME || '').replace(/\/+$/g, '');
  const userMount = home ? path.join(home, 'mnt/3f-03-operacao/Atestados') : '';
  return [...new Set([configured, userMount].filter(Boolean))];
}

function pickSmbRoot() {
  const candidates = configuredSmbRoots();
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory() && isRemoteMount(p)) return p;
    } catch {
      /* tenta o próximo */
    }
  }
  return candidates[0];
}

const SMB_ROOT = pickSmbRoot();
const BUCKET = 'atestados-docs';
const LIMIT = Number(process.env.ATESTADOS_SYNC_LIMIT || 100);
const MAX_ROUNDS = Math.max(1, Number(process.env.ATESTADOS_SYNC_MAX_ROUNDS || 50));

function isWeekdayLocal() {
  if (process.env.ATESTADOS_SYNC_WEEKENDS === '1') return true;
  const day = new Date().getDay();
  return day >= 1 && day <= 5;
}

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

async function uploadStorage(objectPath, buf, mime) {
  const r = await sb(`/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': mime || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: buf,
  });
  if (!r.ok) {
    throw new Error(`uploadStorage ${r.status}: ${await r.text()}`);
  }
}

function cloudArchivePath(arquivoPath) {
  const p = String(arquivoPath || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (p.includes('/_pending_smb/')) return p;
  const rel = p.replace(/^Atestados\//i, '');
  return `Atestados/_pending_smb/${rel}`;
}

async function markSynced(id) {
  const now = new Date().toISOString();
  const r = await sb(`/rest/v1/atestados?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      arquivo_smb_synced_at: now,
      updated_at: now,
    }),
  });
  if (!r.ok) {
    throw new Error(`markSynced ${r.status}: ${await r.text()}`);
  }
}

async function markCloudArchive(id, archivePath) {
  const now = new Date().toISOString();
  const r = await sb(`/rest/v1/atestados?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      arquivo_cloud_archive_path: archivePath,
      updated_at: now,
    }),
  });
  if (!r.ok) {
    throw new Error(`markCloudArchive ${r.status}: ${await r.text()}`);
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
    `/rest/v1/atestados?select=id,protocolo,arquivo_path,arquivo_mime` +
      `&arquivo_path=not.is.null&arquivo_cloud_archive_path=is.null` +
      // legado: sem archive (com ou sem SMB). Se o arquivo já está na pasta, só sobe a nuvem.
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
    const destExists = fs.existsSync(dest) && fs.statSync(dest).size > 0;
    let buf = destExists ? fs.readFileSync(dest) : await downloadStorage(arquivoPath);
    if (!buf) {
      skipped++;
      continue;
    }
    try {
      if (!destExists) {
        writeSmb(arquivoPath, buf);
      }
      const archivePath = cloudArchivePath(arquivoPath);
      try {
        await uploadStorage(archivePath, buf, String(row.arquivo_mime || 'application/octet-stream'));
        await markCloudArchive(String(row.id), archivePath);
      } catch (e) {
        console.warn('archive nuvem legado falhou', row.protocolo, e);
      }
      await markSynced(String(row.id));
      copied++;
    } catch {
      failed++;
    }
  }
  return { legacy: rows.length, copied, skipped, failed };
}

async function healCloudArchiveFromSmb() {
  const list = await sb(
    `/rest/v1/atestados?select=id,protocolo,arquivo_path,arquivo_mime` +
      `&arquivo_path=not.is.null&arquivo_cloud_archive_path=is.null&arquivo_smb_synced_at=not.is.null` +
      `&order=created_at.desc&limit=${LIMIT}`,
  );
  if (!list.ok) return { candidates: 0, healed: 0, skipped: 0, failed: 0 };
  const rows = await list.json();
  let healed = 0;
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
    if (!fs.existsSync(dest) || fs.statSync(dest).size <= 0) {
      skipped++;
      continue;
    }
    try {
      const buf = fs.readFileSync(dest);
      const archivePath = cloudArchivePath(arquivoPath);
      const mime = String(row.arquivo_mime || 'application/octet-stream');
      await uploadStorage(archivePath, buf, mime);
      await markCloudArchive(String(row.id), archivePath);
      healed++;
    } catch (e) {
      console.warn('heal nuvem falhou', row.protocolo, e);
      failed++;
    }
  }
  return { candidates: rows.length, healed, skipped, failed };
}

function addCounts(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = Number(out[k] || 0) + Number(v || 0);
  }
  return out;
}

async function drainQueues() {
  let pending = { pending: 0, synced: 0, failed: 0 };
  let heal = { candidates: 0, healed: 0, skipped: 0, failed: 0 };
  let legacy = { legacy: 0, copied: 0, skipped: 0, failed: 0 };
  let rounds = 0;

  while (rounds < MAX_ROUNDS) {
    rounds += 1;
    const p = await syncPendingQueue();
    const h = await healCloudArchiveFromSmb();
    const l = await syncLegacyCatchup();
    pending = addCounts(pending, p);
    heal = addCounts(heal, h);
    legacy = addCounts(legacy, l);
    const work = p.synced + h.healed + l.copied;
    if (work === 0) break;
  }

  return { rounds, pending_queue: pending, heal_cloud: heal, legacy_catchup: legacy };
}

async function main() {
  if (!isWeekdayLocal()) {
    console.log('Fora de segunda a sexta — sync não roda (ATESTADOS_SYNC_WEEKENDS=1 para forçar).');
    process.exit(0);
  }

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

    const result = await drainQueues();
    console.log(
      JSON.stringify(
        {
          smb_root: SMB_ROOT,
          ...result,
        },
        null,
        2,
      ),
    );

    if (result.pending_queue.failed > 0 || result.legacy_catchup.failed > 0 || result.heal_cloud.failed > 0) {
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
