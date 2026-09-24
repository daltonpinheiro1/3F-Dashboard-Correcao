/**
 * GET /api/mailing-saude          → live (compat)
 * GET /api/mailing-saude?live=1
 * GET /api/mailing-saude?date=YYYY-MM-DD
 *
 * Índice multi-dia: use /api/mailing-indice (não ?indice=1).
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

function looksLikeIndice(raw: unknown): boolean {
  return (
    !!raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { dias?: unknown }).dias) &&
    !((raw as { resumo?: unknown }).resumo && typeof (raw as { resumo: unknown }).resumo === 'object')
  );
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'mailing-saude', 60_000, 120))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  const auth = requireGestao(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const url = new URL(context.request.url);
  if (url.searchParams.get('indice') === '1') {
    // Compat: redireciona semanticamente para o índice (evita 400 em scripts antigos).
    const source = await sbFetch(
      context.env,
      `/storage/v1/object/eva-dash/mailing/dias.json?t=${Date.now()}`,
      { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } },
    );
    if (source.status === 404 || source.status === 400) {
      return json({ error: 'Índice de dias do mailing ainda não publicado.' }, 404);
    }
    if (!source.ok) return json({ error: `Storage indisponível (${source.status}).` }, 502);
    const parsed = parseMailingDias(await source.json().catch(() => null));
    if (!parsed.ok) return json({ error: `Contrato índice inválido: ${parsed.error}` }, 422);
    return new Response(JSON.stringify(parsed.value), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie, X-Dashboard-Session',
        'X-Deprecated-Endpoint': 'Use /api/mailing-indice',
      },
    });
  }
  const liveParam = url.searchParams.get('live');
  const date = (url.searchParams.get('date') || '').slice(0, 10);
  const live = liveParam === '1' || (!liveParam && !/^\d{4}-\d{2}-\d{2}$/.test(date));

  if (!live && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Use live=1 ou date=YYYY-MM-DD.' }, 400);
  }

  const object = live ? 'mailing/live.json' : `mailing/historico/${date}.json`;

  try {
    const source = await sbFetch(
      context.env,
      `/storage/v1/object/eva-dash/${encodeURI(object)}?t=${Date.now()}`,
      { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } },
    );
    if (source.status === 404 || source.status === 400) {
      return json(
        {
          error: live
            ? 'Saúde do mailing ainda não publicada.'
            : `Sem snapshot de mailing em ${date}.`,
        },
        404,
      );
    }
    if (!source.ok) return json({ error: `Storage indisponível (${source.status}).` }, 502);
    const raw = await source.json().catch(() => null);
    if (looksLikeIndice(raw)) {
      return json(
        {
          error:
            'Storage devolveu índice de dias no lugar do snapshot de saúde. Recarregue; se persistir, republicar mailing/live.json.',
        },
        502,
      );
    }
    const parsed = parseMailingSaude(raw);
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
