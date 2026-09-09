/**
 * GET/PATCH /api/dashboard-users
 * BFF para administração de usuários sem expor session_nonce ao JavaScript.
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

async function admin(context: { request: Request; env: Env }, max = 40) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'dashboard-users', 60_000, max))) {
    return { response: json({ error: 'Rate limit.' }, 429), credentials: null };
  }
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return { response: json({ error: auth.error }, auth.status), credentials: null };
  return { response: null, credentials: sessionCredentials(context.request) };
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  const checked = await admin(context);
  if (checked.response) return checked.response;
  const { email, nonce } = checked.credentials!;
  const result = await sbRpc(context.env, 'list_dashboard_users_by_session', {
    p_email: email,
    p_nonce: nonce,
  });
  if (!result.ok) return json({ error: 'Falha ao listar usuários.' }, 502);
  return json({ users: Array.isArray(result.data) ? result.data : [] });
}

export async function onRequestPatch(context: { request: Request; env: Env }) {
  const checked = await admin(context, 20);
  if (checked.response) return checked.response;
  const body = (await context.request.json().catch(() => null)) as { id?: string } | null;
  const id = String(body?.id || '');
  if (!/^[0-9a-f-]{20,}$/i.test(id)) return json({ error: 'Usuário inválido.' }, 400);
  const { email, nonce } = checked.credentials!;
  const result = await sbRpc(context.env, 'toggle_user_active_by_session', {
    p_email: email,
    p_nonce: nonce,
    p_user_id: id,
  });
  if (!result.ok) return json({ error: 'Não foi possível alterar o acesso.' }, 502);
  return json({ ok: true });
}
