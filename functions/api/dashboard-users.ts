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
  const body = (await context.request.json().catch(() => null)) as {
    id?: string;
    full_name?: string;
    perfil_id?: string | null;
    is_active?: boolean;
    password?: string;
    toggle?: boolean;
  } | null;
  const id = String(body?.id || '');
  if (!/^[0-9a-f-]{20,}$/i.test(id)) return json({ error: 'Usuário inválido.' }, 400);
  const { email, nonce } = checked.credentials!;

  const onlyToggle =
    body?.toggle === true ||
    (body?.full_name == null && body?.perfil_id == null && body?.is_active == null && !body?.password);

  if (onlyToggle) {
    const result = await sbRpc(context.env, 'toggle_user_active_by_session', {
      p_email: email,
      p_nonce: nonce,
      p_user_id: id,
    });
    if (!result.ok) {
      const msg =
        typeof result.data === 'object' && result.data && 'message' in result.data
          ? String((result.data as { message?: string }).message || '')
          : result.text;
      if (/last_admin/i.test(msg)) return json({ error: 'Não é possível desativar o último admin.' }, 400);
      return json({ error: 'Não foi possível alterar o acesso.' }, 502);
    }
    return json({ ok: true });
  }

  const result = await sbRpc(context.env, 'update_dashboard_user_by_session', {
    p_actor_email: email,
    p_nonce: nonce,
    p_user_id: id,
    p_full_name: body?.full_name ?? null,
    p_perfil_id: body?.perfil_id || null,
    p_is_active: typeof body?.is_active === 'boolean' ? body.is_active : null,
    p_password: body?.password ? String(body.password) : null,
  });
  if (!result.ok) {
    const msg =
      typeof result.data === 'object' && result.data && 'message' in result.data
        ? String((result.data as { message?: string }).message || '')
        : result.text;
    if (/last_admin/i.test(msg)) return json({ error: 'Não é possível remover o último admin.' }, 400);
    if (/password_too_short/i.test(msg)) return json({ error: 'Senha deve ter no mínimo 6 caracteres.' }, 400);
    return json({ error: 'Não foi possível atualizar o usuário.' }, 502);
  }
  return json({ ok: true });
}
