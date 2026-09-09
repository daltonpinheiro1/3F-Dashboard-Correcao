/**
 * GET /api/eva-data?live=1 | ?date=YYYY-MM-DD
 * Proxy autenticado do bucket privado eva-dash.
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
import { parseEvaSnapshot } from '../../shared/contracts/eva';

type Env = EnvAuth & RateLimitEnv;

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'eva-data', 60_000, 180))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  const auth = requireGestao(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const url = new URL(context.request.url);
  const date = (url.searchParams.get('date') || '').slice(0, 10);
  const live = url.searchParams.get('live') === '1';
  if (!live && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Use live=1 ou date=YYYY-MM-DD.' }, 400);
  }
  const object = live ? 'live.json' : `historico/${date}.json`;
  try {
    const source = await sbFetch(
      context.env,
      `/storage/v1/object/eva-dash/${encodeURI(object)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (source.status === 404) return json({ error: 'Snapshot EVA não encontrado.' }, 404);
    if (!source.ok) return json({ error: `Storage EVA indisponível (${source.status}).` }, 502);
    const payload = await source.json().catch(() => null);
    const parsed = parseEvaSnapshot(payload, {
      kind: live ? 'live' : 'historical',
      expectedDate: live ? undefined : date,
    });
    if (!parsed.ok) {
      return json({ error: `Contrato EVA inválido: ${parsed.error}` }, 422);
    }
    return new Response(JSON.stringify(parsed.value), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': live ? 'private, no-store' : 'private, max-age=300',
        Vary: 'Cookie, X-Dashboard-Session',
      },
    });
  } catch {
    return json({ error: 'Falha ao consultar EVA.' }, 503);
  }
}
