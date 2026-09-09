/**
 * POST /api/auth-logout
 * Invalida session_nonce no Postgres (migration 017) e responde sempre ok.
 */
import {
  authorizeRequest,
  clearSessionCookie,
  clientIp,
  json,
  sbRpc,
  sessionCredentials,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

type Env = EnvAuth & RateLimitEnv;

export async function onRequestPost(context: { request: Request; env: Env }) {
  const out = (body: unknown, status = 200) => {
    const res = json(body, status);
    res.headers.set('Set-Cookie', clearSessionCookie());
    return res;
  };
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'auth-logout', 60_000, 30))) {
    return out({ error: 'Rate limit.' }, 429);
  }

  const { email, nonce } = sessionCredentials(context.request);

  // Sem credenciais: limpa só o client — não enumerar
  if (!email || nonce.length < 16) {
    return out({ ok: true });
  }

  // Preferir RPC mesmo se sessão já inválida (idempotente)
  try {
    const auth = await authorizeRequest(context.request, context.env);
    // Se secret Bearer, não há nonce de usuário para invalidar
    if (auth.ok && auth.mode === 'secret') {
      return out({ ok: true });
    }

    const r = await sbRpc(context.env, 'logout_dashboard_session', {
      p_email: email,
      p_nonce: nonce,
    });

    if (!r.ok) {
      const msg = typeof r.data === 'string' ? r.data : r.text;
      if (/PGRST202|Could not find the function/i.test(msg)) {
        return out({
          ok: true,
          warning: 'Aplicar migration 017_audit_logout_login_lock.sql no Supabase.',
        });
      }
      // Ainda ok no client — evita travar logout UX
      console.warn('[auth-logout] rpc fail', r.status, String(msg).slice(0, 120));
    }
  } catch (e) {
    console.warn('[auth-logout]', e instanceof Error ? e.message : e);
  }

  return out({ ok: true });
}
