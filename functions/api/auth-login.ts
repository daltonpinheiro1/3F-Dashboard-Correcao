/**
 * POST /api/auth-login
 * Executa login no BFF e guarda o nonce em cookie HttpOnly.
 */
import {
  clientIp,
  sessionCookie,
  sbRpc,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

type Env = EnvAuth & RateLimitEnv;

function response(body: unknown, status = 200, cookie?: string) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Request-Id': crypto.randomUUID(),
  });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'auth-login', 15 * 60_000, 12))) {
    return response({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, 429);
  }

  let body: { email?: string; password?: string };
  try {
    body = (await context.request.json()) as { email?: string; password?: string };
  } catch {
    return response({ error: 'Payload inválido.' }, 400);
  }
  const email = (body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password || password.length > 256) {
    return response({ error: 'Email e senha obrigatórios.' }, 400);
  }

  try {
    const login = await sbRpc(context.env, 'login_user', {
      p_email: email,
      p_password: password,
    });
    if (!login.ok) return response({ error: 'Falha ao autenticar.' }, 502);
    const result = login.data as {
      success?: boolean;
      error?: string;
      email?: string;
      full_name?: string;
      role?: string;
      perfil_slug?: string;
      abas?: unknown;
      session_expires_at?: string;
      session_nonce?: string;
    };
    if (!result?.success || !result.session_nonce || !result.email) {
      const error =
        result?.error === 'inactive'
          ? 'Conta desativada. Contate o administrador.'
          : result?.error === 'locked'
            ? 'Muitas tentativas. Aguarde 15 minutos.'
            : 'Email ou senha incorretos.';
      return response({ error }, 401);
    }
    const abas = Array.isArray(result.abas) ? result.abas.map((a) => String(a)) : [];
    return response(
      {
        success: true,
        email: result.email,
        full_name: result.full_name || '',
        role: result.role || '',
        perfil_slug: result.perfil_slug || result.role || '',
        abas,
        session_expires_at: result.session_expires_at || null,
      },
      200,
      sessionCookie(result.email, result.session_nonce),
    );
  } catch {
    return response({ error: 'Erro ao conectar. Tente novamente.' }, 503);
  }
}
