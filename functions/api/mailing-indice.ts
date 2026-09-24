/**
 * GET /api/mailing-indice
 *
 * Índice multi-dia (mailing/dias.json). Endpoint separado de /api/mailing-saude
 * para não misturar cache/contrato com o snapshot de saúde.
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
import { parseMailingDias } from '../../shared/contracts/mailing';

type Env = EnvAuth & RateLimitEnv;

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'mailing-indice', 60_000, 120))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  const auth = requireGestao(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  try {
    const source = await sbFetch(
      context.env,
      `/storage/v1/object/eva-dash/mailing/dias.json?t=${Date.now()}`,
      { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } },
    );
    if (source.status === 404 || source.status === 400) {
      return json({ error: 'Índice de dias do mailing ainda não publicado.' }, 404);
    }
    if (!source.ok) return json({ error: `Storage indisponível (${source.status}).` }, 502);
    const raw = await source.json().catch(() => null);
    const parsed = parseMailingDias(raw);
    if (!parsed.ok) return json({ error: `Contrato índice inválido: ${parsed.error}` }, 422);
    return new Response(JSON.stringify(parsed.value), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie, X-Dashboard-Session',
      },
    });
  } catch {
    return json({ error: 'Falha ao consultar o índice do mailing.' }, 503);
  }
}
