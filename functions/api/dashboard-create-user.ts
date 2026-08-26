/**
 * Cria usuário do dashboard com sessão admin (migration 013).
 * Sem fallback inseguro de create_dashboard_user(4 args).
 */

import {
  authorizeRequest,
  json,
  requireAdmin,
  sbRpc,
  type EnvAuth,
} from '../_lib/auth';

type Env = EnvAuth;

export async function onRequestPost(context: { request: Request; env: Env }) {
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: {
    email?: string;
    name?: string;
    password?: string;
    role?: string;
  };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const role = String(body.role || 'viewer').trim().toLowerCase();

  if (!email || !name || !password) {
    return json({ error: 'Preencha nome, email e senha.' }, 400);
  }
  if (password.length < 6) {
    return json({ error: 'Senha deve ter no mínimo 6 caracteres.' }, 400);
  }
  if (!['admin', 'supervisor', 'viewer'].includes(role)) {
    return json({ error: 'Perfil inválido.' }, 400);
  }

  const actorEmail =
    auth.mode === 'session' && auth.user?.email
      ? auth.user.email
      : (context.request.headers.get('x-dashboard-email') || '').trim().toLowerCase();
  const nonce = (context.request.headers.get('x-dashboard-session') || '').trim();

  if (!actorEmail || nonce.length < 16) {
    return json(
      { error: 'Sessão admin necessária. Faça logout/login e tente de novo.' },
      401,
    );
  }

  try {
    const created = await sbRpc(context.env, 'create_dashboard_user_by_session', {
      p_actor_email: actorEmail,
      p_nonce: nonce,
      p_email: email,
      p_name: name,
      p_password: password,
      p_role: role,
    });

    if (!created.ok) {
      const msg =
        typeof created.data === 'object' && created.data && 'message' in (created.data as object)
          ? String((created.data as { message?: string }).message || '')
          : created.text;
      if (/PGRST202|Could not find the function/i.test(msg)) {
        return json(
          {
            error:
              'Aplicar migration 013_session_harden.sql no projeto Dashboard e faça logout/login.',
          },
          503,
        );
      }
      if (/admin_session_required/i.test(msg)) {
        return json({ error: 'Sessão admin inválida ou expirada.' }, 403);
      }
      if (/duplicate|unique/i.test(msg)) {
        return json({ error: 'Email já cadastrado.' }, 409);
      }
      if (/password_too_short/i.test(msg)) {
        return json({ error: 'Senha deve ter no mínimo 6 caracteres.' }, 400);
      }
      return json({ error: msg || 'Falha ao criar usuário.' }, 502);
    }

    return json({ ok: true, id: created.data });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
