/**
 * Cria usuário do dashboard.
 * 1) Sessão admin (nonce / migration 013)
 * 2) admin_email + admin_password → create_dashboard_user 6-args (assert embutido)
 */

import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  sbRpc,
  type EnvAuth,
} from '../_lib/auth';

type Env = EnvAuth & {
  /** Se true, permite fallback admin_email/password (legado). Prod = só sessão. */
  ALLOW_CREATE_USER_PASSWORD_FALLBACK?: string;
};

const hits = new Map<string, number[]>();

function allowPasswordFallback(env: Env): boolean {
  return String(env.ALLOW_CREATE_USER_PASSWORD_FALLBACK || '').toLowerCase() === 'true';
}

function rpcMessage(data: unknown, text: string): string {
  if (typeof data === 'object' && data && 'message' in data) {
    return String((data as { message?: string }).message || '') || text;
  }
  return text;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!allowRate(hits, clientIp(context.request), 60_000, 20)) {
    return json({ error: 'Rate limit.' }, 429);
  }

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
  const adminEmail = String(body.admin_email || '').trim().toLowerCase();
  const adminPassword = String(body.admin_password || '');

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
    const authRaw = await authorizeRequest(context.request, context.env);

    // Path A — sessão admin (013)
    if (authRaw.ok && authRaw.mode === 'session') {
      const auth = requireAdmin(authRaw);
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      const nonce = (context.request.headers.get('x-dashboard-session') || '').trim();
      const created = await sbRpc(context.env, 'create_dashboard_user_by_session', {
        p_actor_email: auth.user!.email,
        p_nonce: nonce,
        p_email: email,
        p_name: name,
        p_password: password,
        p_role: role,
      });
      if (created.ok) return json({ ok: true, id: created.data });

      const msg = rpcMessage(created.data, created.text);
      if (!/PGRST202|Could not find the function/i.test(msg)) {
        if (/admin_session_required/i.test(msg)) {
          return json({ error: 'Sessão admin inválida. Faça logout/login.' }, 403);
        }
        if (/duplicate|unique/i.test(msg)) return json({ error: 'Email já cadastrado.' }, 409);
        if (/password_too_short/i.test(msg)) {
          return json({ error: 'Senha deve ter no mínimo 6 caracteres.' }, 400);
        }
        return json({ error: msg || 'Falha ao criar usuário.' }, 502);
      }
      // 013 ausente → cai no path B
    }

    // Path B — só se explicitamente habilitado (legado / migração 013)
    if (!allowPasswordFallback(context.env)) {
      if (!authRaw.ok) return json({ error: authRaw.error }, authRaw.status);
      return json(
        {
          error:
            'Sessão admin necessária. Faça logout/login. (Fallback senha desligado — migration 013.)',
        },
        401,
      );
    }

    if (!adminEmail || !adminPassword) {
      if (!authRaw.ok) return json({ error: authRaw.error }, authRaw.status);
      return json(
        {
          error:
            'Reautentique-se (logout/login) ou envie admin_email/admin_password. Ideal: aplicar 013_session_harden.sql.',
        },
        401,
      );
    }

    const created = await sbRpc(context.env, 'create_dashboard_user', {
      p_email: email,
      p_name: name,
      p_password: password,
      p_role: role,
      p_admin_email: adminEmail,
      p_admin_password: adminPassword,
    });

    if (!created.ok) {
      const msg = rpcMessage(created.data, created.text);
      if (/admin_auth_failed/i.test(msg)) {
        return json({ error: 'Falha de autenticação admin. Confira email/senha.' }, 403);
      }
      if (/duplicate|unique/i.test(msg)) return json({ error: 'Email já cadastrado.' }, 409);
      if (/PGRST202|Could not find the function|function.*not found/i.test(msg)) {
        return json(
          {
            error:
              'RPC create_dashboard_user (6 args) ausente. Aplique migration 011 ou 013 no Supabase Dashboard.',
          },
          503,
        );
      }
      if (/Could not choose the best candidate|PGRST203/i.test(msg)) {
        return json(
          {
            error:
              'Overloads conflitantes de create_dashboard_user. Aplique 013_session_harden.sql.',
          },
          503,
        );
      }
      return json({ error: msg || 'Falha ao criar usuário.' }, 502);
    }

    return json({ ok: true, id: created.data });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
