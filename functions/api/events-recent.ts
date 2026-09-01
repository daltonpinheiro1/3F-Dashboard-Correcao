/**
 * GET /api/events-recent?since=ISO — feed realtime (polling).
 * POST — registrar evento (admin/supervisor).
 */
import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  requireInteligencia,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';

const TABLE = 'operacional_events';
const hits = new Map<string, number[]>();

export async function onRequestGet(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request), 60_000, 120)) {
    return json({ error: 'Rate limit.' }, 429);
  }
  const auth = requireInteligencia(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const url = new URL(context.request.url);
  const since = url.searchParams.get('since');
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));

  let path = `/rest/v1/${TABLE}?select=*&order=created_at.desc&limit=${limit}`;
  if (since) {
    path += `&created_at=gt.${encodeURIComponent(since)}`;
  }

  const r = await sbFetch(context.env, path);
  if (r.status === 404 || r.status === 406) {
    return json({ rows: [], server_time: new Date().toISOString() });
  }
  if (!r.ok) return json({ error: 'Falha ao carregar eventos.' }, 502);

  const rows = await r.json();
  return json({ rows, server_time: new Date().toISOString() });
}

export async function onRequestPost(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const body = (await context.request.json()) as Record<string, unknown>;
  const titulo = String(body.titulo || '').trim();
  if (!titulo) return json({ error: 'titulo obrigatório.' }, 400);

  const row = {
    tipo: String(body.tipo || 'alerta'),
    severidade: String(body.severidade || 'info'),
    titulo,
    mensagem: body.mensagem ? String(body.mensagem) : null,
    modulo: body.modulo ? String(body.modulo) : null,
    payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
  };

  const r = await sbFetch(context.env, `/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!r.ok) return json({ error: 'Falha ao registrar evento.' }, 502);
  const data = (await r.json()) as Record<string, unknown>[];
  return json({ row: data[0] });
}
