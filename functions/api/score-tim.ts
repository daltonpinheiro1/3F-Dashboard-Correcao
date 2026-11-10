/**
 * Proxy fino Score_TIM — performance: enqueue rápido + status sob demanda.
 *
 * POST /api/score-tim          → POST {BASE}/queries  (202 + query_id)
 * GET  /api/score-tim?query_id= → GET  {BASE}/queries/{id}
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

type Env = EnvAuth &
  RateLimitEnv & {
    SCORE_TIM_BASE_URL?: string;
    SCORE_TIM_API_KEY?: string;
  };

const ABA = 'consulta-tim';
const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

function botConfig(env: Env): { base: string; key: string } | null {
  const base = (env.SCORE_TIM_BASE_URL || '').replace(/\/$/, '').trim();
  const key = (env.SCORE_TIM_API_KEY || '').trim();
  if (!base) return null;
  return { base, key };
}

function botHeaders(key: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (key) h['X-API-Key'] = key;
  return h;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function maskCpf(cpf: string): string {
  const d = digitsOnly(cpf).padStart(11, '0').slice(-11);
  return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}

async function authorizeTim(req: Request, env: Env) {
  return requireAba(await authorizeRequest(req, env), ABA);
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
      { error: 'Consulta TIM não configurada (SCORE_TIM_BASE_URL).' },
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

  const cpf = digitsOnly(String(body.cpf || ''));
  const nome = String(body.nome || '').trim();
  const data_nascimento = String(body.data_nascimento || '').trim();
  const nome_mae = String(body.nome_mae || '').trim();
  const uf = String(body.uf || '').trim().toUpperCase();
  const telefone = String(body.telefone || '').trim();
  const cep = String(body.cep || '').trim();

  if (!cpf || cpf.length > 11) {
    return json({ error: 'CPF inválido.' }, 422);
  }
  if (!nome || !data_nascimento || !nome_mae) {
    return json({ error: 'Nome, data de nascimento e nome da mãe são obrigatórios.' }, 422);
  }
  if (!UFS.has(uf)) {
    return json({ error: 'UF inválida.' }, 422);
  }

  const payload = {
    cpf: cpf.padStart(11, '0'),
    nome,
    data_nascimento,
    nome_mae,
    uf,
    telefone,
    cep,
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
    return json(
      { query_id: data.query_id, cpf_masked: maskCpf(payload.cpf) },
      202,
    );
  }

  const detail =
    typeof data.detail === 'string'
      ? data.detail
      : data.error || `Falha ao enfileirar (${upstream.status})`;
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
      { error: 'Consulta TIM não configurada (SCORE_TIM_BASE_URL).' },
      503,
    );
  }

  const url = new URL(context.request.url);
  const lookup = url.searchParams.get('lookup');
  const cpf = digitsOnly(url.searchParams.get('cpf') || '');
  const queryId = (url.searchParams.get('query_id') || '').trim();

  if (lookup === '1' || lookup === 'true') {
    if (!cpf || cpf.length > 11) {
      return json({ error: 'CPF inválido para lookup.' }, 422);
    }
    let upstream: Response;
    try {
      upstream = await fetch(
        `${cfg.base}/lookup?cpf=${encodeURIComponent(cpf.padStart(11, '0'))}`,
        { headers: botHeaders(cfg.key) },
      );
    } catch {
      return json({ error: 'Bot Score_TIM inacessível.' }, 502);
    }
    const data = await upstream.json().catch(() => ({ found: false }));
    return json(data, upstream.ok ? 200 : upstream.status);
  }

  if (!queryId || queryId.length > 80) {
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
    return json({ status: 'PROCESSING', query_id: queryId }, 202);
  }

  const data = (await upstream.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!upstream.ok || !data) {
    return json(
      { error: `Falha ao consultar status (${upstream.status})` },
      upstream.status >= 400 ? upstream.status : 502,
    );
  }

  return json({
    query_id: data.query_id ?? queryId,
    status: data.status,
    score: data.score ?? null,
    purchase_limit: data.purchase_limit ?? null,
    rejection_reason: data.rejection_reason ?? null,
    outcome_code: data.outcome_code ?? null,
    plans: Array.isArray(data.plans) ? data.plans : [],
    latency_ms: data.latency_ms ?? null,
  });
}
