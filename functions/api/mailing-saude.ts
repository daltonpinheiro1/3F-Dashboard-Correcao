/**
 * GET /api/mailing-saude
 * Saúde do mailing do dia (curva por tentativa, propensão, desgaste), publicada pela VM em eva-dash/mailing/live.json.
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireGestao,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';
import { parseMailingSaude } from '../../shared/contracts/mailing';

type Env = EnvAuth & RateLimitEnv;

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'mailing-saude', 60_000, 120))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  const auth = requireGestao(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  try {
    const source = await sbFetch(
      context.env,
      `/storage/v1/object/eva-dash/mailing/live.json?t=${Date.now()}`,
      { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } },
    );
    if (source.status === 404 || source.status === 400) {
      return json({ error: 'Saúde do mailing ainda não publicada.' }, 404);
    }
    if (!source.ok) return json({ error: `Storage indisponível (${source.status}).` }, 502);
    const parsed = parseMailingSaude(await source.json().catch(() => null));
    if (!parsed.ok) return json({ error: `Contrato mailing inválido: ${parsed.error}` }, 422);
    return new Response(JSON.stringify(parsed.value), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie, X-Dashboard-Session',
      },
    });
  } catch {
    return json({ error: 'Falha ao consultar a saúde do mailing.' }, 503);
  }
}
