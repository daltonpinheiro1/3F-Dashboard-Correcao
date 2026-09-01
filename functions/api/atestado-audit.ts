/**
 * GET /api/atestado-audit?id=...
 * Histórico de auditoria do atestado.
 */

import {
  allowRate,
  authorizeRequest,
  clientIp,
  isAtestadoAdmin,
  json,
  requireAtestadoRead,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';

const hits = new Map<string, number[]>();
const TABLE = 'atestados';

async function getAtestadoOwner(env: EnvAuth, id: string): Promise<string | null> {
  const r = await sbFetch(
    env,
    `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=criado_por_email&limit=1`,
  );
  if (!r.ok) return null;
  const data = (await r.json()) as { criado_por_email?: string | null }[];
  return data[0]?.criado_por_email ?? null;
}

export async function onRequestGet(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireAtestadoRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const id = new URL(context.request.url).searchParams.get('id')?.trim();
  if (!id) return json({ error: 'id obrigatório.' }, 400);

  const admin = isAtestadoAdmin(auth);
  const supervisorEmail =
    !admin && auth.mode === 'session' ? String(auth.user?.email || '').trim() : '';
  if (supervisorEmail) {
    const owner = String((await getAtestadoOwner(context.env, id)) || '').trim().toLowerCase();
    if (!owner || owner !== supervisorEmail.toLowerCase()) {
      return json({ rows: [] });
    }
  }

  const r = await sbFetch(
    context.env,
    `/rest/v1/atestados_audit?atestado_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc&limit=30`,
  );
  if (!r.ok) return json({ error: 'Falha ao carregar histórico.' }, 502);
  const rows = (await r.json()) as Record<string, unknown>[];
  return json({ rows });
}
