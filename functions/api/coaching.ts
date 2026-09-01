/**
 * GET/POST/PATCH /api/coaching — loop fechado de coaching.
 */
import {
  allowRate,
  authorizeRequest,
  clientIp,
  isDashboardAdmin,
  json,
  requireInteligencia,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';

const TABLE = 'coaching_actions';
const hits = new Map<string, number[]>();

async function tableExists(env: EnvAuth) {
  const r = await sbFetch(env, `/rest/v1/${TABLE}?select=id&limit=1`);
  return r.status !== 404 && r.status !== 406;
}

export async function onRequestGet(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireInteligencia(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await tableExists(context.env))) {
    return json({ error: 'Tabela coaching indisponível. Confirme migration 030.' }, 503);
  }

  const url = new URL(context.request.url);
  const status = url.searchParams.get('status');
  const admin = isDashboardAdmin(auth);
  const email =
    auth.mode === 'session' ? String(auth.user?.email || '').trim().toLowerCase() : '';

  let path = `/rest/v1/${TABLE}?select=*&order=created_at.desc&limit=100`;
  if (!admin && email) path += `&supervisor_email=eq.${encodeURIComponent(email)}`;
  if (status) path += `&status=eq.${encodeURIComponent(status)}`;

  const r = await sbFetch(context.env, path);
  if (!r.ok) return json({ error: 'Falha ao listar coaching.' }, 502);
  return json({ rows: await r.json() });
}

export async function onRequestPost(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireInteligencia(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await tableExists(context.env))) {
    return json({ error: 'Tabela coaching indisponível. Confirme migration 030.' }, 503);
  }

  const body = (await context.request.json()) as Record<string, unknown>;
  const sugestao = String(body.sugestao || '').trim();
  if (!sugestao) return json({ error: 'sugestao obrigatória.' }, 400);

  const email =
    auth.mode === 'session'
      ? String(auth.user?.email || '').trim().toLowerCase()
      : String(body.supervisor_email || '').trim().toLowerCase();

  const row = {
    supervisor_email: email,
    operador_login: body.operador_login ? String(body.operador_login) : null,
    operador_nome: body.operador_nome ? String(body.operador_nome) : null,
    tipo: String(body.tipo || 'geral'),
    sugestao,
    status: 'pendente',
    contexto: body.contexto && typeof body.contexto === 'object' ? body.contexto : {},
  };

  const r = await sbFetch(context.env, `/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!r.ok) return json({ error: 'Falha ao criar coaching.' }, 502);
  const data = (await r.json()) as Record<string, unknown>[];
  return json({ row: data[0] });
}

export async function onRequestPatch(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireInteligencia(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!(await tableExists(context.env))) {
    return json({ error: 'Tabela coaching indisponível.' }, 503);
  }

  const id = new URL(context.request.url).searchParams.get('id')?.trim();
  if (!id) return json({ error: 'id obrigatório.' }, 400);

  const body = (await context.request.json()) as Record<string, unknown>;
  const status = String(body.status || '').trim();
  if (!['pendente', 'feito', 'adiado', 'ignorado'].includes(status)) {
    return json({ error: 'status inválido.' }, 400);
  }

  const admin = isDashboardAdmin(auth);
  const email =
    auth.mode === 'session' ? String(auth.user?.email || '').trim().toLowerCase() : '';

  let checkPath = `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}&select=supervisor_email&limit=1`;
  const check = await sbFetch(context.env, checkPath);
  if (!check.ok) return json({ error: 'Coaching não encontrado.' }, 404);
  const existing = ((await check.json()) as { supervisor_email?: string }[])[0];
  if (!existing) return json({ error: 'Coaching não encontrado.' }, 404);
  if (!admin && existing.supervisor_email?.toLowerCase() !== email) {
    return json({ error: 'Sem permissão.' }, 403);
  }

  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    resultado: body.resultado && typeof body.resultado === 'object' ? body.resultado : null,
  };
  if (status === 'feito') patch.concluido_em = new Date().toISOString();

  const r = await sbFetch(context.env, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) return json({ error: 'Falha ao atualizar.' }, 502);
  const data = (await r.json()) as Record<string, unknown>[];
  return json({ row: data[0] });
}
