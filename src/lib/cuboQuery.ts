import { dashboardSessionHeaders } from './dashboardSession';
import { throwDashboardApiError } from './dashboardApiError';
import { parseRowsResponse } from '../../shared/contracts/api';

export type CuboTable = 'correcao_logs' | 'sms_eficiencia' | 'toutbox_entrega';
export type CuboFilter = {
  column: string;
  op: 'gte' | 'lte' | 'eq' | 'neq' | 'contains' | 'in';
  value: unknown;
};

export type CuboQueryOpts = {
  table: CuboTable;
  select: string[];
  filters?: CuboFilter[];
  order?: { column: string; ascending?: boolean };
  from?: number;
  to?: number;
  signal?: AbortSignal;
};

/** Mesmo teto do cubo-overview: acima disso o navegador trava e o total sai parcial. */
export const TETO_LINHAS_CUBO = 50_000;
const PAGINA_CUBO = 1000;

export class TetoCuboExcedido extends Error {
  constructor(teto: number) {
    super(`Consulta excede ${teto.toLocaleString('pt-BR')} registros; reduza o período.`);
    this.name = 'TetoCuboExcedido';
  }
}

/**
 * Pagina até o fim ou até o teto (lança TetoCuboExcedido).
 * Devolve null se `vigente()` ficar falso no meio: a página já pediu outro recorte.
 */
export async function queryCuboTodas<T>(
  opts: Omit<CuboQueryOpts, 'from' | 'to'>,
  vigente: () => boolean = () => true,
  teto: number = TETO_LINHAS_CUBO,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let offset = 0; offset < teto; offset += PAGINA_CUBO) {
    const batch = await queryCubo<T>({ ...opts, from: offset, to: offset + PAGINA_CUBO - 1 });
    if (!vigente()) return null;
    rows.push(...batch);
    if (batch.length < PAGINA_CUBO) return rows;
  }
  throw new TetoCuboExcedido(teto);
}

export async function queryCubo<T>(opts: CuboQueryOpts): Promise<T[]> {
  const response = await fetch('/api/cubo-query', {
    method: 'POST',
    headers: dashboardSessionHeaders(),
    cache: 'no-store',
    body: JSON.stringify(opts),
    signal: opts.signal,
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throwDashboardApiError(response.status, body, 'Falha ao consultar dados.');
  const parsed = parseRowsResponse<T>(body);
  if (!parsed.ok) throw new Error(`Contrato do cubo inválido: ${parsed.error}`);
  return parsed.value;
}
