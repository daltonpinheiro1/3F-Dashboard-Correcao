#!/usr/bin/env node
/**
 * Observa montagem SMB e sincroniza pendentes quando a rede 3F estiver disponível.
 * Ideal para Mac do DP: logou na rede → atualiza \\files\ com faltantes.
 *
 * Uso: npm run smb:watch
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SMB_ROOT = (process.env.ATESTADOS_SMB_ROOT || '/Volumes/03 Operação/Atestados').replace(/\/+$/g, '');
const INTERVAL_MS = Number(process.env.ATESTADOS_SMB_WATCH_MS || 90_000);

function smbReady() {
  try {
    return fs.existsSync(SMB_ROOT) && fs.statSync(SMB_ROOT).isDirectory();
  } catch {
    return false;
  }
}

function runSync() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/sync-atestados-smb.mjs')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function tick() {
  if (!smbReady()) {
    console.log(`[smb-watch] ${new Date().toISOString()} — rede indisponível (${SMB_ROOT})`);
    return;
  }
  console.log(`[smb-watch] ${new Date().toISOString()} — rede OK, sincronizando…`);
  await runSync();
}

console.log(`[smb-watch] Observando ${SMB_ROOT} a cada ${INTERVAL_MS / 1000}s`);
void tick();
setInterval(() => void tick(), INTERVAL_MS);
