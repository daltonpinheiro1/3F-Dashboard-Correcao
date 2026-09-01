/**
 * GET /api/analytics-overview?de=YYYY-MM-DD&ate=YYYY-MM-DD
 */
import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireInteligencia,
  type EnvAuth,
} from '../_lib/auth';
import { buildAnalyticsOverview } from '../_lib/analyticsOverview';

const hits = new Map<string, number[]>();

export async function onRequestGet(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request))) return json({ error: 'Rate limit.' }, 429);
  const auth = requireInteligencia(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const url = new URL(context.request.url);
  const today = new Date().toISOString().slice(0, 10);
  const de = (url.searchParams.get('de') || today).slice(0, 10);
  const ate = (url.searchParams.get('ate') || today).slice(0, 10);

  try {
    const overview = await buildAnalyticsOverview(context.env, de, ate);
    return json(overview);
  } catch (e: unknown) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
