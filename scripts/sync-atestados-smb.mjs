#!/usr/bin/env node
/**
 * Sincroniza fila SMB pendente + catch-up legado.
 * 1) Pendentes: arquivo_cloud_archive_path → SMB, marca synced, remove archive
 * 2) Legado: arquivo_path no bucket (sem _thumb/_pending) → SMB se ausente
 *
 * Agendar: */5 * * * * cd /path && npm run smb:sync
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
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
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvFile(path.join(ROOT, '.env.smb'));
loadEnvFile(path.join(ROOT, '.dev.vars'));

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SMB_ROOT = (process.env.ATESTADOS_SMB_ROOT || '/Volumes/03 Operação/Atestados').replace(/\/+$/g, '');
const BUCKET = 'atestados-docs';
const LIMIT = Number(process.env.ATESTADOS_SYNC_LIMIT || 100);

function toSmbRelativePath(arquivoPath) {
  const p = String(arquivoPath || '').replace(/^\/+/, '').replace(/\\/g, '/');
  const prefix = 'Atestados/';
  if (p.toLowerCase().startsWith(prefix.toLowerCase())) return p.slice(prefix.length);
  return p;
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
  const rel = toSmbRelativePath(arquivoPath);
  const dest = path.join(SMB_ROOT, ...rel.split('/'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return dest;
}

async function downloadStorage(objectPath) {
  const r = await sb(`/storage/v1/object/${BUCKET}/${objectPath}`);
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

async function deleteStorage(objectPath) {
  await sb(`/storage/v1/object/${BUCKET}/${objectPath}`, { method: 'DELETE' });
}

async function markSynced(id) {
  const now = new Date().toISOString();
  await sb(`/rest/v1/atestados?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      arquivo_smb_synced_at: now,
      arquivo_cloud_archive_path: null,
      updated_at: now,
    }),
  });
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
      await deleteStorage(archivePath);
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
    const rel = toSmbRelativePath(arquivoPath);
    const dest = path.join(SMB_ROOT, ...rel.split('/'));
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
      copied++;
    } catch {
      failed++;
    }
  }
  return { legacy: rows.length, copied, skipped, failed };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!fs.existsSync(SMB_ROOT)) {
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
