/**
 * POST /api/auth-bootstrap
 * Converte uma sessão legada em header para cookie HttpOnly durante o rollout.
 */
import {
  authorizeRequest,
  clientIp,
  json,
  sessionCookie,
  sessionCredentials,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

type Env = EnvAuth & RateLimitEnv;

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'auth-bootstrap', 60_000, 10))) {
    return json({ error: 'Rate limit.' }, 429);
  }
  const credentials = sessionCredentials(context.request);
  if (!credentials.email || !credentials.nonce) return json({ error: 'Sessão legada ausente.' }, 400);
  const auth = await authorizeRequest(context.request, context.env, {
    allowLegacyHeaders: true,
  });
  if (!auth.ok || auth.mode !== 'session') {
    return json({ error: auth.ok ? 'Sessão inválida.' : auth.error }, auth.ok ? 401 : auth.status);
  }
  const response = json({ ok: true });
  response.headers.set('Set-Cookie', sessionCookie(credentials.email, credentials.nonce));
  return response;
}
