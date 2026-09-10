/**
 * GET/POST/PATCH /api/rr-actions — ciclo compartilhado da RR.
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireRr,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

type Env = EnvAuth & RateLimitEnv;
const CAMPANHAS = new Set(['TODAS', 'PORTABILIDADE', 'MIGRACAO', 'ACAO_BKO', 'CONTROLE_CONTROLE', 'ALGAR']);
const HORIZONTES = new Set(['realtime', 'semanal', 'quinzenal', 'mensal', 'semestral']);
const STATUS = new Set(['aberta', 'feita', 'sem_efeito']);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

async function guard(context: { request: Request; env: Env }, max = 40) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'rr-actions', 60_000, max))) {
    return { auth: null, response: json({ error: 'Rate limit.' }, 429) };
  }
  return { auth: authorizeRequest(context.request, context.env), response: null };
}

function toAction(row: Record<string, unknown>) {
  return {
    id: row.id,
    dataRef: row.data_ref,
    campanha: row.campanha,
    horizonte: row.horizonte,
    titulo: row.titulo,
    owner: row.owner,
    prazo: row.prazo,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const checked = await guard(context);
  if (checked.response) return checked.response;
  const auth = requireRr(await checked.auth!);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(context.request.url);
  const campanha = (url.searchParams.get('campanha') || '').trim();
  if (campanha && !CAMPANHAS.has(campanha)) return json({ error: 'Campanha inválida.' }, 400);
  const filter = campanha ? `&campanha=eq.${encodeURIComponent(campanha)}` : '';
  const r = await sbFetch(
    context.env,
    `/rest/v1/rr_actions?select=*&order=data_ref.desc,created_at.desc${filter}&limit=300`,
  );
  const text = await r.text();
  if (!r.ok) {
    if (/PGRST205|rr_actions/i.test(text)) return json({ actions: [], persist: false });
    return json({ error: `PostgREST ${r.status}` }, 502);
  }
  const rows = (text ? JSON.parse(text) : []) as Record<string, unknown>[];
  return json({ actions: rows.map(toAction), persist: true });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const checked = await guard(context, 20);
  if (checked.response) return checked.response;
  const auth = requireRr(await checked.auth!);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const body = (await context.request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'JSON inválido.' }, 400);
  const id = String(body.id || '').slice(0, 80);
  const dataRef = String(body.dataRef || '').slice(0, 10);
  const campanha = String(body.campanha || '');
  const horizonte = String(body.horizonte || '');
  const titulo = String(body.titulo || '').trim().slice(0, 180);
  const owner = String(body.owner || '').trim().slice(0, 80);
  const prazo = String(body.prazo || '').slice(0, 10);
  if (!/^acao-[a-z0-9-]+$/i.test(id) || !ISO_DAY.test(dataRef) || !ISO_DAY.test(prazo) || !CAMPANHAS.has(campanha) || !HORIZONTES.has(horizonte) || !titulo || !owner) {
    return json({ error: 'Ação inválida.' }, 400);
  }
  const row = {
    id,
    data_ref: dataRef,
    campanha,
    horizonte,
    titulo,
    owner,
    prazo,
    status: 'aberta',
    created_by: auth.ok && auth.mode === 'session' ? auth.user?.email || null : 'sistema',
  };
  const r = await sbFetch(context.env, '/rest/v1/rr_actions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  const text = await r.text();
  if (!r.ok) return json({ error: `PostgREST ${r.status}`, detalhe: text.slice(0, 160) }, 502);
  const saved = (text ? JSON.parse(text) : [row]) as Record<string, unknown>[];
  return json({ action: toAction(saved[0] || row) });
}

export async function onRequestPatch(context: { request: Request; env: Env }) {
  const checked = await guard(context, 30);
  if (checked.response) return checked.response;
  const auth = requireRr(await checked.auth!);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const body = (await context.request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = String(body?.id || '').slice(0, 80);
  const status = String(body?.status || '');
  if (!/^acao-[a-z0-9-]+$/i.test(id) || !STATUS.has(status)) return json({ error: 'Patch inválido.' }, 400);
  const r = await sbFetch(context.env, `/rest/v1/rr_actions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });
  const text = await r.text();
  if (!r.ok) return json({ error: `PostgREST ${r.status}` }, 502);
  const rows = (text ? JSON.parse(text) : []) as Record<string, unknown>[];
  return json({ action: rows[0] ? toAction(rows[0]) : null });
}
