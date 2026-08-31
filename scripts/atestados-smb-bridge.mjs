#!/usr/bin/env node
/**
 * Bridge HTTP local: recebe uploads do Cloudflare Pages e grava em SMB montado.
 * Rodar em máquina na rede 3F com share montado (bash scripts/mount-atestados-smb.sh).
 *
 * Env: ATESTADOS_SMB_ROOT, ATESTADOS_SMB_BRIDGE_SECRET, ATESTADOS_SMB_BRIDGE_PORT (8788)
 * ATESTADOS_SMB_BRIDGE_BIND=127.0.0.1 (default) — use 0.0.0.0 só atrás de tunnel/VPN
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
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

loadEnvFile(path.join(ROOT, '.env.smb'), { override: true });
loadEnvFile(path.join(ROOT, '.dev.vars'), { override: true });

const SMB_ROOT = (process.env.ATESTADOS_SMB_ROOT || '/Volumes/03 Operação/Atestados').replace(/\/+$/g, '');
const SECRET = String(process.env.ATESTADOS_SMB_BRIDGE_SECRET || '').trim();
const PORT = Number(process.env.ATESTADOS_SMB_BRIDGE_PORT || 8788);
const BIND = String(process.env.ATESTADOS_SMB_BRIDGE_BIND || '127.0.0.1').trim() || '127.0.0.1';
const MAX_BYTES = 8 * 1024 * 1024;

function normPath(p) {
  return path.resolve(p).normalize('NFC');
}

function isRemoteMount(dir) {
  const resolved = normPath(dir);
  if (!fs.existsSync(resolved)) return false;
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
    return false;
  }
  return false;
}

function toSmbRelativePath(arquivoPath) {
  const p = String(arquivoPath || '').replace(/^\/+/, '').replace(/\\/g, '/');
  const prefix = 'Atestados/';
  if (p.toLowerCase().startsWith(prefix.toLowerCase())) return p.slice(prefix.length);
  if (p.toLowerCase() === 'atestados') return '';
  return p;
}

function authOk(req) {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) return false;
  return h.slice(7).trim() === SECRET;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    req.on('data', (c) => {
      len += c.length;
      if (len > MAX_BYTES * 2) {
        reject(new Error('payload grande demais'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handlePush(req, res) {
  if (!SECRET) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ATESTADOS_SMB_BRIDGE_SECRET não configurado' }));
    return;
  }
  if (!authOk(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'não autorizado' }));
    return;
  }
  if (!isRemoteMount(SMB_ROOT)) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'SMB não montado', smb_root: SMB_ROOT }));
    return;
  }

  let payload;
  try {
    payload = JSON.parse((await readBody(req)).toString('utf8'));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'JSON inválido' }));
    return;
  }

  const arquivoPath = String(payload.path || '').trim();
  const b64 = String(payload.base64 || '').trim();
  if (!arquivoPath || !b64) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'path e base64 obrigatórios' }));
    return;
  }

  const rel = toSmbRelativePath(arquivoPath);
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'path inválido' }));
    return;
  }

  let bytes;
  try {
    bytes = Buffer.from(b64.replace(/\s/g, ''), 'base64');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'base64 inválido' }));
    return;
  }
  if (bytes.length > MAX_BYTES) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'arquivo grande demais' }));
    return;
  }

  const dest = path.resolve(SMB_ROOT, ...rel.split('/').filter(Boolean));
  const rootResolved = path.resolve(SMB_ROOT) + path.sep;
  if (!dest.startsWith(rootResolved)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'path fora do SMB root' }));
    return;
  }

  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes);
    const st = fs.statSync(dest);
    if (st.size !== bytes.length) {
      throw new Error('tamanho divergente após write');
    }
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'falha ao gravar no SMB', detail: String(e?.message || e) }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      ok: true,
      path: arquivoPath,
      filesystem: dest,
      bytes: bytes.length,
    }),
  );
}

if (!SECRET) {
  console.error('[atestados-smb-bridge] ATESTADOS_SMB_BRIDGE_SECRET obrigatório');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const mounted = isRemoteMount(SMB_ROOT);
    res.writeHead(mounted ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: mounted, smb_root: SMB_ROOT, mounted }));
    return;
  }
  if (req.method === 'POST' && (req.url === '/push' || req.url === '/api/atestados-smb-push')) {
    await handlePush(req, res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, BIND, () => {
  console.log(`[atestados-smb-bridge] SMB_ROOT=${SMB_ROOT} ${BIND}:${PORT}`);
  if (!isRemoteMount(SMB_ROOT)) {
    console.warn('[atestados-smb-bridge] AVISO: SMB não montado — push retornará 503 até montar');
  }
});
