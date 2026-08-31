/**
 * POST /api/rr-insight — briefing executivo RR (3 causas do gap + 3 ações).
 */
import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  type EnvAuth,
} from '../_lib/auth';

const MODEL = 'gpt-4o-mini';
const MAX_BODY = 80_000;
const hits = new Map<string, number[]>();

type Env = EnvAuth & { OPENAI_API_KEY?: string };

export async function onRequestPost(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!allowRate(hits, ip, 60_000, 6)) {
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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 22_000);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      signal: ctrl.signal,
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.25,
        max_tokens: 900,
        messages: [
          {
            role: 'system',
            content:
              'Você é o briefing da reunião de resultado (RR) 3F Telecom, estilo Amazon WBR. ' +
              'Português, tom de comitê, sem enrolação. Use SOMENTE o JSON. ' +
              'Gross = OS+ICCID (Port, dia). EVA = sucesso tabulado. TIM = Portado+FP (mês). ' +
              'Gap positivo = acima do ritmo; negativo = abaixo. ' +
              'Formato markdown obrigatório:\n\n' +
              '## Situação (2 linhas)\n' +
              '## 3 causas do gap\n- ...\n' +
              '## 3 ações (owner + prazo hoje)\n1. ...\n' +
              '## Risco\n(1 bullet)\n\n' +
              'Não invente números. Se o recorte Mig/BKO não tem Gross, não compare Gross.',
          },
          { role: 'user', content: JSON.stringify(payload) },
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
    return json({ texto, modelo: MODEL });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: /abort/i.test(msg) ? 'Timeout na IA (22s).' : 'Falha no briefing.' }, 502);
  } finally {
    clearTimeout(timer);
  }
}
