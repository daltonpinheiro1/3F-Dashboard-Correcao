/**
 * Cria usuário do dashboard com auth de admin.
 * Usa RPCs já existentes no Supabase:
 *  - _assert_dashboard_admin
 *  - create_dashboard_user(p_email, p_name, p_password, p_role)
 * (migration 011 ainda não aplicada no schema remoto)
 */

type Env = {
  DASHBOARD_INSIGHT_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function authorized(req: Request, env: Env): boolean {
  const secret = (env.DASHBOARD_INSIGHT_SECRET || '').trim();
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  const sess = req.headers.get('x-dashboard-session') || '';
  return auth === `Bearer ${secret}` || sess === secret;
}

async function sbRpc(env: Env, fn: string, payload: Record<string, unknown>) {
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = (env.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes.');
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: r.ok, status: r.status, data, text };
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!authorized(context.request, context.env)) {
    return json({ error: 'Não autorizado.' }, 401);
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

  const adminEmail = String(body.admin_email || '').trim().toLowerCase();
  const adminPassword = String(body.admin_password || '');
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const role = String(body.role || 'viewer').trim().toLowerCase();

  if (!adminEmail || !adminPassword) {
    return json({ error: 'Reautentique-se (senha admin necessária).' }, 401);
  }
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
    const auth = await sbRpc(context.env, '_assert_dashboard_admin', {
      p_email: adminEmail,
      p_password: adminPassword,
    });
    if (!auth.ok) {
      const msg = typeof auth.data === 'object' && auth.data && 'message' in (auth.data as object)
        ? String((auth.data as { message?: string }).message || '')
        : auth.text;
      if (/admin_auth_failed/i.test(msg)) {
        return json({ error: 'Falha de autenticação admin. Faça logout/login e tente de novo.' }, 403);
      }
      return json({ error: msg || 'Falha ao validar admin.' }, 403);
    }

    const created = await sbRpc(context.env, 'create_dashboard_user', {
      p_email: email,
      p_name: name,
      p_password: password,
      p_role: role,
    });
    if (!created.ok) {
      const msg = typeof created.data === 'object' && created.data && 'message' in (created.data as object)
        ? String((created.data as { message?: string }).message || '')
        : created.text;
      if (/duplicate|unique/i.test(msg)) {
        return json({ error: 'Email já cadastrado.' }, 409);
      }
      return json({ error: msg || 'Falha ao criar usuário.' }, 502);
    }

    return json({ ok: true, id: created.data });
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
