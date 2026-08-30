/**
 * POST /api/portabilidade-gerencial-insight
 * Briefing IA do cohort gerencial — projeções, oportunidades, funil completo.
 */
import {
  authorizeRequest,
  clientIp,
  json,
  requirePortabilidadeRead,
  type EnvAuth,
} from '../_lib/auth';
import { allowRateDistributed } from '../_lib/rateLimit';

const MODEL = 'gpt-4o-mini';
const MAX_BODY = 120_000;

type Env = EnvAuth & { OPENAI_API_KEY?: string; RATE_LIMIT?: KVNamespace };

export async function onRequestPost(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!(await allowRateDistributed(context.env, ip, 'portab-ger-insight', 60_000, 4))) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }

  const auth = requirePortabilidadeRead(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const key = context.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY ausente no Pages.' }, 503);

  const raw = await context.request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Payload grande demais.' }, 413);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      signal: ctrl.signal,
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 2800,
        messages: [
          {
            role: 'system',
            content:
              'Você é o copiloto gerencial de portabilidade TIM da 3F Telecom — nível diretoria. ' +
              'Responda em português, tom executivo e acionável. Use SOMENTE os dados JSON. ' +
              'Estruture em markdown:\n\n' +
              '## 🎯 Briefing executivo\n(4 bullets — situação do cohort)\n\n' +
              '## 📈 Projeção e ritmo\n(interprete cenários otimista/realista/pessimista e Monte Carlo)\n\n' +
              '## 🔥 Top oportunidades\n(priorize P0/P1 já listadas + sugira 1–2 extras se dados permitirem)\n\n' +
              '## ⚙️ Plano de ação 72h\n(máx 6 ações numeradas, owner sugerido: Operações/Fila/BKO/Logística)\n\n' +
              '## ⚠️ Riscos\n(2–4 bullets)\n\n' +
              '## 💡 Insight diferencial\n(1 parágrafo — padrão que gestores comuns não veriam)\n\n' +
              'Não invente números. Cite valores do JSON. Se incerto, diga.',
          },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!r.ok) {
      console.error('[portabilidade-gerencial-insight] OpenAI', r.status);
      return json({ error: 'Falha ao gerar briefing.' }, 502);
    }
    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    if (!text) return json({ error: 'Resposta vazia da IA.' }, 502);
    return json({ ok: true, briefing: text, model: MODEL });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg.includes('abort') ? 'Timeout no briefing.' : 'Falha no briefing.' }, 502);
  } finally {
    clearTimeout(timer);
  }
}
