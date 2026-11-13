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
  /** Ignora cache 24h e força Crivo real. */
  force_live?: boolean;
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
  /** True se RSA/SSO em andamento. */
  session_refreshing?: boolean;
};

export type ScoreTimResult = {
  query_id: string;
  status: string;
  /** QUEUED | AUTH (RSA/IAM/Siebel) | QUERY (Crivo/SWE). */
  phase?: string | null;
  /** QUEUED | SSO | SESSION_REFRESH | NETWORK_RETRY | QUERY */
  wait_reason?: string | null;
  /** True se o bot já tem SRN ativo (poll). */
  session_hot?: boolean | null;
  score?: number | null;
  purchase_limit?: number | null;
  rejection_reason?: string | null;
  outcome_code?: string | null;
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
  /falha_operacional|rsa|sess[aã]o|relogar|timeout|janela rsa|indisponivel|indisponível|keepalive|warm.?up|operacional|n[aã]o encontrada|expirada|envie novamente|502|bad gateway|503|circuit.?breaker|comunica[cç][aã]o com o crivo|crivo|erro de rede|tim_ws|call_validations/i;

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
  const payload: Record<string, unknown> = {
    telefone: phoneDigits(body.telefone),
    cpf: body.cpf.replace(/\D/g, ''),
    nome: body.nome,
    data_nascimento: body.data_nascimento,
    nome_mae: body.nome_mae,
    uf: body.uf,
  };
  if (body.force_live) {
    payload.force_live = true;
  }
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
  outcome_code?: string | null;
  rejection_reason?: string | null;
  purchase_limit?: number | null;
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
  const hintRaw = data as ScoreTimLookupHint & {
    last_status?: string;
    last_score?: number | null;
    last_outcome_code?: string | null;
    last_reason?: string | null;
  };
  return {
    found: Boolean(hintRaw.found),
    nome: hintRaw.nome || '',
    data_nascimento: hintRaw.data_nascimento || '',
    nome_mae: hintRaw.nome_mae || '',
    uf: hintRaw.uf || '',
    telefone: hintRaw.telefone || '',
    cache_fresh: Boolean(hintRaw.cache_fresh),
    status: hintRaw.last_status || hintRaw.status,
    score: hintRaw.last_score ?? hintRaw.score ?? null,
    outcome_code: hintRaw.last_outcome_code ?? hintRaw.outcome_code ?? null,
    rejection_reason: hintRaw.last_reason ?? hintRaw.rejection_reason ?? null,
    purchase_limit: hintRaw.purchase_limit ?? null,
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
    eta_hint_query_seconds:
      data.eta_hint_query_seconds != null
        ? Number(data.eta_hint_query_seconds)
        : undefined,
    eta_hint_auth_seconds:
      data.eta_hint_auth_seconds != null
        ? Number(data.eta_hint_auth_seconds)
        : undefined,
    session_hot:
      typeof data.session_hot === 'boolean' ? data.session_hot : undefined,
    session_refreshing:
      typeof data.session_refreshing === 'boolean'
        ? data.session_refreshing
        : undefined,
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

const POLL_BASE_MS = 2000;
const POLL_DEADLINE_BASE_MS = 6 * 60_000;
const POLL_DEADLINE_AUTH_MS = 12 * 60_000;
const POLL_DEADLINE_HARD_MS = 15 * 60_000;

/** True quando o bot ainda está em RSA/IAM (sessão fria). */
export function isAuthCold(partial: ScoreTimResult): boolean {
  const wait = (partial.wait_reason || '').toUpperCase();
  const phase = (partial.phase || '').toUpperCase();
  const hot = partial.session_hot === true;
  return (
    wait === 'SESSION_REFRESH' ||
    wait === 'SSO' ||
    (phase === 'AUTH' && !hot)
  );
}

/**
 * Intervalo de poll adaptativo (teto = baseMs).
 * Fila longa: 2s · próximo: 1s · AUTH: 1,5s · QUERY quente: 0,5–0,8s.
 * Reduz o gap “bot já concluiu / tela ainda espera” sem martelar a API.
 */
export function pollIntervalMs(
  partial: ScoreTimResult,
  baseMs: number = POLL_BASE_MS,
): number {
  const base = Math.max(300, baseMs);
  const st = (partial.status || '').toUpperCase();
  const wait = (partial.wait_reason || '').toUpperCase();
  const phase = (partial.phase || '').toUpperCase();
  const ahead =
    typeof partial.queue_ahead === 'number' ? partial.queue_ahead : null;
  const hot = partial.session_hot === true;

  if (st === 'QUEUED') {
    if (ahead === 0) return Math.min(base, 1000);
    return Math.min(base, POLL_BASE_MS);
  }
  if (st === 'PROCESSING') {
    if (isAuthCold(partial)) return Math.min(base, 1500);
    const queryPhase = wait === 'QUERY' || phase === 'QUERY';
    if (queryPhase && hot && (ahead === 0 || ahead === null)) {
      return Math.min(base, 500);
    }
    if (queryPhase) return Math.min(base, 800);
    return Math.min(base, 1000);
  }
  return Math.min(base, POLL_BASE_MS);
}

/**
 * Poll no browser. `onProgress` recebe status intermediário (fila/posição).
 * NOT_FOUND logo após restart do bot: soft-retry antes de falhar (gap audit).
 * Prazo em parede (não só tentativas) para intervalo adaptativo não encurtar AUTH.
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
  const baseIntervalMs = opts?.intervalMs ?? POLL_BASE_MS;
  const startedAt = Date.now();
  // maxAttempts legado: converte para prazo (~2s/tentativa) se passado.
  let deadlineAt =
    opts?.maxAttempts != null
      ? startedAt + opts.maxAttempts * POLL_BASE_MS
      : startedAt + POLL_DEADLINE_BASE_MS;
  let notFoundStreak = 0;
  const maxNotFoundSoft = 8;
  let attempts = 0;
  const hardCapAttempts = 900; // segurança contra loop infinito

  while (attempts < hardCapAttempts && Date.now() < deadlineAt) {
    attempts += 1;
    if (opts?.signal?.aborted) {
      throw new Error('Consulta cancelada.');
    }
    const result = await getScoreTimStatus(queryId);
    opts?.onProgress?.(result);
    const st = (result.status || '').toUpperCase();
    if (STOP_POLL.has(st)) {
      notFoundStreak += 1;
      if (notFoundStreak <= maxNotFoundSoft) {
        await sleep(pollIntervalMs(result, baseIntervalMs), opts?.signal);
        continue;
      }
      throw new Error('Consulta não encontrada ou expirada. Envie novamente.');
    }
    notFoundStreak = 0;
    if (isTerminalStatus(result.status)) {
      return result;
    }

    if (isAuthCold(result)) {
      deadlineAt = Math.max(deadlineAt, startedAt + POLL_DEADLINE_AUTH_MS);
    }
    if (typeof result.queue_ahead === 'number' && result.queue_ahead >= 0) {
      const queueBudget = Math.min(
        POLL_DEADLINE_HARD_MS,
        (result.queue_ahead + 2) * 90_000,
      );
      deadlineAt = Math.max(deadlineAt, startedAt + queueBudget);
    }
    deadlineAt = Math.min(deadlineAt, startedAt + POLL_DEADLINE_HARD_MS);

    const waitMs = pollIntervalMs(result, baseIntervalMs);
    if (Date.now() + waitMs >= deadlineAt) {
      break;
    }
    await sleep(waitMs, opts?.signal);
  }
  throw new Error('Tempo esgotado aguardando o bot. Tente novamente em instantes.');
}

/** Parse linha SSE `event:` / `data:` (vitest). */
export function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split(/\r?\n/).filter((l) => l.length > 0);
  let event = 'message';
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null;
  return { event, data };
}

/**
 * Push via EventSource (BFF `stream=1`). Em falha de conexão, rejeita para
 * o caller cair no poll adaptativo.
 */
export function subscribeScoreTimEvents(
  queryId: string,
  opts?: {
    signal?: AbortSignal;
    onProgress?: (partial: ScoreTimResult) => void;
  },
): Promise<ScoreTimResult> {
  return new Promise((resolve, reject) => {
    if (typeof EventSource === 'undefined') {
      reject(new Error('EventSource indisponível'));
      return;
    }
    const q = new URLSearchParams({ stream: '1', query_id: queryId });
    const es = new EventSource(`/api/score-tim?${q}`, { withCredentials: true });
    let opened = false;
    let settled = false;

    const cleanup = () => {
      try {
        es.close();
      } catch {
        /* ignore */
      }
      opts?.signal?.removeEventListener('abort', onAbort);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onAbort = () => {
      finish(() => reject(new Error('Consulta cancelada.')));
    };
    opts?.signal?.addEventListener('abort', onAbort, { once: true });
    if (opts?.signal?.aborted) {
      onAbort();
      return;
    }

    const openWatch = window.setTimeout(() => {
      if (!opened && !settled) {
        finish(() => reject(new Error('SSE sem conexão')));
      }
    }, 4000);

    es.onopen = () => {
      opened = true;
      window.clearTimeout(openWatch);
    };

    const onPayload = (eventName: string, raw: string) => {
      let data: ScoreTimResult;
      try {
        data = JSON.parse(raw) as ScoreTimResult;
      } catch {
        return;
      }
      if (eventName === 'progress' || eventName === 'message') {
        opts?.onProgress?.(data);
        return;
      }
      if (eventName === 'done') {
        opts?.onProgress?.(data);
        finish(() => resolve(data));
        return;
      }
      if (eventName === 'error') {
        const msg =
          (data as ScoreTimResult & { error?: string }).error ||
          'Falha no stream SSE';
        finish(() => reject(new Error(msg)));
      }
    };

    es.addEventListener('progress', (ev) => {
      onPayload('progress', (ev as MessageEvent).data);
    });
    es.addEventListener('done', (ev) => {
      onPayload('done', (ev as MessageEvent).data);
    });
    es.addEventListener('error', (ev) => {
      if (ev instanceof MessageEvent && typeof ev.data === 'string' && ev.data) {
        onPayload('error', ev.data);
        return;
      }
      // Conexão derrubada / 4xx — fallback poll.
      if (!settled) {
        window.clearTimeout(openWatch);
        finish(() => reject(new Error('SSE interrompido')));
      }
    });
  });
}

/**
 * Preferência SSE; se falhar/abrir, usa poll adaptativo já em produção.
 */
export async function waitScoreTimResult(
  queryId: string,
  opts?: {
    intervalMs?: number;
    maxAttempts?: number;
    signal?: AbortSignal;
    onProgress?: (partial: ScoreTimResult) => void;
  },
): Promise<ScoreTimResult> {
  try {
    return await subscribeScoreTimEvents(queryId, {
      signal: opts?.signal,
      onProgress: opts?.onProgress,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Consulta cancelada.') {
      throw err;
    }
    return pollScoreTimResult(queryId, opts);
  }
}
