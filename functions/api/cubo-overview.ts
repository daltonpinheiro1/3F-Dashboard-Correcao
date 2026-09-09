import {
  authorizeRequest,
  clientIp,
  json,
  requireGestao,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';
import {
  aggregateCorrecao,
  mergeSms,
  type CorrecaoRow,
  type SmsRow,
} from '../_lib/cuboAggregates';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

type Env = EnvAuth & RateLimitEnv;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 1000;
const MAX_ROWS = 50_000;

function dayNumber(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

async function fetchAll<T>(
  env: Env,
  table: 'correcao_logs' | 'sms_eficiencia',
  select: string,
  de: string,
  ate: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      select,
      data_venda: `gte.${de}T00:00:00.000Z`,
      order: 'data_venda.asc',
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    params.append('data_venda', `lte.${ate}T23:59:59.999Z`);
    const response = await sbFetch(env, `/rest/v1/${table}?${params.toString()}`);
    if (!response.ok) throw new Error(`Fonte ${table} indisponível (${response.status}).`);
    const batch = (await response.json()) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error(`Consulta excede ${MAX_ROWS} registros; reduza o período.`);
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'cubo-overview', 60_000, 60))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  const auth = requireGestao(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const url = new URL(context.request.url);
  const de = (url.searchParams.get('de') || '').slice(0, 10);
  const ate = (url.searchParams.get('ate') || '').slice(0, 10);
  if (!ISO_DAY.test(de) || !ISO_DAY.test(ate) || de > ate) {
    return json({ error: 'Período inválido.' }, 400);
  }
  if ((dayNumber(ate) - dayNumber(de)) / 86_400_000 > 62) {
    return json({ error: 'Período máximo: 63 dias.' }, 400);
  }
  try {
    const [logs, sms] = await Promise.all([
      fetchAll<CorrecaoRow>(
        context.env,
        'correcao_logs',
        'vendedor,equipe,supervisor,campos_alterados,tipos_erro,elapsed_ms',
        de,
        ate,
      ),
      fetchAll<SmsRow>(
        context.env,
        'sms_eficiencia',
        'proposta_id,vendedor,equipe,supervisor,sms_previo,classificacao,ticket_status,order_status,retorno_atualizado_em',
        de,
        ate,
      ),
    ]);
    return json(mergeSms(aggregateCorrecao(logs), sms, { de, ate }));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao agregar cubos.' }, 502);
  }
}
