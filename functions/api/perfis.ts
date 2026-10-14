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
import { isAbaId } from '../../shared/abasCatalog';

type Env = EnvAuth & RateLimitEnv;

function rpcMsg(data: unknown, text: string) {
  if (typeof data === 'object' && data && 'message' in data) {
    return String((data as { message?: string }).message || '') || text;
  }
  return text;
}

const NOME_MAX = 80;

export function parseAbas(raw: unknown): { ok: true; abas: string[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, abas: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'Abas inválidas.' };
  const invalidas = raw.filter((a) => !isAbaId(a));
  if (invalidas.length) {
    const lista = invalidas.slice(0, 5).map((a) => String(a).slice(0, 40)).join(', ');
    return { ok: false, error: `Aba(s) desconhecida(s): ${lista}.` };
  }
  return { ok: true, abas: [...new Set(raw as string[])] };
}

function upsertFailure(msg: string, fallback: string) {
  if (/invalid_nome/i.test(msg)) return json({ error: 'Informe o nome do perfil.' }, 400);
  if (/invalid_abas/i.test(msg)) return json({ error: 'Abas inválidas.' }, 400);
  if (/perfil_not_found/i.test(msg)) return json({ error: 'Perfil não encontrado.' }, 404);
  if (/admin_session_required/i.test(msg)) {
    return json({ error: 'Sessão admin inválida. Faça logout/login.' }, 403);
  }
  console.error(
    JSON.stringify({ level: 'error', event: 'perfis_upsert_failed', detail: msg.slice(0, 500) }),
  );
  return json({ error: fallback }, 502);
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
  const body = (await context.request.json().catch(() => null)) as { nome?: string; abas?: unknown } | null;
  const nome = String(body?.nome || '').trim();
  if (nome.length < 2) return json({ error: 'Informe o nome do perfil.' }, 400);
  if (nome.length > NOME_MAX) return json({ error: 'Nome do perfil muito longo.' }, 400);
  const abas = parseAbas(body?.abas);
  if (!abas.ok) return json({ error: abas.error }, 400);
  const { email, nonce } = checked.credentials!;
  const result = await sbRpc(context.env, 'upsert_dashboard_perfil_by_session', {
    p_email: email,
    p_nonce: nonce,
    p_id: null,
    p_nome: nome,
    p_abas: abas.abas,
  });
  if (!result.ok) return upsertFailure(rpcMsg(result.data, result.text), 'Falha ao criar perfil.');
  return json({ ok: true, id: result.data });
}

export async function onRequestPatch(context: { request: Request; env: Env }) {
  const checked = await adminOk(context);
  if (checked.response) return checked.response;
  const body = (await context.request.json().catch(() => null)) as {
    id?: string;
    nome?: string;
    abas?: unknown;
  } | null;
  const id = String(body?.id || '');
  if (!/^[0-9a-f-]{20,}$/i.test(id)) return json({ error: 'Perfil inválido.' }, 400);
  const nome = String(body?.nome || '').trim();
  if (nome.length < 2) return json({ error: 'Informe o nome do perfil.' }, 400);
  if (nome.length > NOME_MAX) return json({ error: 'Nome do perfil muito longo.' }, 400);
  const abas = parseAbas(body?.abas);
  if (!abas.ok) return json({ error: abas.error }, 400);
  const { email, nonce } = checked.credentials!;
  const result = await sbRpc(context.env, 'upsert_dashboard_perfil_by_session', {
    p_email: email,
    p_nonce: nonce,
    p_id: id,
    p_nome: nome,
    p_abas: abas.abas,
  });
  if (!result.ok) return upsertFailure(rpcMsg(result.data, result.text), 'Falha ao atualizar perfil.');
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
