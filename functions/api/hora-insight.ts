import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  type EnvAuth,
} from '../_lib/auth';

const MODEL = 'gpt-4o-mini';
const MAX_BODY_BYTES = 120_000;
const hits = new Map<string, number[]>();

export async function onRequestPost(context: {
  request: Request;
  env: EnvAuth & { OPENAI_API_KEY?: string };
}) {
  const ip = clientIp(context.request);
  if (!allowRate(hits, ip, 60_000, 8)) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }

  const auth = await authorizeRequest(context.request, context.env);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  const key = context.env.OPENAI_API_KEY;
  if (!key) {
    return json({ error: 'OPENAI_API_KEY ausente no Pages.' }, 503);
  }

  const raw = await context.request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: `Payload grande demais (${raw.length} bytes).` }, 413);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 22_000);
  let r: Response;
  try {
    r = await fetch('https://api.openai.com/v1/chat/completions', {
      signal: ctrl.signal,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 2500,
        messages: [
          {
            role: 'system',
            content:
              'Você é Consultor Sênior de Performance Comercial do contact center 3F Telecom. ' +
              'Responda em português, curto e acionável, formatado para leitura em reunião de intervalo. ' +
              'Meta CPC operacional vem do payload (meta_dia); se ausente use ≥ 65%. ' +
              'CPC operacional = tabulação (exclui não-CPC); NÃO use bit EVA ~80% de Portabilidade. ' +
              'NÃO invente números fora do JSON fornecido. Use APENAS os dados do payload. ' +
              'Estruture obrigatoriamente nesta ordem:\n' +
              '1) DIAGNÓSTICO (2 linhas): CPC atual vs meta, volume, tendência vs ontem\n' +
              '2) NOWCASTING DE VENDAS: gap acumulado, horário/supervisor, ritmo\n' +
              '3) REDISTRIBUIÇÃO: meta/hora por supervisor (nowcasting.redistribuicao_sup)\n' +
              '4) 3 GATILHOS IMEDIATOS\n' +
              '5) COACHING POR OPERADOR (coaching_operadores)\n' +
              '6) PADRÕES DETECTADOS (2–3)\n' +
              '7) MELHORIAS PARA AMANHÃ (2)\n' +
              '8) PERDAS por improdutividade\n' +
              '9) RESUMO EXECUTIVO (3 linhas) para WhatsApp da liderança\n' +
              'Cada item máximo 3 linhas.',
          },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return json({ error: 'Timeout na IA (22s). Tente novamente.' }, 504);
    }
    return json({ error: `Erro de rede: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }
  clearTimeout(timer);
  if (!r.ok) {
    const t = await r.text();
    return json({ error: `OpenAI ${r.status}`, detalhe: t.slice(0, 280) }, 502);
  }
  const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const texto = data.choices?.[0]?.message?.content?.trim() || '';
  return json({ texto, modelo: MODEL });
}
