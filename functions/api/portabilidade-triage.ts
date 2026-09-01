/**
 * POST /api/portabilidade-triage — agente de triagem.
 */
import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requirePortabilidadeRead,
  sbFetch,
  type EnvAuth,
} from '../_lib/auth';
import { triagePortabilidade, type TriageInput } from '../_lib/operacionalIntel';

const TABLE = 'portabilidade_triage_log';
const hits = new Map<string, number[]>();

export async function onRequestPost(context: { request: Request; env: EnvAuth }) {
  if (!allowRate(hits, clientIp(context.request), 60_000, 25)) {
    return json({ error: 'Rate limit.' }, 429);
  }
  const auth = requirePortabilidadeRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: TriageInput & { executar?: boolean };
  try {
    body = (await context.request.json()) as TriageInput & { executar?: boolean };
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const proposta_id = String(body.proposta_id || '').trim();
  if (!proposta_id) return json({ error: 'proposta_id obrigatório.' }, 400);

  const result = triagePortabilidade(body);
  const email =
    auth.mode === 'session' ? String(auth.user?.email || '').trim().toLowerCase() : null;

  let logId: string | null = null;
  try {
    const r = await sbFetch(context.env, `/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        proposta_id,
        classificacao: result.classificacao,
        confianca: result.confianca,
        acao_sugerida: result.acao_sugerida,
        auto_executavel: result.auto_executavel,
        executado: Boolean(body.executar && result.auto_executavel),
        contexto: { input: body, motivos: result.motivos },
        created_by_email: email,
      }),
    });
    if (r.ok) {
      const rows = (await r.json()) as { id: string }[];
      logId = rows[0]?.id || null;
    }
  } catch {
    /* log opcional se migration pendente */
  }

  return json({ ...result, log_id: logId });
}
