/**
 * CRUD de advertências via Postgres (service role).
 * Fallback Storage apenas se a tabela ainda não existir.
 * Auth: sessão (email+nonce) ou DASHBOARD_INSIGHT_SECRET no server.
 */

import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';
import {
  sanitizeAdvertenciaPatch,
  sanitizeAdvertenciaPost,
  validateAdvertenciaPatchTransition,
  validateAdvertenciaPost,
} from '../_lib/advertenciasValidate';

const BUCKET = 'advertencias-data';
const OBJECT = 'registros.json';
const TABLE = 'advertencias';

type Env = EnvAuth & {
  ADVERTENCIAS_ALLOW_STORAGE_FALLBACK?: string;
};

const hits = new Map<string, number[]>();

/** Fallback JSON só se explicitamente habilitado (dev/migração). Prod = Postgres. */
function allowStorageFallback(env: Env): boolean {
  return String(env.ADVERTENCIAS_ALLOW_STORAGE_FALLBACK || '').toLowerCase() === 'true';
}

async function requireStore(
  env: Env,
): Promise<{ ok: true; usePg: boolean } | { ok: false; response: Response }> {
  const usePg = await tableExists(env);
  if (usePg) return { ok: true, usePg: true };
  if (allowStorageFallback(env)) return { ok: true, usePg: false };
  return {
    ok: false,
    response: json(
      {
        error:
          'Tabela advertencias indisponível. Confirme migration 013–016 no Supabase (fallback Storage desligado).',
      },
      503,
    ),
  };
}

async function tableExists(env: Env): Promise<boolean> {
  const r = await sbFetch(env, `/rest/v1/${TABLE}?select=id&limit=1`);
  if (r.ok) return true;
  const t = await r.text();
  if (/PGRST205|Could not find the table|schema cache/i.test(t)) return false;
  // RLS/permission still means table exists
  if (r.status === 401 || r.status === 403) return true;
  return r.status !== 404;
}

async function ensureBucket(env: Env) {
  const list = await sbFetch(env, '/storage/v1/bucket');
  if (list.ok) {
    const buckets = (await list.json()) as { id?: string; name?: string }[];
    if (buckets.some((b) => b.id === BUCKET || b.name === BUCKET)) return;
  }
  const created = await sbFetch(env, '/storage/v1/bucket', {
    method: 'POST',
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (!created.ok && created.status !== 409) {
    const t = await created.text();
    throw new Error(`Falha ao criar bucket: ${created.status} ${t.slice(0, 180)}`);
  }
}

async function loadStorageRows(env: Env): Promise<Record<string, unknown>[]> {
  await ensureBucket(env);
  const r = await sbFetch(env, `/storage/v1/object/${BUCKET}/${OBJECT}`);
  if (r.status === 404) return [];
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 400 && /NoSuchKey|not_found|Object not found/i.test(t)) return [];
    throw new Error(`Falha ao ler registros: ${r.status} ${t.slice(0, 180)}`);
  }
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function saveStorageRows(env: Env, rows: Record<string, unknown>[]) {
  await ensureBucket(env);
  await sbFetch(env, `/storage/v1/object/${BUCKET}/${OBJECT}`, { method: 'DELETE' }).catch(() => null);
  const body = JSON.stringify(rows);
  const r = await sbFetch(env, `/storage/v1/object/${BUCKET}/${OBJECT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body,
  });
  if (!r.ok) {
    const r2 = await sbFetch(env, `/storage/v1/object/${BUCKET}/${OBJECT}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' },
      body,
    });
    if (!r2.ok) {
      const t = await r2.text();
      throw new Error(`Falha ao gravar registros: ${r2.status} ${t.slice(0, 180)}`);
    }
  }
}

function sortRows(rows: Record<string, unknown>[]) {
  return [...rows].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')),
  );
}

async function listPg(env: Env) {
  const r = await sbFetch(
    env,
    `/rest/v1/${TABLE}?select=*&order=created_at.desc&limit=2000`,
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha ao listar: ${r.status} ${t.slice(0, 180)}`);
  }
  const rows = (await r.json()) as Record<string, unknown>[];
  return { rows: sortRows(rows), storage: 'postgres' as const };
}

async function insertPg(env: Env, row: Record<string, unknown>) {
  const r = await sbFetch(env, `/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha ao inserir: ${r.status} ${t.slice(0, 220)}`);
  }
  const data = (await r.json()) as Record<string, unknown>[];
  return { row: data[0] || row, storage: 'postgres' as const };
}

async function getPgRow(env: Env, id: string): Promise<Record<string, unknown> | null> {
  const r = await sbFetch(
    env,
    `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha ao buscar registro: ${r.status} ${t.slice(0, 180)}`);
  }
  const data = (await r.json()) as Record<string, unknown>[];
  return data[0] || null;
}

async function patchPg(env: Env, id: string, patch: Record<string, unknown>) {
  const r = await sbFetch(env, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha ao atualizar: ${r.status} ${t.slice(0, 220)}`);
  }
  const data = (await r.json()) as Record<string, unknown>[];
  if (!data[0]) throw new Error('Registro não encontrado.');
  return { row: data[0], storage: 'postgres' as const };
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  try {
    const store = await requireStore(context.env);
    if (!store.ok) return store.response;
    if (store.usePg) {
      return json(await listPg(context.env));
    }
    const rows = sortRows(await loadStorageRows(context.env));
    return json({ rows, storage: 'supabase-storage' });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  try {
    const payload = (await context.request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();
    const sanitized = sanitizeAdvertenciaPost(payload);
    const row = {
      ...sanitized,
      id: String(sanitized.id || crypto.randomUUID()),
      created_at: String(sanitized.created_at || now),
      updated_at: now,
      status: String(sanitized.status || 'pendente'),
      anexos: Array.isArray(sanitized.anexos) ? sanitized.anexos : [],
    };
    if (!row.colaborador_nome || !row.descricao || !row.motivo_categoria) {
      return json({ error: 'Campos obrigatórios ausentes.' }, 400);
    }
    const postCheck = validateAdvertenciaPost(row);
    if (!postCheck.ok) return json({ error: postCheck.error }, 400);
    if (auth.mode === 'session' && auth.user) {
      row.criado_por_email = auth.user.email;
      row.criado_por_nome = auth.user.full_name || auth.user.email;
    }
    const store = await requireStore(context.env);
    if (!store.ok) return store.response;
    if (store.usePg) {
      return json(await insertPg(context.env, row));
    }
    const rows = await loadStorageRows(context.env);
    rows.unshift(row);
    await saveStorageRows(context.env, rows);
    return json({ row, storage: 'supabase-storage' });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

export async function onRequestPatch(context: { request: Request; env: Env }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  try {
    const payload = (await context.request.json()) as { id?: string; patch?: Record<string, unknown> };
    const id = String(payload.id || '');
    if (!id) return json({ error: 'id obrigatório.' }, 400);
    const patch = sanitizeAdvertenciaPatch({ ...(payload.patch || {}) });

    // Uma única detecção de storage — evita TOCTOU e double-fetch no fallback
    const store = await requireStore(context.env);
    if (!store.ok) return store.response;
    const usePg = store.usePg;
    let storageRows: Record<string, unknown>[] | null = null;
    let storageIdx = -1;

    if (usePg) {
      const current = await getPgRow(context.env, id);
      if (!current) return json({ error: 'Registro não encontrado.' }, 404);
      const transition = validateAdvertenciaPatchTransition(current, patch);
      if (!transition.ok) return json({ error: transition.error }, 400);
    } else {
      storageRows = await loadStorageRows(context.env);
      storageIdx = storageRows.findIndex((r) => String(r.id) === id);
      if (storageIdx < 0) return json({ error: 'Registro não encontrado.' }, 404);
      const transition = validateAdvertenciaPatchTransition(storageRows[storageIdx], patch);
      if (!transition.ok) return json({ error: transition.error }, 400);
    }

    if (auth.mode === 'session' && auth.user && (patch.status === 'aprovada' || patch.status === 'recusada')) {
      patch.aprovado_por_email = auth.user.email;
      patch.aprovado_por_nome = auth.user.full_name || auth.user.email;
      if (!patch.aprovado_em) patch.aprovado_em = new Date().toISOString();
      if (patch.status === 'aprovada') {
        patch.entrega_status = patch.entrega_status || 'aguardando_impressao';
        patch.notificacao_status = patch.notificacao_status || 'pendente';
      }
      if (patch.status === 'recusada') {
        patch.notificacao_status = patch.notificacao_status || 'pendente';
      }
    }

    if (usePg) {
      return json(await patchPg(context.env, id, patch));
    }

    const rows = storageRows!;
    const idx = storageIdx;
    rows[idx] = {
      ...rows[idx],
      ...patch,
      id,
      updated_at: new Date().toISOString(),
    };
    await saveStorageRows(context.env, rows);
    return json({ row: rows[idx], storage: 'supabase-storage' });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
