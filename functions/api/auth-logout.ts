/**
 * POST /api/auth-logout
 * Invalida session_nonce no Postgres (migration 017) e responde sempre ok.
 */
import { allowRate, authorizeRequest, clientIp, json, sbRpc, type EnvAuth } from '../_lib/auth';

type Env = EnvAuth;

const hits = new Map<string, number[]>();

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!allowRate(hits, clientIp(context.request), 60_000, 30)) {
    return json({ error: 'Rate limit.' }, 429);
  }

  const email = (context.request.headers.get('x-dashboard-email') || '').trim().toLowerCase();
  const nonce = (context.request.headers.get('x-dashboard-session') || '').trim();

  // Sem credenciais: limpa só o client — não enumerar
  if (!email || nonce.length < 16) {
    return json({ ok: true });
  }

  // Preferir RPC mesmo se sessão já inválida (idempotente)
  try {
    const auth = await authorizeRequest(context.request, context.env);
    // Se secret Bearer, não há nonce de usuário para invalidar
    if (auth.ok && auth.mode === 'secret') {
      return json({ ok: true });
    }

    const r = await sbRpc(context.env, 'logout_dashboard_session', {
      p_email: email,
      p_nonce: nonce,
    });

    if (!r.ok) {
      const msg = typeof r.data === 'string' ? r.data : r.text;
      if (/PGRST202|Could not find the function/i.test(msg)) {
        return json({
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

  return json({ ok: true });
}
