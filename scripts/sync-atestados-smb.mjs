#!/usr/bin/env node
/**
 * Sincroniza arquivos do Supabase Storage → pasta SMB (catch-up / sem bridge).
 * Requer: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY em .dev.vars ou env.
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
const LIMIT = Number(process.env.ATESTADOS_SYNC_LIMIT || 200);

function toSmbRelativePath(arquivoPath) {
  const p = String(arquivoPath || '').replace(/^\/+/, '').replace(/\\/g, '/');
  const prefix = 'Atestados/';
  if (p.toLowerCase().startsWith(prefix.toLowerCase())) return p.slice(prefix.length);
  return p;
}

async function sb(pathname, init = {}) {
  const r = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(init.headers || {}),
    },
  });
  return r;
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

  const list = await sb(
    `/rest/v1/atestados?select=id,protocolo,arquivo_path,arquivo_mime&arquivo_path=not.is.null&order=created_at.desc&limit=${LIMIT}`,
  );
  if (!list.ok) {
    console.error('Falha ao listar atestados:', list.status, await list.text());
    process.exit(3);
  }
  const rows = await list.json();
  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const arquivoPath = String(row.arquivo_path || '').trim();
    if (!arquivoPath) continue;
    if (arquivoPath.includes('_thumb.')) {
      skipped++;
      continue;
    }
    const rel = toSmbRelativePath(arquivoPath);
    const dest = path.join(SMB_ROOT, ...rel.split('/'));
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      skipped++;
      continue;
    }
    const dl = await sb(`/storage/v1/object/${BUCKET}/${arquivoPath}`);
    if (!dl.ok) {
      console.warn('Falha download', row.protocolo, arquivoPath, dl.status);
      failed++;
      continue;
    }
    const buf = Buffer.from(await dl.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    copied++;
  }

  console.log(JSON.stringify({ rows: rows.length, copied, skipped, failed, smb_root: SMB_ROOT }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
