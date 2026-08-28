#!/usr/bin/env node
/**
 * Bridge HTTP local: recebe uploads do Cloudflare Pages e grava em SMB montado.
 * Rodar em máquina na rede 3F com share montado (bash scripts/mount-atestados-smb.sh).
 *
 * Env: ATESTADOS_SMB_ROOT, ATESTADOS_SMB_BRIDGE_SECRET, ATESTADOS_SMB_BRIDGE_PORT (8788)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
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
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvFile(path.join(ROOT, '.env.smb'));
loadEnvFile(path.join(ROOT, '.dev.vars'));

const SMB_ROOT = (process.env.ATESTADOS_SMB_ROOT || '/Volumes/03 Operação/Atestados').replace(/\/+$/g, '');
const SECRET = String(process.env.ATESTADOS_SMB_BRIDGE_SECRET || '').trim();
const PORT = Number(process.env.ATESTADOS_SMB_BRIDGE_PORT || 8788);
const MAX_BYTES = 8 * 1024 * 1024;

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
  if (!rel || rel.includes('..')) {
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

  const dest = path.join(SMB_ROOT, ...rel.split('/'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);

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

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const ok = fs.existsSync(SMB_ROOT);
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok, smb_root: SMB_ROOT, mounted: ok }));
    return;
  }
  if (req.method === 'POST' && (req.url === '/push' || req.url === '/api/atestados-smb-push')) {
    await handlePush(req, res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[atestados-smb-bridge] SMB_ROOT=${SMB_ROOT} :${PORT}`);
  if (!fs.existsSync(SMB_ROOT)) {
    console.warn('[atestados-smb-bridge] AVISO: SMB_ROOT inexistente — rode scripts/mount-atestados-smb.sh');
  }
});
