/**
 * POST /api/rr-insight — briefing executivo RR em markdown (nunca JSON).
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed, type RateLimitEnv } from '../_lib/rateLimit';
import { MODEL_WORKHORSE, openaiChat } from '../_lib/openaiModels';
import { insightUserText, sanitizarBriefingRr } from '../_lib/rrBriefing';

const MAX_BODY = 80_000;

type Env = EnvAuth & RateLimitEnv & { OPENAI_API_KEY?: string };

const SYSTEM =
  'Você é o briefing da reunião de resultado (RR) 3F Telecom, estilo Amazon WBR. ' +
  'Português, tom de comitê, sem enrolação. ' +
  'O usuário já descreveu os números em texto. NÃO copie JSON. NÃO abra chave. NÃO use code fence. ' +
  'Resposta SOMENTE em markdown, nestas seções:\n\n' +
  '## Situação\n(2 linhas)\n' +
  '## De onde veio o gap\n- ...\n' +
  '## Oportunidades menores\n- impacto = vendas já medidas, sem elasticidade\n' +
  '## 3 ações\n1. owner + prazo\n' +
  '## Risco\n(1 bullet)\n\n' +
  'Não invente números. Não recálcule CPC/DROP/TMA. Se o recorte não tem Gross, não cite Gross. ' +
  'Todas = Port+Mig; BKO/Algar/Ctrl não entram em Todas.';

export async function onRequestPost(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!(await allowRateDistributed(context.env, ip, 'rr-insight', 60_000, 6))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }

  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const key = context.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY ausente no Pages.' }, 503);

  const raw = await context.request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Payload grande demais.' }, 413);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const user = insightUserText(payload);
  if (!user) return json({ error: 'Payload vazio.' }, 400);

  try {
    const chat = await openaiChat(
      key,
      {
        model: MODEL_WORKHORSE,
        temperature: 0.2,
        maxTokens: 900,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      },
      { timeoutMs: 22_000 },
    );
    const texto = sanitizarBriefingRr(chat.texto);
    if (!texto) return json({ error: 'A IA devolveu JSON vazio. Tente de novo.' }, 502);
    return json({ texto, modelo: chat.modelo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: /abort/i.test(msg) ? 'Timeout na IA (22s).' : 'Falha no briefing.' }, 502);
  }
}
