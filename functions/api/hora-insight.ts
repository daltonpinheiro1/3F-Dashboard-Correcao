import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  type EnvAuth,
} from '../_lib/auth';
import { MODEL_REASONING, MODEL_WORKHORSE, openaiChat } from '../_lib/openaiModels';

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

  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
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

  try {
    const chat = await openaiChat(
      key,
      {
        model: MODEL_REASONING,
        maxTokens: 2500,
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
      },
      { timeoutMs: 20_000, fallback: MODEL_WORKHORSE },
    );
    return json({
      texto: chat.texto,
      modelo: chat.modelo,
      fallback_usado: chat.fallback_usado,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return json({ error: 'Timeout na IA. Tente novamente.' }, 504);
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/timeout|abort/i.test(msg)) return json({ error: 'Timeout na IA. Tente novamente.' }, 504);
    return json({ error: msg }, 502);
  }
}
