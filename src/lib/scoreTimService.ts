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
  /** Segundos por consulta (p50 SLO ou 90) — compat. */
  eta_hint_seconds?: number;
  /** ETA QUERY (SWE+Crivo) com sessão quente. */
  eta_hint_query_seconds?: number;
  /** ETA AUTH frio (RSA→IAM→Siebel). */
  eta_hint_auth_seconds?: number;
  /** True se o bot já tem SRN ativo. */
  session_hot?: boolean;
};

export type ScoreTimResult = {
  query_id: string;
  status: string;
  /** QUEUED | AUTH (RSA/IAM/Siebel) | QUERY (Crivo/SWE). */
  phase?: string | null;
  score?: number | null;
  purchase_limit?: number | null;
  rejection_reason?: string | null;
  outcome_code?: string | null;
  plans?: ScoreTimPlan[];
  latency_ms?: number | null;
  cached?: boolean;
  /** Quantos na frente (0 = próximo / em atendimento). */
  queue_ahead?: number | null;
  queue_position?: number | null;
  queue_depth?: number | null;
  queue_pending?: number | null;
  queue_processing?: number | null;
  queue_max?: number | null;
  /** ETA absoluto deste poll (fase AUTH/QUERY ou fila). */
  eta_hint_seconds?: number | null;
  eta_hint_query_seconds?: number | null;
  eta_hint_auth_seconds?: number | null;
};

const TERMINAL = new Set(['APPROVED', 'REJECTED', 'FAILED', 'INDETERMINATE']);
const STOP_POLL = new Set(['NOT_FOUND', 'EXPIRED']);

/** Erros operacionais (RSA/sessão) — limpar UI e reconsultar automaticamente. */
const RETRYABLE_REASON =
  /falha_operacional|rsa|sess[aã]o|relogar|timeout|janela rsa|indisponivel|indisponível|keepalive|warm.?up|operacional|n[aã]o encontrada|expirada|envie novamente|502|bad gateway|503/i;

export function isTerminalStatus(status: string): boolean {
  return TERMINAL.has((status || '').toUpperCase());
}

/** True se o desfecho pede nova tentativa (não é reprovação de crédito). */
export function isRetryableOperationalFailure(result: ScoreTimResult): boolean {
  const st = (result.status || '').toUpperCase();
  if (st !== 'FAILED') return false;
  const blob = [
    result.outcome_code,
    result.rejection_reason,
    result.status,
  ]
    .filter(Boolean)
    .join(' ');
  return RETRYABLE_REASON.test(blob);
}

export function isRetryableEnqueueError(message: string): boolean {
  return RETRYABLE_REASON.test(message || '');
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
  cached?: boolean;
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
    cached: Boolean((data as ScoreTimEnqueueResult).cached),
  };
}

export type ScoreTimLookupHint = {
  found: boolean;
  nome?: string;
  data_nascimento?: string;
  nome_mae?: string;
  uf?: string;
  telefone?: string;
  cache_fresh?: boolean;
  status?: string;
  score?: number | null;
};

/** Auto-preenchimento a partir do cache 24h do bot (CPF). */
export async function lookupScoreTimCpf(cpf: string): Promise<ScoreTimLookupHint> {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return { found: false };
  const q = new URLSearchParams({ lookup: '1', cpf: digits });
  const r = await api(`?${q}`, { method: 'GET' });
  const data = (await r.json().catch(() => ({}))) as ScoreTimLookupHint & {
    error?: string;
  };
  if (!r.ok) {
    return { found: false };
  }
  const raw = data as ScoreTimLookupHint & {
    last_status?: string;
    last_score?: number | null;
  };
  return {
    found: Boolean(raw.found),
    nome: raw.nome || '',
    data_nascimento: raw.data_nascimento || '',
    nome_mae: raw.nome_mae || '',
    uf: raw.uf || '',
    telefone: raw.telefone || '',
    cache_fresh: Boolean(raw.cache_fresh),
    status: raw.last_status || raw.status,
    score: raw.last_score ?? raw.score ?? null,
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
    eta_hint_seconds: Number(data.eta_hint_seconds ?? 90) || 90,
  };
}

/** Status pontual (404 → NOT_FOUND, sem inventar PROCESSING). */
export async function getScoreTimStatus(queryId: string): Promise<ScoreTimResult> {
  const q = new URLSearchParams({ query_id: queryId });
  const r = await api(`?${q}`, { method: 'GET' });
  const data = (await r.json().catch(() => ({}))) as ScoreTimResult & { error?: string };
  if ((r.status === 202 || r.status === 200) && data.status) {
    return data;
  }
  if (r.status === 404) {
    return {
      query_id: queryId,
      status: String(data.status || 'NOT_FOUND'),
      queue_ahead: null,
      queue_position: null,
      queue_depth: data.queue_depth ?? null,
    };
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
 * NOT_FOUND logo após restart do bot: soft-retry antes de falhar (gap audit).
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
  // ~6 min base; estende se houver fila à frente (teto 15 min).
  let maxAttempts = opts?.maxAttempts ?? 180;
  let notFoundStreak = 0;
  const maxNotFoundSoft = 8; // ~16s de graça pós-restart
  for (let i = 0; i < maxAttempts; i++) {
    if (opts?.signal?.aborted) {
      throw new Error('Consulta cancelada.');
    }
    const result = await getScoreTimStatus(queryId);
    opts?.onProgress?.(result);
    const st = (result.status || '').toUpperCase();
    if (STOP_POLL.has(st)) {
      notFoundStreak += 1;
      if (notFoundStreak <= maxNotFoundSoft) {
        await sleep(intervalMs, opts?.signal);
        continue;
      }
      throw new Error('Consulta não encontrada ou expirada. Envie novamente.');
    }
    notFoundStreak = 0;
    if (isTerminalStatus(result.status)) {
      return result;
    }
    if (typeof result.queue_ahead === 'number' && result.queue_ahead >= 0) {
      const needed = Math.min(450, Math.max(maxAttempts, (result.queue_ahead + 2) * 45));
      maxAttempts = needed;
    }
    await sleep(intervalMs, opts?.signal);
  }
  throw new Error('Tempo esgotado aguardando o bot. Tente novamente em instantes.');
}
