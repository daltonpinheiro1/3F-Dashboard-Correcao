/**
 * POST /api/copilot — assistente contextual unificado.
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';
import { buildCopilotContext, computeRiskRadar, type RiskRadarInput } from '../_lib/operacionalIntel';

const MODEL = 'gpt-4o-mini';
const MAX_BODY = 60_000;

type Env = EnvAuth & RateLimitEnv & { OPENAI_API_KEY?: string };

type Body = {
  question: string;
  page?: string;
  risk_input?: RiskRadarInput;
  analytics?: Record<string, unknown>;
};

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'copilot', 60_000, 8))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const key = context.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY ausente no Pages.' }, 503);

  const raw = await context.request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Payload grande demais.' }, 413);

  let body: Body;
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const question = (body.question || '').trim();
  if (!question || question.length < 4) return json({ error: 'Pergunta muito curta.' }, 400);

  const risk = computeRiskRadar(body.risk_input || {});
  const ctx = buildCopilotContext({
    page: body.page,
    risk,
    analytics: body.analytics,
    question,
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      signal: ctrl.signal,
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 1000,
        messages: [
          {
            role: 'system',
            content:
              'Você é o Copiloto Operacional 3F Telecom. Português, tom executivo, sem inventar números. ' +
              'Use SOMENTE o JSON de contexto. Formato markdown:\n\n' +
              '## Diagnóstico\n' +
              '## Causas prováveis (máx 3)\n' +
              '## Ações recomendadas (owner + prazo hoje)\n' +
              '## Links úteis (rotas internas do dashboard quando aplicável)\n',
          },
          { role: 'user', content: ctx },
        ],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return json({ error: `OpenAI ${r.status}`, detalhe: t.slice(0, 200) }, 502);
    }
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const texto = data.choices?.[0]?.message?.content?.trim() || '';
    if (!texto) return json({ error: 'Resposta vazia da IA.' }, 502);
    return json({ texto, modelo: MODEL, risk });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 504);
  } finally {
    clearTimeout(timer);
  }
}
