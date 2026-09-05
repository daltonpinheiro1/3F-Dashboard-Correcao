/**
 * POST /api/copilot — assistente contextual unificado.
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireInteligencia,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';
import { MODEL_REASONING, MODEL_WORKHORSE, openaiChat } from '../_lib/openaiModels';
import { buildCopilotContext, computeRiskRadar, type RiskRadarInput } from '../_lib/operacionalIntel';

const MAX_BODY = 80_000;

type Env = EnvAuth & RateLimitEnv & { OPENAI_API_KEY?: string };

type Body = {
  question: string;
  page?: string;
  risk_input?: RiskRadarInput;
  analytics?: Record<string, unknown>;
  live?: Record<string, unknown>;
};

export async function onRequestPost(context: { request: Request; env: Env }) {
  if (!(await allowRateDistributed(context.env, clientIp(context.request), 'copilot', 60_000, 8))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  const auth = requireInteligencia(await authorizeRequest(context.request, context.env));
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
    live: body.live,
    question,
  });

  try {
    const chat = await openaiChat(
      key,
      {
        model: MODEL_REASONING,
        maxTokens: 1600,
        messages: [
          {
            role: 'system',
            content:
              'Você é o Copiloto Operacional 3F Telecom. Português, tom executivo, sem inventar números. ' +
              'Use SOMENTE o JSON de contexto (risk, analytics curado, live EVA/disparos). ' +
              'Priorize interações (ex.: erro acelerando, CPC×fila) e contribuição percentual dos sinais. ' +
              'Pareto de erros usa corte 60%. ' +
              'Regras fixas do projeto: matrix unknown=IGNORAR; SMS prévio sem telefone/ICCID; ' +
              'Portados hoje = só bilhete; corte TIM SMS: Concluído sem ticket conta no consolidado. ' +
              'Formato markdown:\n\n' +
              '## Diagnóstico\n' +
              '## Causas prováveis (máx 3, com evidência do JSON)\n' +
              '## Ações recomendadas (owner + prazo hoje)\n' +
              '## O que NÃO fazer\n' +
              '## Links úteis (rotas internas: /hora /disparos /erros /sms /controle-dp)\n',
          },
          { role: 'user', content: ctx },
        ],
      },
      { timeoutMs: 20_000, fallback: MODEL_WORKHORSE },
    );
    return json({
      texto: chat.texto,
      modelo: chat.modelo,
      fallback_usado: chat.fallback_usado,
      risk,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /timeout|abort/i.test(msg) ? 504 : 502;
    return json({ error: msg }, status);
  }
}
