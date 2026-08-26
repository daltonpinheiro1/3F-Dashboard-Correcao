const MODEL = 'gpt-4o-mini';
const MAX_BODY_BYTES = 40_000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;

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

function authorized(req: Request, env: { DASHBOARD_INSIGHT_SECRET?: string }): boolean {
  const secret = (env.DASHBOARD_INSIGHT_SECRET || '').trim();
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  const sess = req.headers.get('x-dashboard-session') || '';
  return auth === `Bearer ${secret}` || sess === secret;
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

/**
 * Reescreve a narrativa do ocorrido em linguagem jurídica alinhada ao
 * DOCUMENTO DE AÇÃO DISCIPLINAR (modelo 3F imutável / CLT art. 482).
 * A cláusula padrão do modelo NÃO é alterada — só a descrição factual.
 */
export async function onRequestPost(context: {
  request: Request;
  env: { OPENAI_API_KEY?: string; DASHBOARD_INSIGHT_SECRET?: string };
}) {
  const ip = clientIp(context.request);
  if (!allowRate(ip)) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }
  if (!authorized(context.request, context.env)) {
    const hasSecret = Boolean((context.env.DASHBOARD_INSIGHT_SECRET || '').trim());
    if (!hasSecret) {
      return json(
        { error: 'DASHBOARD_INSIGHT_SECRET ausente no Pages. Configure em Settings → Environment.' },
        503,
      );
    }
    return json({ error: 'Não autorizado.' }, 401);
  }

  const key = context.env.OPENAI_API_KEY;
  if (!key) {
    return json({ error: 'OPENAI_API_KEY ausente no Pages.' }, 503);
  }

  const raw = await context.request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: `Payload grande demais (${raw.length} bytes).` }, 413);
  }

  let payload: {
    rascunho?: string;
    motivo?: string;
    submotivo?: string;
    nivel_label?: string;
    colaborador_nome?: string;
    data_ocorrido?: string;
    clausula_modelo?: string;
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const rascunho = String(payload.rascunho || '').trim();
  if (rascunho.length < 12) {
    return json({ error: 'Informe um rascunho do ocorrido (mín. 12 caracteres) para a IA aprimorar.' }, 400);
  }
  if (rascunho.length > 6000) {
    return json({ error: 'Rascunho longo demais (máx. 6000 caracteres).' }, 400);
  }

  const motivo = String(payload.motivo || '').trim();
  const submotivo = String(payload.submotivo || '').trim();
  const nivel = String(payload.nivel_label || '').trim();
  const nome = String(payload.colaborador_nome || '').trim();
  const data = String(payload.data_ocorrido || '').trim();
  const clausula = String(payload.clausula_modelo || '').trim();

  const system = [
    'Você é redator jurídico trabalhista sênior de RH de contact center (3F Contact Center).',
    'Tarefa: transformar o rascunho do ocorrido em NARRATIVA FACTUAL pronta para DOCUMENTO DE AÇÃO DISCIPLINAR.',
    '',
    'REGRAS OBRIGATÓRIAS:',
    '1) NÃO altere, reescreva, resuma nem cite por completo a cláusula padrão imutável do modelo (CLT art. 482). Ela já constará no PDF separadamente.',
    '2) A narrativa deve complementar o modelo: fatos objetivos, conduta, data/contexto, impacto operacional e adequação ao motivo/submotivo Siscad.',
    '3) Linguagem formal, técnica e jurídica (português BR), em 3ª pessoa, sem adjetivos pejorativos, sem julgamento moral excessivo.',
    '4) NÃO invente fatos, datas, valores, testemunhas ou circunstâncias ausentes no rascunho. Se faltar detalhe, use formulação cautelosa ("conforme apurado", "restou verificado").',
    '5) Não use markdown, bullets nem títulos. Apenas texto corrido.',
    '6) Narrativa entre 80 e 220 palavras, pronta para colar no campo "Descrição do ocorrido".',
    '7) Em "explicacao", explique em 2–4 frases o que a IA fez (ajuste de tom jurídico, alinhamento ao motivo, preservação dos fatos) para o responsável revisar.',
    '',
    'Responda APENAS JSON válido, sem markdown:',
    '{"narrativa":"...","explicacao":"..."}',
  ].join('\n');

  const user = JSON.stringify({
    contexto_empresa: '3F Contact Center — gestão de conduta / escala pedagógica',
    colaborador_nome: nome || null,
    data_ocorrido: data || null,
    motivo_siscad: motivo || null,
    submotivo_siscad: submotivo || null,
    nivel_medida: nivel || null,
    clausula_modelo_imutavel_referencia: clausula || null,
    rascunho_ocorrido: rascunho,
    instrucao:
      'Reescreva apenas a narrativa factual do ocorrido, alinhada ao motivo/submotivo, pronta para a advertência.',
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 28_000);
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
        temperature: 0.25,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return json({ error: 'Timeout na IA (28s). Tente novamente.' }, 504);
    }
    return json({ error: `Erro de rede: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }
  clearTimeout(timer);

  if (!r.ok) {
    const t = await r.text();
    return json({ error: `OpenAI ${r.status}`, detalhe: t.slice(0, 280) }, 502);
  }

  const dataAi = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const content = dataAi.choices?.[0]?.message?.content?.trim() || '';
  let narrativa = '';
  let explicacao = '';
  try {
    const parsed = JSON.parse(content) as { narrativa?: string; explicacao?: string };
    narrativa = String(parsed.narrativa || '').trim();
    explicacao = String(parsed.explicacao || '').trim();
  } catch {
    return json({ error: 'Resposta da IA inválida (JSON).', detalhe: content.slice(0, 200) }, 502);
  }

  if (!narrativa) {
    return json({ error: 'IA não retornou narrativa.' }, 502);
  }

  return json({ narrativa, explicacao, modelo: MODEL });
}
