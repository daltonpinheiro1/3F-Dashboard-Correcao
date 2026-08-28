/**
 * GET /api/atestado-audit?id=...
 * Histórico de auditoria do atestado.
 */

import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireAtestadoRead,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';

const hits = new Map<string, number[]>();

export async function onRequestGet(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAtestadoRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const id = new URL(context.request.url).searchParams.get('id')?.trim();
  if (!id) return json({ error: 'id obrigatório.' }, 400);

  const r = await sbFetch(
    context.env,
    `/rest/v1/atestados_audit?atestado_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc&limit=30`,
  );
  if (!r.ok) return json({ error: 'Falha ao carregar histórico.' }, 502);
  const rows = (await r.json()) as Record<string, unknown>[];
  return json({ rows });
}
