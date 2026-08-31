/** Auth compartilhada das Pages Functions — secret server OU sessão (email+nonce). */

export type EnvAuth = {
  DASHBOARD_INSIGHT_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
};

export type SessionUser = {
  id: string;
  email: string;
  full_name?: string;
  role: string;
};

export type AuthResult =
  | { ok: true; mode: 'secret' | 'session'; user?: SessionUser }
  | { ok: false; status: number; error: string };

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export function allowRate(
  hits: Map<string, number[]>,
  ip: string,
  windowMs = 60_000,
  max = 40,
): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(ip, arr);
    return false;
  }
  arr.push(now);
  hits.set(ip, arr);
  return true;
}

export function sbConfig(env: EnvAuth) {
  const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = (env.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) return null;
  return { url, key };
}

export async function sbFetch(env: EnvAuth, path: string, init: RequestInit = {}) {
  const cfg = sbConfig(env);
  if (!cfg) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes no Pages.');
  const headers = new Headers(init.headers || {});
  headers.set('apikey', cfg.key);
  headers.set('Authorization', `Bearer ${cfg.key}`);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  return fetch(`${cfg.url}${path}`, { ...init, headers });
}

export async function sbRpc(env: EnvAuth, fn: string, payload: Record<string, unknown>) {
  const r = await sbFetch(env, `/rest/v1/rpc/${fn}`, {
    method: 'POST',
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

/** Aceita Bearer secret (server) OU X-Dashboard-Email + X-Dashboard-Session (nonce). */
export async function authorizeRequest(req: Request, env: EnvAuth): Promise<AuthResult> {
  const secret = (env.DASHBOARD_INSIGHT_SECRET || '').trim();
  const auth = req.headers.get('authorization') || '';
  const sessHeader = req.headers.get('x-dashboard-session') || '';

  if (secret && auth === `Bearer ${secret}`) {
    return { ok: true, mode: 'secret' };
  }

  const email = (req.headers.get('x-dashboard-email') || '').trim().toLowerCase();
  const nonce = sessHeader.trim();
  if (!email || nonce.length < 16) {
    return {
      ok: false,
      status: 401,
      error: 'Sessão inválida. Faça logout/login.',
    };
  }

  if (!sbConfig(env)) {
    return { ok: false, status: 503, error: 'Supabase service ausente no Pages.' };
  }

  const verified = await sbRpc(env, 'verify_dashboard_session', {
    p_email: email,
    p_nonce: nonce,
  });

  if (!verified.ok) {
    // migration 013 ainda não aplicada
    const msg =
      typeof verified.data === 'object' && verified.data && 'message' in (verified.data as object)
        ? String((verified.data as { message?: string }).message || '')
        : verified.text;
    if (/PGRST202|Could not find the function/i.test(msg)) {
      return {
        ok: false,
        status: 503,
        error: 'Aplicar migration 013_session_harden.sql no Dashboard e faça login novamente.',
      };
    }
    return { ok: false, status: 401, error: 'Sessão inválida ou expirada.' };
  }

  const data = verified.data as { valid?: boolean; id?: string; email?: string; full_name?: string; role?: string; error?: string };
  if (!data?.valid) {
    // Resposta genérica — evita enumeração (P1-9)
    return { ok: false, status: 401, error: 'Sessão inválida ou expirada.' };
  }

  return {
    ok: true,
    mode: 'session',
    user: {
      id: String(data.id || ''),
      email: String(data.email || email),
      full_name: data.full_name,
      role: String(data.role || ''),
    },
  };
}

export function requireAdmin(auth: AuthResult): AuthResult {
  if (!auth.ok) return auth;
  if (auth.mode === 'secret') return auth;
  if ((auth.user?.role || '').toLowerCase() !== 'admin') {
    return { ok: false, status: 403, error: 'Acesso restrito a admin.' };
  }
  return auth;
}

/** Gestão operacional (advertências + solicitar atestado): admin, supervisor ou viewer. */
export function requireGestao(auth: AuthResult): AuthResult {
  if (!auth.ok) return auth;
  if (auth.mode === 'secret') return auth;
  const role = (auth.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'supervisor' || role === 'viewer') return auth;
  return { ok: false, status: 403, error: 'Acesso restrito a admin, supervisor ou viewer.' };
}

/** GET portabilidade (funil, disparos, journey, histórico): admin ou supervisor. */
export function requirePortabilidadeRead(auth: AuthResult): AuthResult {
  if (!auth.ok) return auth;
  if (auth.mode === 'secret') return auth;
  const role = (auth.user?.role || '').toLowerCase();
  if (role === 'admin' || role === 'supervisor') return auth;
  return { ok: false, status: 403, error: 'Acesso restrito a admin ou supervisor.' };
}

/** POST atestados: admin, supervisor ou viewer (portal de solicitação). */
export function requireAtestadoWrite(auth: AuthResult): AuthResult {
  return requireGestao(auth);
}

/** GET atestados / análise IA: admin (tudo) ou supervisor/viewer (escopo limitado no handler). */
export function requireAtestadoRead(auth: AuthResult): AuthResult {
  return requireAtestadoWrite(auth);
}

export function isAtestadoAdmin(auth: AuthResult): boolean {
  if (!auth.ok) return false;
  if (auth.mode === 'secret') return true;
  return (auth.user?.role || '').toLowerCase() === 'admin';
}
