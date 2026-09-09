import { dashboardSessionHeaders } from './dashboardSession';
import { throwDashboardApiError } from './dashboardApiError';
import { parseRowsResponse } from '../../shared/contracts/api';

export type CuboTable = 'correcao_logs' | 'sms_eficiencia';
export type CuboFilter = {
  column: string;
  op: 'gte' | 'lte' | 'eq' | 'neq' | 'contains' | 'in';
  value: unknown;
};

export async function queryCubo<T>(opts: {
  table: CuboTable;
  select: string[];
  filters?: CuboFilter[];
  order?: { column: string; ascending?: boolean };
  from?: number;
  to?: number;
  signal?: AbortSignal;
}): Promise<T[]> {
  const response = await fetch('/api/cubo-query', {
    method: 'POST',
    headers: dashboardSessionHeaders(),
    body: JSON.stringify(opts),
    signal: opts.signal,
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throwDashboardApiError(response.status, body, 'Falha ao consultar dados.');
  const parsed = parseRowsResponse<T>(body);
  if (!parsed.ok) throw new Error(`Contrato do cubo inválido: ${parsed.error}`);
  return parsed.value;
}
