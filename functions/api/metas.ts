/**
 * GET /api/metas — qualquer sessão
 * PUT /api/metas — admin
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  sbRpc,
  sessionCredentials,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';

type Env = EnvAuth & RateLimitEnv;

function rpcMsg(data: unknown, text: string) {
  if (typeof data === 'object' && data && 'message' in data) {
    return String((data as { message?: string }).message || '') || text;
  }
  return text;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'metas-get', 60_000, 80))) {
    return json({ error: 'Rate limit.' }, 429);
  }
  const auth = await authorizeRequest(context.request, context.env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { email, nonce } = sessionCredentials(context.request);
  const url = new URL(context.request.url);
  const competencia = (url.searchParams.get('competencia') || '').slice(0, 7);
  const result = await sbRpc(context.env, 'list_dashboard_metas_by_session', {
    p_email: email,
    p_nonce: nonce,
    p_competencia: competencia || null,
  });
  if (!result.ok) return json({ error: 'Falha ao carregar metas.' }, 502);
  return json(result.data);
}

export async function onRequestPut(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'metas-put', 60_000, 30))) {
    return json({ error: 'Rate limit.' }, 429);
  }
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const body = (await context.request.json().catch(() => null)) as {
    competencia?: string;
    campanhas?: unknown;
    supervisores?: unknown;
  } | null;
  const competencia = String(body?.competencia || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(competencia)) return json({ error: 'Competência inválida (YYYY-MM).' }, 400);
  const { email, nonce } = sessionCredentials(context.request);
  const result = await sbRpc(context.env, 'upsert_dashboard_metas_by_session', {
    p_email: email,
    p_nonce: nonce,
    p_competencia: competencia,
    p_campanhas: Array.isArray(body?.campanhas) ? body!.campanhas : [],
    p_supervisores: Array.isArray(body?.supervisores) ? body!.supervisores : [],
  });
  if (!result.ok) {
    const msg = rpcMsg(result.data, result.text);
    if (/admin_session_required/i.test(msg)) return json({ error: 'Acesso restrito a admin.' }, 403);
    return json({ error: 'Não foi possível gravar metas.' }, 502);
  }
  return json({ ok: true });
}
