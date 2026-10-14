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

const LOGIN_WINDOW_MS = 15 * 60_000;
/** Teto por IP: escritório atrás de um único NAT não pode travar o login de todos. */
const LOGIN_MAX_PER_IP = 60;
const LOGIN_MAX_PER_IP_EMAIL = 12;

/** Banco ainda sem a 041: login_user(text, text) não aceita p_ip. */
function isMissingIpSignature(status: number, text: string): boolean {
  return status === 404 || /PGRST202|Could not find the function/i.test(text);
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  const tooMany = () => response({ error: 'Muitas tentativas. Aguarde 15 minutos.' }, 429);
  if (!(await allowRateDistributed(context.env, ip, 'auth-login-ip', LOGIN_WINDOW_MS, LOGIN_MAX_PER_IP))) {
    return tooMany();
  }

  let body: { email?: string; password?: string };
  try {
    body = (await context.request.json()) as { email?: string; password?: string };
  } catch {
    return response({ error: 'Payload inválido.' }, 400);
  }
  const email = (body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || email.length > 254 || !password || password.length > 256) {
    return response({ error: 'Email e senha obrigatórios.' }, 400);
  }
  if (
    !(await allowRateDistributed(
      context.env,
      `${ip}:${email}`,
      'auth-login',
      LOGIN_WINDOW_MS,
      LOGIN_MAX_PER_IP_EMAIL,
    ))
  ) {
    return tooMany();
  }

  try {
    let login = await sbRpc(context.env, 'login_user', {
      p_email: email,
      p_password: password,
      p_ip: ip,
    });
    if (!login.ok && isMissingIpSignature(login.status, login.text)) {
      login = await sbRpc(context.env, 'login_user', { p_email: email, p_password: password });
    }
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
