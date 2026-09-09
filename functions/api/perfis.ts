/**
 * GET/POST/PATCH/DELETE /api/perfis
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  sbRpc,
  sessionCredentials,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

type Env = EnvAuth & RateLimitEnv;

function rpcMsg(data: unknown, text: string) {
  if (typeof data === 'object' && data && 'message' in data) {
    return String((data as { message?: string }).message || '') || text;
  }
  return text;
}

async function adminOk(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'perfis', 60_000, 40))) {
    return { response: json({ error: 'Rate limit.' }, 429) as Response };
  }
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return { response: json({ error: auth.error }, auth.status) };
  return { response: null as Response | null, credentials: sessionCredentials(context.request) };
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const checked = await adminOk(context);
  if (checked.response) return checked.response;
  const { email, nonce } = checked.credentials!;
  const result = await sbRpc(context.env, 'list_dashboard_perfis_by_session', {
    p_email: email,
    p_nonce: nonce,
  });
  if (!result.ok) return json({ error: 'Falha ao listar perfis.' }, 502);
  return json({ perfis: Array.isArray(result.data) ? result.data : [] });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const checked = await adminOk(context);
  if (checked.response) return checked.response;
  const body = (await context.request.json().catch(() => null)) as { nome?: string; abas?: string[] } | null;
  const nome = String(body?.nome || '').trim();
  if (nome.length < 2) return json({ error: 'Informe o nome do perfil.' }, 400);
  const { email, nonce } = checked.credentials!;
  const result = await sbRpc(context.env, 'upsert_dashboard_perfil_by_session', {
    p_email: email,
    p_nonce: nonce,
    p_id: null,
    p_nome: nome,
    p_abas: Array.isArray(body?.abas) ? body!.abas : [],
  });
  if (!result.ok) return json({ error: rpcMsg(result.data, result.text) || 'Falha ao criar perfil.' }, 502);
  return json({ ok: true, id: result.data });
}

export async function onRequestPatch(context: { request: Request; env: Env }) {
  const checked = await adminOk(context);
  if (checked.response) return checked.response;
  const body = (await context.request.json().catch(() => null)) as {
    id?: string;
    nome?: string;
    abas?: string[];
  } | null;
  const id = String(body?.id || '');
  if (!/^[0-9a-f-]{20,}$/i.test(id)) return json({ error: 'Perfil inválido.' }, 400);
  const nome = String(body?.nome || '').trim();
  if (nome.length < 2) return json({ error: 'Informe o nome do perfil.' }, 400);
  const { email, nonce } = checked.credentials!;
  const result = await sbRpc(context.env, 'upsert_dashboard_perfil_by_session', {
    p_email: email,
    p_nonce: nonce,
    p_id: id,
    p_nome: nome,
    p_abas: Array.isArray(body?.abas) ? body!.abas : [],
  });
  if (!result.ok) return json({ error: rpcMsg(result.data, result.text) || 'Falha ao atualizar perfil.' }, 502);
  return json({ ok: true, id: result.data });
}

export async function onRequestDelete(context: { request: Request; env: Env }) {
  const checked = await adminOk(context);
  if (checked.response) return checked.response;
  const url = new URL(context.request.url);
  const id = String(url.searchParams.get('id') || '');
  if (!/^[0-9a-f-]{20,}$/i.test(id)) return json({ error: 'Perfil inválido.' }, 400);
  const { email, nonce } = checked.credentials!;
  const result = await sbRpc(context.env, 'delete_dashboard_perfil_by_session', {
    p_email: email,
    p_nonce: nonce,
    p_id: id,
  });
  if (!result.ok) {
    const msg = rpcMsg(result.data, result.text);
    if (/system_perfil/i.test(msg)) return json({ error: 'Perfil de sistema não pode ser excluído.' }, 400);
    if (/perfil_in_use/i.test(msg)) return json({ error: 'Perfil em uso por usuários.' }, 409);
    return json({ error: 'Não foi possível excluir o perfil.' }, 502);
  }
  return json({ ok: true });
}
