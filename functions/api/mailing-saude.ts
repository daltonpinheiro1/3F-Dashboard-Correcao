/**
 * GET /api/mailing-saude?live=1
 * GET /api/mailing-saude?date=YYYY-MM-DD
 * GET /api/mailing-saude?indice=1
 *
 * Live e histórico diário publicados pela VM em eva-dash/mailing/.
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
import { parseMailingDias, parseMailingSaude } from '../../shared/contracts/mailing';

type Env = EnvAuth & RateLimitEnv;

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'mailing-saude', 60_000, 120))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  const auth = requireGestao(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const url = new URL(context.request.url);
  const live = url.searchParams.get('live') === '1';
  const indice = url.searchParams.get('indice') === '1';
  const date = (url.searchParams.get('date') || '').slice(0, 10);

  if (!live && !indice && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Use live=1, indice=1 ou date=YYYY-MM-DD.' }, 400);
  }

  const object = indice
    ? 'mailing/dias.json'
    : live
      ? 'mailing/live.json'
      : `mailing/historico/${date}.json`;

  try {
    const source = await sbFetch(
      context.env,
      `/storage/v1/object/eva-dash/${encodeURI(object)}?t=${Date.now()}`,
      { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } },
    );
    if (source.status === 404 || source.status === 400) {
      return json(
        {
          error: indice
            ? 'Índice de dias do mailing ainda não publicado.'
            : live
              ? 'Saúde do mailing ainda não publicada.'
              : `Sem snapshot de mailing em ${date}.`,
        },
        404,
      );
    }
    if (!source.ok) return json({ error: `Storage indisponível (${source.status}).` }, 502);
    const raw = await source.json().catch(() => null);
    if (indice) {
      const parsed = parseMailingDias(raw);
      if (!parsed.ok) return json({ error: `Contrato índice inválido: ${parsed.error}` }, 422);
      return new Response(JSON.stringify(parsed.value), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=120',
          Vary: 'Cookie, X-Dashboard-Session',
        },
      });
    }
    const parsed = parseMailingSaude(raw);
    if (!parsed.ok) return json({ error: `Contrato mailing inválido: ${parsed.error}` }, 422);
    return new Response(JSON.stringify(parsed.value), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': live ? 'private, no-store' : 'private, max-age=300',
        Vary: 'Cookie, X-Dashboard-Session',
      },
    });
  } catch {
    return json({ error: 'Falha ao consultar a saúde do mailing.' }, 503);
  }
}
