/**
 * POST /api/portabilidade-fatia-insight
 * Análise IA da fatia ativa (motivos, estratificação, KPIs gerenciais).
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
const MAX_BODY = 80_000;

type Env = EnvAuth & { OPENAI_API_KEY?: string; RATE_LIMIT?: KVNamespace };

export async function onRequestPost(context: { request: Request; env: Env }) {
  const ip = clientIp(context.request);
  if (!(await allowRateDistributed(context.env, ip, 'portab-insight', 60_000, 6))) {
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
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      signal: ctrl.signal,
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.25,
        max_tokens: 1800,
        messages: [
          {
            role: 'system',
            content:
              'Você é analista sênior de portabilidade TIM na 3F Telecom. ' +
              'Responda em português, objetivo, para gestores. Use APENAS o JSON enviado. ' +
              'Estruture:\n' +
              '1) LEITURA EXECUTIVA (3 linhas)\n' +
              '2) TOP 3 CAUSAS (motivo recusar / ticket / order)\n' +
              '3) RISCOS OPERACIONAIS (2–3 bullets)\n' +
              '4) AÇÕES RECOMENDADAS (prioridade P0/P1, máx 5)\n' +
              '5) COMPARATIVO (se houver vs mês anterior)\n' +
              'Não invente números. Se faltar dado, diga explicitamente.',
          },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!r.ok) {
      console.error('[portabilidade-fatia-insight] OpenAI', r.status);
      return json({ error: 'Falha ao gerar análise.' }, 502);
    }
    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    if (!text) return json({ error: 'Resposta vazia da IA.' }, 502);
    return json({ ok: true, analise: text, model: MODEL });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg.includes('abort') ? 'Timeout na análise.' : 'Falha na análise.' }, 502);
  } finally {
    clearTimeout(timer);
  }
}
