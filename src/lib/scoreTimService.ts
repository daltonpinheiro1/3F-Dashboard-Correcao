import { dashboardSessionHeaders } from './dashboardSession';
import { throwDashboardApiError } from './dashboardApiError';
import { phoneDigits } from './brPhone';

export type ScoreTimSubmit = {
  /** CPF 11 dígitos — obrigatório no Crivo/Siebel. */
  cpf: string;
  nome: string;
  data_nascimento: string;
  nome_mae: string;
  uf: string;
  /** Celular BR com DDD (11 dígitos). Define o PDV regional. */
  telefone: string;
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

export type ScoreTimQueueSnapshot = {
  status: string;
  queue_depth: number;
  pending: number;
  processing: number;
  queue_max: number;
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
  /** Quantos na frente (0 = próximo / em atendimento). */
  queue_ahead?: number | null;
  queue_position?: number | null;
  queue_depth?: number | null;
  queue_pending?: number | null;
  queue_processing?: number | null;
  queue_max?: number | null;
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

export type ScoreTimEnqueueResult = {
  query_id: string;
  queue_depth?: number | null;
  queue_ahead?: number | null;
  queue_position?: number | null;
};

/** Enfileira consulta no bot (resposta rápida — sem esperar o crivo). */
export async function enqueueScoreTim(
  body: ScoreTimSubmit,
): Promise<ScoreTimEnqueueResult> {
  const payload = {
    ...body,
    telefone: phoneDigits(body.telefone),
    cpf: body.cpf.replace(/\D/g, ''),
  };
  const r = await api('', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = (await r.json().catch(() => ({}))) as ScoreTimEnqueueResult & {
    error?: string;
  };
  if (!r.ok || !data.query_id) {
    throwDashboardApiError(r.status, data, data.error || `Falha ao consultar (${r.status})`);
  }
  return {
    query_id: data.query_id!,
    queue_depth: data.queue_depth ?? null,
    queue_ahead: data.queue_ahead ?? null,
    queue_position: data.queue_position ?? null,
  };
}

/** Snapshot da fila (sem PII) para painel ao vivo. */
export async function getScoreTimQueue(): Promise<ScoreTimQueueSnapshot> {
  const r = await api('?queue=1', { method: 'GET' });
  const data = (await r.json().catch(() => ({}))) as ScoreTimQueueSnapshot & {
    error?: string;
  };
  if (!r.ok) {
    throwDashboardApiError(r.status, data, data.error || `Falha ao ler fila (${r.status})`);
  }
  return {
    status: String(data.status || 'ok'),
    queue_depth: Number(data.queue_depth ?? 0),
    pending: Number(data.pending ?? 0),
    processing: Number(data.processing ?? 0),
    queue_max: Number(data.queue_max ?? 0),
  };
}

/** Status pontual (404 no bot → PROCESSING). */
export async function getScoreTimStatus(queryId: string): Promise<ScoreTimResult> {
  const q = new URLSearchParams({ query_id: queryId });
  const r = await api(`?${q}`, { method: 'GET' });
  const data = (await r.json().catch(() => ({}))) as ScoreTimResult & { error?: string };
  if ((r.status === 202 || r.status === 200) && data.status) {
    return data;
  }
  if (!r.ok) {
    throwDashboardApiError(r.status, data, data.error || `Falha ao obter status (${r.status})`);
  }
  return data;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Consulta cancelada.'));
      return;
    }
    const t = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(t);
      reject(new Error('Consulta cancelada.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Poll no browser. `onProgress` recebe status intermediário (fila/posição).
 */
export async function pollScoreTimResult(
  queryId: string,
  opts?: {
    intervalMs?: number;
    maxAttempts?: number;
    signal?: AbortSignal;
    onProgress?: (partial: ScoreTimResult) => void;
  },
): Promise<ScoreTimResult> {
  const intervalMs = opts?.intervalMs ?? 2000;
  const maxAttempts = opts?.maxAttempts ?? 90;
  for (let i = 0; i < maxAttempts; i++) {
    if (opts?.signal?.aborted) {
      throw new Error('Consulta cancelada.');
    }
    const result = await getScoreTimStatus(queryId);
    opts?.onProgress?.(result);
    if (isTerminalStatus(result.status)) {
      return result;
    }
    await sleep(intervalMs, opts?.signal);
  }
  throw new Error('Tempo esgotado aguardando o Crivo. Tente novamente em instantes.');
}
