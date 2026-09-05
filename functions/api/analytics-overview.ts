/**
 * GET /api/analytics-overview?de=YYYY-MM-DD&ate=YYYY-MM-DD
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireInteligencia,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';
import { buildAnalyticsOverview } from '../_lib/analyticsOverview';
import { dataBrtIsoFn } from '../_lib/rrKpis';

type Env = EnvAuth & RateLimitEnv;

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'analytics-overview', 60_000, 40))) {
    return json({ error: 'Rate limit.' }, 429);
  }
  const auth = requireInteligencia(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const url = new URL(context.request.url);
  const today = dataBrtIsoFn();
  const de = (url.searchParams.get('de') || today).slice(0, 10);
  const ate = (url.searchParams.get('ate') || today).slice(0, 10);

  try {
    const overview = await buildAnalyticsOverview(context.env, de, ate);
    return json(overview);
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
