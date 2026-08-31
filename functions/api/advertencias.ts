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
  requireGestao,
  isDashboardAdmin,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';
import {
  sanitizeAdvertenciaPatch,
  sanitizeAdvertenciaPost,
  validateAdvertenciaPatchTransition,
  validateAdvertenciaPost,
  applySessionActorsToPatch,
  applyNivelDecisionSnapshot,
  resolvePatchLock,
  requerAprovacaoDpFromRow,
} from '../_lib/advertenciasValidate';
import {
  buildPgListPath,
  clampListLimit,
  decodeListCursor,
  encodeListCursor,
  paginateRows,
} from '../_lib/advertenciasList';
import {
  resolveAuditAction,
  writeAdvertenciaAudit,
} from '../_lib/advertenciasAudit';

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
  return [...rows].sort((a, b) => {
    const byDate = String(b.created_at || '').localeCompare(String(a.created_at || ''));
    if (byDate !== 0) return byDate;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

async function listPgPage(
  env: Env,
  opts: {
    limit: number;
    cursorRaw: string | null;
    status: string | null;
    criado_por_email?: string | null;
  },
) {
  const cursor = decodeListCursor(opts.cursorRaw);
  if (opts.cursorRaw && !cursor) {
    throw new Error('cursor inválido.');
  }
  const path = buildPgListPath({
    limit: opts.limit,
    cursor,
    status: opts.status,
    criado_por_email: opts.criado_por_email,
  });
  const r = await sbFetch(env, path);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha ao listar: ${r.status} ${t.slice(0, 180)}`);
  }
  const fetched = (await r.json()) as Record<string, unknown>[];
  const has_more = fetched.length > opts.limit;
  const rows = has_more ? fetched.slice(0, opts.limit) : fetched;
  const last = rows[rows.length - 1];
  const next_cursor =
    has_more && last
      ? encodeListCursor({
          created_at: String(last.created_at || ''),
          id: String(last.id || ''),
        })
      : null;
  return {
    rows,
    next_cursor,
    has_more,
    limit: opts.limit,
    storage: 'postgres' as const,
  };
}

async function listStoragePage(
  env: Env,
  opts: {
    limit: number;
    cursorRaw: string | null;
    status: string | null;
    criado_por_email?: string | null;
  },
) {
  const cursor = decodeListCursor(opts.cursorRaw);
  if (opts.cursorRaw && !cursor) {
    throw new Error('cursor inválido.');
  }
  let rows = sortRows(await loadStorageRows(env));
  if (opts.status) {
    rows = rows.filter((r) => String(r.status || '') === opts.status);
  }
  const owner = (opts.criado_por_email || '').trim().toLowerCase();
  if (owner) {
    rows = rows.filter(
      (r) => String(r.criado_por_email || '').trim().toLowerCase() === owner,
    );
  }
  const page = paginateRows(rows, cursor, opts.limit);
  return {
    rows: page.rows,
    next_cursor: page.next_cursor,
    has_more: page.has_more,
    limit: opts.limit,
    storage: 'supabase-storage' as const,
  };
}

async function getStorageRow(env: Env, id: string): Promise<Record<string, unknown> | null> {
  const rows = await loadStorageRows(env);
  return rows.find((r) => String(r.id) === id) || null;
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

async function patchPg(
  env: Env,
  id: string,
  patch: Record<string, unknown>,
  opts?: { ifStatus?: string; ifEntregaStatus?: string },
) {
  const qs = new URLSearchParams();
  qs.set('id', `eq.${id}`);
  if (opts?.ifStatus) qs.set('status', `eq.${opts.ifStatus}`);
  if (opts?.ifEntregaStatus) qs.set('entrega_status', `eq.${opts.ifEntregaStatus}`);
  const r = await sbFetch(env, `/rest/v1/${TABLE}?${qs.toString()}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Falha ao atualizar: ${r.status} ${t.slice(0, 220)}`);
  }
  const data = (await r.json()) as Record<string, unknown>[];
  if (!data[0]) {
    throw new Error(
      opts?.ifStatus || opts?.ifEntregaStatus
        ? 'Registro já foi alterado por outro usuário (estado desatualizado).'
        : 'Registro não encontrado.',
    );
  }
  return { row: data[0], storage: 'postgres' as const };
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireGestao(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  try {
    const url = new URL(context.request.url);
    const byId = (url.searchParams.get('id') || '').trim();
    const store = await requireStore(context.env);
    if (!store.ok) return store.response;
    const admin = isDashboardAdmin(auth);
    const ownerEmail =
      !admin && auth.mode === 'session'
        ? String(auth.user?.email || '').trim().toLowerCase()
        : '';

    // Deep link / lookup pontual — evita auto-paginar dezenas de páginas
    if (byId) {
      const row = store.usePg
        ? await getPgRow(context.env, byId)
        : await getStorageRow(context.env, byId);
      if (row && ownerEmail) {
        const rowOwner = String(row.criado_por_email || '').trim().toLowerCase();
        if (rowOwner !== ownerEmail) {
          return json({
            rows: [],
            next_cursor: null,
            has_more: false,
            limit: 1,
            storage: store.usePg ? 'postgres' : 'supabase-storage',
          });
        }
      }
      return json({
        rows: row ? [row] : [],
        next_cursor: null,
        has_more: false,
        limit: 1,
        storage: store.usePg ? 'postgres' : 'supabase-storage',
      });
    }

    const limit = clampListLimit(url.searchParams.get('limit'));
    const cursorRaw = url.searchParams.get('cursor');
    if (cursorRaw && !decodeListCursor(cursorRaw)) {
      return json({ error: 'cursor inválido.' }, 400);
    }
    const status = url.searchParams.get('status');
    const scope = { limit, cursorRaw, status, criado_por_email: ownerEmail || null };
    if (store.usePg) {
      return json(await listPgPage(context.env, scope));
    }
    return json(await listStoragePage(context.env, scope));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /cursor inválido/i.test(msg) ? 400 : 500;
    return json({ error: msg }, status);
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireGestao(await authorizeRequest(context.request, context.env));
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
      // Auto-aprovação (sem DP): carimba aprovador = sessão (não confia no client)
      if (String(row.status) === 'aprovada' && !requerAprovacaoDpFromRow(row)) {
        row.aprovado_por_email = auth.user.email;
        row.aprovado_por_nome = auth.user.full_name || auth.user.email;
        row.aprovado_em = now;
      }
    }
    const store = await requireStore(context.env);
    if (!store.ok) return store.response;
    const actor = { mode: auth.mode, user: auth.user };
    if (store.usePg) {
      const inserted = await insertPg(context.env, row);
      await writeAdvertenciaAudit(context.env, actor, {
        advertenciaId: String(inserted.row.id || row.id),
        action: 'create',
        beforeStatus: null,
        afterStatus: String(inserted.row.status || row.status || 'pendente'),
        patch: row,
      });
      return json(inserted);
    }
    const rows = await loadStorageRows(context.env);
    rows.unshift(row);
    await saveStorageRows(context.env, rows);
    await writeAdvertenciaAudit(context.env, actor, {
      advertenciaId: String(row.id),
      action: 'create',
      beforeStatus: null,
      afterStatus: String(row.status || 'pendente'),
      patch: row,
      meta: { storage: 'supabase-storage' },
    });
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

      if (auth.mode === 'session' && auth.user) {
        applySessionActorsToPatch(patch, auth.user);
      }
      applyNivelDecisionSnapshot(current, patch);

      const lock = resolvePatchLock(current, patch);
      const beforeStatus = String(current.status || '');
      const actor = { mode: auth.mode, user: auth.user };
      try {
        const updated = await patchPg(context.env, id, patch, lock);
        const afterStatus = String(updated.row.status || patch.status || beforeStatus);
        await writeAdvertenciaAudit(context.env, actor, {
          advertenciaId: id,
          action: resolveAuditAction(beforeStatus, patch, 'patch'),
          beforeStatus,
          afterStatus,
          patch,
        });
        return json(updated);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/já foi alterado|desatualizado/i.test(msg)) return json({ error: msg }, 409);
        throw e;
      }
    }

    storageRows = await loadStorageRows(context.env);
    storageIdx = storageRows.findIndex((r) => String(r.id) === id);
    if (storageIdx < 0) return json({ error: 'Registro não encontrado.' }, 404);
    const transition = validateAdvertenciaPatchTransition(storageRows[storageIdx], patch);
    if (!transition.ok) return json({ error: transition.error }, 400);

    if (auth.mode === 'session' && auth.user) {
      applySessionActorsToPatch(patch, auth.user);
    }
    applyNivelDecisionSnapshot(storageRows[storageIdx], patch);

    const rows = storageRows!;
    const idx = storageIdx;
    const beforeStatus = String(rows[idx].status || '');
    rows[idx] = {
      ...rows[idx],
      ...patch,
      id,
      updated_at: new Date().toISOString(),
    };
    await saveStorageRows(context.env, rows);
    await writeAdvertenciaAudit(
      context.env,
      { mode: auth.mode, user: auth.user },
      {
        advertenciaId: id,
        action: resolveAuditAction(beforeStatus, patch, 'patch'),
        beforeStatus,
        afterStatus: String(rows[idx].status || beforeStatus),
        patch,
        meta: { storage: 'supabase-storage' },
      },
    );
    return json({ row: rows[idx], storage: 'supabase-storage' });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
