import type { CuboOverview } from '../../functions/_lib/cuboAggregates';
import { isRecord } from '../../shared/contracts/runtime';
import { dashboardSessionHeaders } from './dashboardSession';
import { throwDashboardApiError } from './dashboardApiError';

export async function fetchCuboOverview(
  de: string,
  ate: string,
  signal?: AbortSignal,
): Promise<CuboOverview> {
  const params = new URLSearchParams({ de: de.slice(0, 10), ate: ate.slice(0, 10) });
  const response = await fetch(`/api/cubo-overview?${params.toString()}`, {
    headers: dashboardSessionHeaders(),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throwDashboardApiError(response.status, body as { error?: string }, 'Falha ao carregar resumo.');
  }
  if (
    !isRecord(body) ||
    !isRecord(body.dashboard) ||
    !Array.isArray(body.dashboard_supervisores) ||
    !Array.isArray(body.operadores) ||
    !Array.isArray(body.supervisores)
  ) {
    throw new Error('Contrato do resumo dos cubos inválido.');
  }
  return body as CuboOverview;
}
