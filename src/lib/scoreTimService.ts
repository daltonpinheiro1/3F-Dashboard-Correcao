import { dashboardSessionHeaders } from './dashboardSession';
import { throwDashboardApiError } from './dashboardApiError';

export type ScoreTimSubmit = {
  cpf: string;
  nome: string;
  data_nascimento: string;
  nome_mae: string;
  uf: string;
  telefone?: string;
  cep?: string;
};

export type ScoreTimPlan = {
  nome: string;
  preco?: number;
  preco_nao_fidel?: number;
  dados?: string;
  minutos?: string;
  operadora?: string;
  beneficios?: string;
  descricao?: string;
};

export type ScoreTimResult = {
  query_id: string;
  status: string;
  score?: number | null;
  purchase_limit?: number | null;
  rejection_reason?: string | null;
  outcome_code?: string | null;
  plans?: ScoreTimPlan[];
  latency_ms?: number | null;
};

export type ScoreTimLookup = {
  found: boolean;
  nome?: string;
  data_nascimento?: string;
  nome_mae?: string;
  uf?: string;
  telefone?: string;
  cache_fresh?: boolean;
  last_status?: string;
  last_score?: number;
  last_reason?: string;
};

const TERMINAL = new Set(['APPROVED', 'REJECTED', 'FAILED', 'INDETERMINATE']);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL.has((status || '').toUpperCase());
}

async function api(pathQuery: string, init: RequestInit): Promise<Response> {
  const headers = dashboardSessionHeaders(init.headers);
  return fetch(`/api/score-tim${pathQuery}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
}

/** Enfileira consulta no bot (resposta rápida — sem esperar o crivo). */
export async function enqueueScoreTim(
  body: ScoreTimSubmit,
): Promise<{ query_id: string }> {
  const r = await api('', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as {
    query_id?: string;
    error?: string;
  };
  if (!r.ok || !data.query_id) {
    throwDashboardApiError(r.status, data, data.error || `Falha ao consultar (${r.status})`);
  }
  return { query_id: data.query_id! };
}

/** Status pontual (404 no bot → PROCESSING). */
export async function getScoreTimStatus(queryId: string): Promise<ScoreTimResult> {
  const q = new URLSearchParams({ query_id: queryId });
  const r = await api(`?${q}`, { method: 'GET' });
  const data = (await r.json().catch(() => ({}))) as ScoreTimResult & { error?: string };
  if (r.status === 202 && data.status) {
    return data;
  }
  if (!r.ok) {
    throwDashboardApiError(r.status, data, data.error || `Falha ao obter status (${r.status})`);
  }
  return data;
}

/**
 * Poll no browser (melhor performance no Worker: não segura conexão 2 min).
 * Intervalo 2s, teto ~3 min.
 */
export async function pollScoreTimResult(
  queryId: string,
  opts?: { intervalMs?: number; maxAttempts?: number; signal?: AbortSignal },
): Promise<ScoreTimResult> {
  const intervalMs = opts?.intervalMs ?? 2000;
  const maxAttempts = opts?.maxAttempts ?? 90;
  for (let i = 0; i < maxAttempts; i++) {
    if (opts?.signal?.aborted) {
      throw new Error('Consulta cancelada.');
    }
    const result = await getScoreTimStatus(queryId);
    if (isTerminalStatus(result.status)) {
      return result;
    }
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(resolve, intervalMs);
      opts?.signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(t);
          reject(new Error('Consulta cancelada.'));
        },
        { once: true },
      );
    });
  }
  throw new Error('Tempo esgotado aguardando o Crivo. Tente novamente em instantes.');
}

/** Autofill a partir do cache local do bot (24h). */
export async function lookupScoreTim(cpf: string): Promise<ScoreTimLookup> {
  const q = new URLSearchParams({
    lookup: '1',
    cpf: cpf.replace(/\D/g, ''),
  });
  const r = await api(`?${q}`, { method: 'GET' });
  const data = (await r.json().catch(() => ({ found: false }))) as ScoreTimLookup & {
    error?: string;
  };
  if (!r.ok) {
    throwDashboardApiError(r.status, data, data.error || `Lookup falhou (${r.status})`);
  }
  return data;
}
