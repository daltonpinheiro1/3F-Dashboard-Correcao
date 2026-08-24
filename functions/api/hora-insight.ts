const MODEL = 'gpt-4o-mini';
const MAX_BODY_BYTES = 120_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;

/** Rate limit simples em memória do isolate (best-effort). */
const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function allowRate(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    hits.set(ip, arr);
    return false;
  }
  arr.push(now);
  hits.set(ip, arr);
  return true;
}

function authorized(req: Request, env: { DASHBOARD_INSIGHT_SECRET?: string; OPENAI_API_KEY?: string }): boolean {
  const secret = (env.DASHBOARD_INSIGHT_SECRET || '').trim();
  // Sem secret configurado: exige header de sessão do dashboard (anti-bot básico)
  const auth = req.headers.get('authorization') || '';
  const sess = req.headers.get('x-dashboard-session') || '';
  if (secret) {
    return auth === `Bearer ${secret}` || sess === secret;
  }
  // Fallback: exige nonce de sessão (hex 32+) emitido no login
  return /^[a-f0-9]{32,}$/i.test(sess);
}

export async function onRequestPost(context: {
  request: Request;
  env: { OPENAI_API_KEY?: string; DASHBOARD_INSIGHT_SECRET?: string };
}) {
  const ip = clientIp(context.request);
  if (!allowRate(ip)) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  if (!authorized(context.request, context.env)) {
    return json({ error: 'Não autorizado. Faça login novamente.' }, 401);
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
