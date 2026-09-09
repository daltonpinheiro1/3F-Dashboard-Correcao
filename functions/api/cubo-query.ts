/**
 * POST /api/cubo-query
 * Consulta autenticada e estritamente limitada aos cubos de leitura do dashboard.
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

type Env = EnvAuth & RateLimitEnv;
const TABLE_COLUMNS = {
  correcao_logs: new Set([
    'id',
    'proposta_id',
    'campos_alterados',
    'elapsed_ms',
    'tipos_erro',
    'supervisor',
    'equipe',
    'data_venda',
    'vendedor',
    'created_at',
    'alteracoes',
    'estrategia',
    'fluxo',
  ]),
  sms_eficiencia: new Set([
    'proposta_id',
    'sms_previo',
    'classificacao',
    'ticket_status',
    'order_status',
    'supervisor',
    'equipe',
    'vendedor',
    'retorno_atualizado_em',
    'data_venda',
  ]),
} as const;

type Table = keyof typeof TABLE_COLUMNS;
type Filter = {
  column: string;
  op: 'gte' | 'lte' | 'eq' | 'neq' | 'contains' | 'in';
  value: unknown;
};
type QueryBody = {
  table?: Table;
  select?: string[];
  filters?: Filter[];
  order?: { column: string; ascending?: boolean };
  from?: number;
  to?: number;
};

function scalar(value: unknown): string {
  return String(value ?? '');
}

function inValue(value: unknown): string {
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => {
      if (typeof item === 'number' && Number.isFinite(item)) return String(item);
      return `"${scalar(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    })
    .join(',');
}

export function cuboFilterValue(filter: Filter): string {
  if (filter.op === 'contains') {
    return `cs.${JSON.stringify(Array.isArray(filter.value) ? filter.value : [filter.value])}`;
  }
  if (filter.op === 'in') return `in.(${inValue(filter.value)})`;
  return `${filter.op}.${scalar(filter.value)}`;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'cubo-query', 60_000, 240))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  const auth = requireGestao(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: QueryBody;
  try {
    body = (await context.request.json()) as QueryBody;
  } catch {
    return json({ error: 'Payload inválido.' }, 400);
  }
  if (!body.table || !Object.hasOwn(TABLE_COLUMNS, body.table)) {
    return json({ error: 'Tabela inválida.' }, 400);
  }
  const table = body.table;
  const allowed = TABLE_COLUMNS[table];
  const columns = Array.isArray(body.select) ? body.select : [];
  if (!columns.length || columns.some((c) => !allowed.has(c))) {
    return json({ error: 'Colunas inválidas.' }, 400);
  }
  const params = new URLSearchParams({ select: columns.join(',') });
  for (const filter of body.filters || []) {
    if (!allowed.has(filter.column)) return json({ error: 'Filtro inválido.' }, 400);
    if (!['gte', 'lte', 'eq', 'neq', 'contains', 'in'].includes(filter.op)) {
      return json({ error: 'Operador inválido.' }, 400);
    }
    params.append(filter.column, cuboFilterValue(filter));
  }
  if (body.order) {
    if (!allowed.has(body.order.column)) return json({ error: 'Ordenação inválida.' }, 400);
    params.set('order', `${body.order.column}.${body.order.ascending ? 'asc' : 'desc'}`);
  }
  const from = Math.max(0, Math.floor(Number(body.from) || 0));
  const requestedTo = Math.max(from, Math.floor(Number(body.to) || from + 999));
  const to = Math.min(requestedTo, from + 999);

  try {
    const source = await sbFetch(context.env, `/rest/v1/${table}?${params.toString()}`, {
      headers: { Range: `${from}-${to}`, Prefer: 'count=exact' },
    });
    if (!source.ok) return json({ error: `Consulta indisponível (${source.status}).` }, 502);
    const rows = await source.json();
    return json({ rows: Array.isArray(rows) ? rows : [] });
  } catch {
    return json({ error: 'Falha ao consultar cubo.' }, 503);
  }
}
