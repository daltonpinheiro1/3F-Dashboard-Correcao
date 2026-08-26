/**
 * CRUD de advertências via Supabase Storage (service role).
 * Evita depender da migration SQL ainda não aplicada no projeto.
 * Auth: mesmo DASHBOARD_INSIGHT_SECRET usado nas demais Functions.
 */

const BUCKET = 'advertencias-data';
const OBJECT = 'registros.json';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const hits = new Map<string, number[]>();

type Env = {
  DASHBOARD_INSIGHT_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  /** Fallback nome usado no bot de processamento */
  OPENAI_API_KEY?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function allowRate(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    hits.set(ip, arr);
    return false;
  }
  arr.push(now);
  hits.set(ip, arr);
  return true;
}

function authorized(req: Request, env: Env): boolean {
  const secret = (env.DASHBOARD_INSIGHT_SECRET || '').trim();
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  const sess = req.headers.get('x-dashboard-session') || '';
  return auth === `Bearer ${secret}` || sess === secret;
}

function sb(env: Env) {
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = (env.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

async function sbFetch(env: Env, path: string, init: RequestInit = {}) {
  const cfg = sb(env);
  if (!cfg) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes no Pages.');
  const headers = new Headers(init.headers || {});
  headers.set('apikey', cfg.key);
  headers.set('Authorization', `Bearer ${cfg.key}`);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  return fetch(`${cfg.url}${path}`, { ...init, headers });
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

async function loadRows(env: Env): Promise<Record<string, unknown>[]> {
  await ensureBucket(env);
  const r = await sbFetch(env, `/storage/v1/object/${BUCKET}/${OBJECT}`);
  if (r.status === 404) return [];
  if (!r.ok) {
    const t = await r.text();
    // Bucket novo ainda sem arquivo
    if (r.status === 400 && /NoSuchKey|not_found|Object not found/i.test(t)) return [];
    throw new Error(`Falha ao ler registros: ${r.status} ${t.slice(0, 180)}`);
  }
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

async function saveRows(env: Env, rows: Record<string, unknown>[]) {
  await ensureBucket(env);
  // upsert: delete then upload avoids "already exists" on some storage configs
  await sbFetch(env, `/storage/v1/object/${BUCKET}/${OBJECT}`, { method: 'DELETE' }).catch(() => null);
  const body = JSON.stringify(rows);
  const r = await sbFetch(env, `/storage/v1/object/${BUCKET}/${OBJECT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body,
  });
  if (!r.ok) {
    // retry upsert endpoint
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

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!allowRate(clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  if (!authorized(context.request, context.env)) return json({ error: 'Não autorizado.' }, 401);
  try {
    const rows = sortRows(await loadRows(context.env));
    return json({ rows, storage: 'supabase-storage' });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!allowRate(clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  if (!authorized(context.request, context.env)) return json({ error: 'Não autorizado.' }, 401);
  try {
    const payload = (await context.request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();
    const row = {
      ...payload,
      id: String(payload.id || crypto.randomUUID()),
      created_at: String(payload.created_at || now),
      updated_at: now,
      status: String(payload.status || 'pendente'),
      anexos: Array.isArray(payload.anexos) ? payload.anexos : [],
    };
    if (!row.colaborador_nome || !row.descricao || !row.motivo_categoria) {
      return json({ error: 'Campos obrigatórios ausentes.' }, 400);
    }
    const rows = await loadRows(context.env);
    rows.unshift(row);
    await saveRows(context.env, rows);
    return json({ row, storage: 'supabase-storage' });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

export async function onRequestPatch(context: { request: Request; env: Env }) {
  if (!allowRate(clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  if (!authorized(context.request, context.env)) return json({ error: 'Não autorizado.' }, 401);
  try {
    const payload = (await context.request.json()) as { id?: string; patch?: Record<string, unknown> };
    const id = String(payload.id || '');
    if (!id) return json({ error: 'id obrigatório.' }, 400);
    const rows = await loadRows(context.env);
    const idx = rows.findIndex((r) => String(r.id) === id);
    if (idx < 0) return json({ error: 'Registro não encontrado.' }, 404);
    rows[idx] = {
      ...rows[idx],
      ...(payload.patch || {}),
      id,
      updated_at: new Date().toISOString(),
    };
    await saveRows(context.env, rows);
    return json({ row: rows[idx], storage: 'supabase-storage' });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
