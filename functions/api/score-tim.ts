/**
 * Proxy fino Score_TIM — performance: enqueue rápido + status sob demanda.
 *
 * POST /api/score-tim          → POST {BASE}/queries  (202 + query_id)
 * GET  /api/score-tim?query_id= → GET  {BASE}/queries/{id} (+ fila se 202)
 * GET  /api/score-tim?queue=1 → GET {BASE}/queue (snapshot sem PII)
 * GET  /api/score-tim?lookup=1&cpf= → GET {BASE}/lookup?cpf=
 *
 * Secrets (Pages / .dev.vars): SCORE_TIM_BASE_URL, SCORE_TIM_API_KEY
 * Auth: sessão dashboard + aba consulta-tim (admin via ABAS_SO_ADMIN).
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireAba,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';
import {
  BR_UFS,
  clampPersonName,
  digitsOnly,
  isValidBrMobile,
  isValidCpf,
  normalizeBirthDate,
  ufFromPhone,
} from '../../shared/brIdentity';

type Env = EnvAuth &
  RateLimitEnv & {
    SCORE_TIM_BASE_URL?: string;
    SCORE_TIM_API_KEY?: string;
  };

const ABA = 'consulta-tim';
const UFS = new Set<string>(BR_UFS);
const MAX_NAME = 120;

function botConfig(env: Env): { base: string; key: string } | null {
  const base = (env.SCORE_TIM_BASE_URL || '').replace(/\/$/, '').trim();
  const key = (env.SCORE_TIM_API_KEY || '').trim();
  // Fail-closed: sem base ou sem key a consulta não sobe (evita bot aberto).
  if (!base || !key) return null;
  return { base, key };
}

function botHeaders(key: string): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-API-Key': key,
  };
}

function maskCpf(cpf: string): string {
  const d = digitsOnly(cpf, 11).padStart(11, '0').slice(-11);
  return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}

async function authorizeTim(req: Request, env: Env) {
  return requireAba(await authorizeRequest(req, env), ABA);
}

/** Log estruturado sem PII (CPF só mascarado). */
function scoreTimLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component: 'score-tim',
    event,
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'score-tim-post', 60_000, 20))) {
    return json({ error: 'Rate limit. Aguarde um instante.' }, 429);
  }
  const auth = await authorizeTim(context.request, context.env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const cfg = botConfig(context.env);
  if (!cfg) {
    return json(
      { error: 'Consulta TIM não configurada (SCORE_TIM_BASE_URL / SCORE_TIM_API_KEY).' },
      503,
    );
  }

  const body = (await context.request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== 'object') {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const cpf = digitsOnly(String(body.cpf || ''), 11);
  const telefone = digitsOnly(String(body.telefone || ''), 11);
  const nome = clampPersonName(String(body.nome || ''), MAX_NAME);
  const nome_mae = clampPersonName(String(body.nome_mae || ''), MAX_NAME);
  const birthRaw = String(body.data_nascimento || '').trim();
  const data_nascimento = normalizeBirthDate(birthRaw);
  // PDV/regional: DDD do celular prevalece sobre UF enviada.
  const uf = (ufFromPhone(telefone) || String(body.uf || '').trim().toUpperCase());

  if (!isValidCpf(cpf)) {
    return json({ error: 'CPF inválido.' }, 422);
  }
  if (!isValidBrMobile(telefone)) {
    return json(
      { error: 'Celular inválido. Use DDD + 9 dígitos (ex.: 11987654321).' },
      422,
    );
  }
  if (!nome || !nome_mae) {
    return json({ error: 'Nome e nome da mãe são obrigatórios.' }, 422);
  }
  if (!data_nascimento) {
    return json(
      { error: 'Data de nascimento inválida. Use DD/MM/AAAA (16–100 anos).' },
      422,
    );
  }
  if (!UFS.has(uf)) {
    return json({ error: 'UF inválida.' }, 422);
  }

  const payload = {
    cpf,
    nome,
    data_nascimento,
    nome_mae,
    uf,
    telefone,
    cep: '',
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${cfg.base}/queries`, {
      method: 'POST',
      headers: botHeaders(cfg.key),
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ error: 'Bot Score_TIM inacessível.' }, 502);
  }

  const data = (await upstream.json().catch(() => ({}))) as {
    query_id?: string;
    detail?: unknown;
    error?: string;
  };

  if (upstream.status === 202 && data.query_id) {
    const body = data as {
      query_id: string;
      queue_depth?: number;
      queue_ahead?: number;
      queue_position?: number;
    };
    scoreTimLog('info', 'enqueue_ok', {
      query_id: body.query_id,
      cpf_masked: maskCpf(payload.cpf),
      uf: payload.uf,
      queue_depth: body.queue_depth ?? null,
      queue_ahead: body.queue_ahead ?? null,
      upstream_status: upstream.status,
    });
    return json(
      {
        query_id: body.query_id,
        cpf_masked: maskCpf(payload.cpf),
        queue_depth: body.queue_depth ?? null,
        queue_ahead: body.queue_ahead ?? null,
        queue_position: body.queue_position ?? null,
      },
      202,
    );
  }

  const detail =
    typeof data.detail === 'string'
      ? data.detail
      : data.error || `Falha ao enfileirar (${upstream.status})`;
  scoreTimLog('warn', 'enqueue_fail', {
    cpf_masked: maskCpf(payload.cpf),
    uf: payload.uf,
    upstream_status: upstream.status,
    error: String(detail).slice(0, 160),
  });
  return json({ error: detail }, upstream.status >= 400 ? upstream.status : 502);
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'score-tim-get', 60_000, 120))) {
    return json({ error: 'Rate limit. Aguarde um instante.' }, 429);
  }
  const auth = await authorizeTim(context.request, context.env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const cfg = botConfig(context.env);
  if (!cfg) {
    return json(
      { error: 'Consulta TIM não configurada (SCORE_TIM_BASE_URL / SCORE_TIM_API_KEY).' },
      503,
    );
  }

  const url = new URL(context.request.url);
  const lookup = url.searchParams.get('lookup');
  const queueSnap = url.searchParams.get('queue');
  const cpf = digitsOnly(url.searchParams.get('cpf') || '', 11);
  const queryId = (url.searchParams.get('query_id') || '').trim();

  if (queueSnap === '1' || queueSnap === 'true') {
    let upstream: Response;
    try {
      upstream = await fetch(`${cfg.base}/queue`, { headers: botHeaders(cfg.key) });
    } catch {
      scoreTimLog('error', 'queue_unreachable', {});
      return json({ error: 'Bot Score_TIM inacessível.' }, 502);
    }
    const data = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
    if (!upstream.ok || !data) {
      scoreTimLog('warn', 'queue_upstream_fail', { upstream_status: upstream.status });
      return json(
        { error: `Falha ao ler fila (${upstream.status})` },
        upstream.status >= 400 ? upstream.status : 502,
      );
    }
    return json({
      status: data.status ?? 'ok',
      queue_depth: Number(data.queue_depth ?? 0),
      pending: Number(data.pending ?? 0),
      processing: Number(data.processing ?? 0),
      queue_max: Number(data.queue_max ?? 0),
    });
  }

  if (lookup === '1' || lookup === 'true') {
    if (!isValidCpf(cpf)) {
      return json({ error: 'CPF inválido para lookup.' }, 422);
    }
    let upstream: Response;
    try {
      upstream = await fetch(
        `${cfg.base}/lookup?cpf=${encodeURIComponent(cpf)}`,
        { headers: botHeaders(cfg.key) },
      );
    } catch {
      return json({ error: 'Bot Score_TIM inacessível.' }, 502);
    }
    const data = await upstream.json().catch(() => ({ found: false }));
    return json(data, upstream.ok ? 200 : upstream.status);
  }

  if (!queryId || queryId.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(queryId)) {
    return json({ error: 'query_id obrigatório.' }, 422);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${cfg.base}/queries/${encodeURIComponent(queryId)}`, {
      headers: botHeaders(cfg.key),
    });
  } catch {
    return json({ error: 'Bot Score_TIM inacessível.' }, 502);
  }

  if (upstream.status === 404) {
    // ID ausente no store/fila: anexa snapshot global, sem inventar posição.
    let depth = 0;
    let pending = 0;
    let processing = 0;
    try {
      const qRes = await fetch(`${cfg.base}/queue`, { headers: botHeaders(cfg.key) });
      const qData = (await qRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (qRes.ok && qData) {
        depth = Number(qData.queue_depth ?? 0);
        pending = Number(qData.pending ?? 0);
        processing = Number(qData.processing ?? 0);
      }
    } catch {
      /* best-effort */
    }
    return json(
      {
        status: 'PROCESSING',
        query_id: queryId,
        queue_ahead: null,
        queue_position: null,
        queue_depth: depth,
        queue_pending: pending,
        queue_processing: processing,
      },
      202,
    );
  }

  const data = (await upstream.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  // 202 = ainda na fila (QUEUED/PROCESSING com progresso)
  if (!data || (upstream.status !== 200 && upstream.status !== 202)) {
    return json(
      { error: `Falha ao consultar status (${upstream.status})` },
      upstream.status >= 400 ? upstream.status : 502,
    );
  }

  return json(
    {
      query_id: data.query_id ?? queryId,
      status: data.status,
      score: data.score ?? null,
      purchase_limit: data.purchase_limit ?? null,
      rejection_reason: data.rejection_reason ?? null,
      outcome_code: data.outcome_code ?? null,
      plans: Array.isArray(data.plans) ? data.plans : [],
      latency_ms: data.latency_ms ?? null,
      queue_ahead: data.queue_ahead ?? null,
      queue_position: data.queue_position ?? null,
      queue_depth: data.queue_depth ?? null,
      queue_pending: data.queue_pending ?? null,
      queue_processing: data.queue_processing ?? null,
      queue_max: data.queue_max ?? null,
    },
    upstream.status === 202 ? 202 : 200,
  );
}
