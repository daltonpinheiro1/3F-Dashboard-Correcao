/**
 * Cria usuário do dashboard.
 * Preferência: sessão admin (migration 013).
 * Compat: secret server + admin_email/admin_password (até 013 aplicado e front novo).
 */

import {
  authorizeRequest,
  json,
  requireAdmin,
  sbRpc,
  type EnvAuth,
} from '../_lib/auth';

type Env = EnvAuth;

function rpcMessage(data: unknown, text: string): string {
  if (typeof data === 'object' && data && 'message' in data) {
    return String((data as { message?: string }).message || '') || text;
  }
  return text;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const authRaw = await authorizeRequest(context.request, context.env);
  if (!authRaw.ok) return json({ error: authRaw.error }, authRaw.status);

  let body: {
    admin_email?: string;
    admin_password?: string;
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

  try {
    // Path A — sessão admin (nonce real, migration 013)
    if (authRaw.mode === 'session') {
      const auth = requireAdmin(authRaw);
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      const actorEmail = auth.user!.email;
      const nonce = (context.request.headers.get('x-dashboard-session') || '').trim();
      const created = await sbRpc(context.env, 'create_dashboard_user_by_session', {
        p_actor_email: actorEmail,
        p_nonce: nonce,
        p_email: email,
        p_name: name,
        p_password: password,
        p_role: role,
      });
      if (!created.ok) {
        const msg = rpcMessage(created.data, created.text);
        if (/PGRST202|Could not find the function/i.test(msg)) {
          return json(
            {
              error:
                'Aplicar migration 013_session_harden.sql no Supabase Dashboard e faça logout/login.',
            },
            503,
          );
        }
        if (/admin_session_required/i.test(msg)) {
          return json({ error: 'Sessão admin inválida ou expirada. Faça logout/login.' }, 403);
        }
        if (/duplicate|unique/i.test(msg)) return json({ error: 'Email já cadastrado.' }, 409);
        if (/password_too_short/i.test(msg)) {
          return json({ error: 'Senha deve ter no mínimo 6 caracteres.' }, 400);
        }
        return json({ error: msg || 'Falha ao criar usuário.' }, 502);
      }
      return json({ ok: true, id: created.data });
    }

    // Path B — secret server + reauth admin (compat / curl / front antigo)
    const adminEmail = String(body.admin_email || '').trim().toLowerCase();
    const adminPassword = String(body.admin_password || '');
    if (!adminEmail || !adminPassword) {
      return json(
        {
          error:
            'Sessão admin necessária. Faça logout/login (hard refresh) ou envie admin_email/admin_password.',
        },
        401,
      );
    }

    const asserted = await sbRpc(context.env, '_assert_dashboard_admin', {
      p_email: adminEmail,
      p_password: adminPassword,
    });
    if (!asserted.ok) {
      const msg = rpcMessage(asserted.data, asserted.text);
      if (/admin_auth_failed/i.test(msg)) {
        return json({ error: 'Falha de autenticação admin. Confira email/senha.' }, 403);
      }
      return json({ error: msg || 'Falha ao validar admin.' }, 403);
    }

    // 4-args ainda vigente no remoto até aplicar 013 (que remove o overload)
    const created = await sbRpc(context.env, 'create_dashboard_user', {
      p_email: email,
      p_name: name,
      p_password: password,
      p_role: role,
    });
    if (!created.ok) {
      const msg = rpcMessage(created.data, created.text);
      if (/PGRST202|Could not find the function|function.*not found/i.test(msg)) {
        return json(
          {
            error:
              'RPC create_dashboard_user ausente. Aplique 013_session_harden.sql e use login com sessão.',
          },
          503,
        );
      }
      if (/duplicate|unique/i.test(msg)) return json({ error: 'Email já cadastrado.' }, 409);
      return json({ error: msg || 'Falha ao criar usuário.' }, 502);
    }

    return json({ ok: true, id: created.data });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
