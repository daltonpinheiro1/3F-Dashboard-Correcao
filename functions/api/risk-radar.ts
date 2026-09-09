/**
 * POST /api/risk-radar — score unificado multi-módulo.
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireInteligencia,
  type EnvAuth,
} from '../_lib/auth';
import { computeRiskRadar, type RiskRadarInput } from '../_lib/operacionalIntel';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

type Env = EnvAuth & RateLimitEnv;

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'risk-radar', 60_000, 20))) {
    return json({ error: 'Rate limit.' }, 429);
  }
  const auth = requireInteligencia(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: RiskRadarInput;
  try {
    body = (await context.request.json()) as RiskRadarInput;
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  return json(computeRiskRadar(body || {}));
}
