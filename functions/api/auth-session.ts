/**
 * GET /api/auth-session — sessão atual (abas / perfil) para hidratar o cliente.
 */
import {
  authorizeRequest,
  clientIp,
  json,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

type Env = EnvAuth & RateLimitEnv;

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'auth-session', 60_000, 60))) {
    return json({ error: 'Rate limit.' }, 429);
  }
  const auth = await authorizeRequest(context.request, context.env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const u = auth.user;
  return json({
    email: u?.email || '',
    full_name: u?.full_name || '',
    role: u?.role || '',
    perfil_slug: u?.perfil_slug || u?.role || '',
    abas: Array.isArray(u?.abas) ? u!.abas : [],
  });
}
