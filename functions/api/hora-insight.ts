const MODEL = 'gpt-4o-mini';

export async function onRequestPost(context: {
  request: Request;
  env: { OPENAI_API_KEY?: string };
}) {
  const key = context.env.OPENAI_API_KEY;
  if (!key) {
    return json({ error: 'OPENAI_API_KEY ausente no Pages.' }, 503);
  }
  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    signal: ctrl.signal,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 1800,
      messages: [
        {
          role: 'system',
          content:
            'Você é Consultor Sênior de Performance Comercial do contact center 3F Telecom. ' +
            'Responda em português, curto e acionável, formatado para leitura em reunião de intervalo. ' +
            'Meta CPC operacional ≥ 65% em Portabilidade e Migração Pré-Pago. ' +
            'NÃO invente números fora do JSON fornecido. Use APENAS os dados do payload. ' +
            'Estruture obrigatoriamente nesta ordem:\n' +
            '1) DIAGNÓSTICO (2 linhas): CPC atual vs meta, volume, tendência vs ontem\n' +
            '2) NOWCASTING DE VENDAS: gap acumulado em unidades, em qual horário e supervisor abriu, ritmo necessário. Use forecast e monte_carlo se presentes.\n' +
            '3) REDISTRIBUIÇÃO: nova meta/hora para cada supervisor nas horas restantes (use nowcasting.redistribuicao_sup)\n' +
            '4) 3 GATILHOS IMEDIATOS: ações concretas para recuperar o gap AGORA\n' +
            '5) COACHING POR OPERADOR: para cada operador em coaching_operadores, 1 ação personalizada baseada no motivo e TMA (ex: "João - TMA alto + Ligação muda: revisar script de abordagem nos primeiros 15s")\n' +
            '6) PADRÕES DETECTADOS: identifique 2-3 padrões nos dados (ex: queda consistente após 15h, supervisor X com curva invertida, correlação TMA alto com baixo CPC)\n' +
            '7) MELHORIAS PARA AMANHÃ: 2 ações preventivas\n' +
            '8) PERDAS: chamadas e vendas perdidas por improdutividade\n' +
            '9) RESUMO EXECUTIVO (3 linhas): sumário para copiar e enviar ao WhatsApp da liderança\n' +
            'Cada item máximo 3 linhas. Use tabelas resumidas quando possível.',
        },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
  });
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
    headers: { 'Content-Type': 'application/json' },
  });
}
