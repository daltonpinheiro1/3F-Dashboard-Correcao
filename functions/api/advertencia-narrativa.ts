import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireGestao,
  type EnvAuth,
} from '../_lib/auth';

const MODEL = 'gpt-4o-mini';
const MAX_BODY_BYTES = 40_000;
const hits = new Map<string, number[]>();

/**
 * Reescreve a narrativa do ocorrido em linguagem jurídica alinhada ao
 * DOCUMENTO DE AÇÃO DISCIPLINAR (modelo 3F imutável / CLT art. 482).
 * A cláusula padrão do modelo NÃO é alterada — só a descrição factual.
 */
export async function onRequestPost(context: {
  request: Request;
  env: EnvAuth & { OPENAI_API_KEY?: string };
}) {
  const ip = clientIp(context.request);
  if (!allowRate(hits, ip, 60_000, 12)) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }

  const auth = requireGestao(await authorizeRequest(context.request, context.env));
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

  let payload: {
    rascunho?: string;
    motivo?: string;
    submotivo?: string;
    nivel_label?: string;
    colaborador_nome?: string;
    data_ocorrido?: string;
    motivo_categoria?: string;
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

  const motivo = String(payload.motivo || payload.motivo_categoria || '').trim();
  const submotivo = String(payload.submotivo || '').trim();
  const nivel = String(payload.nivel_label || '').trim();
  const nome = String(payload.colaborador_nome || '').trim();
  const data = String(payload.data_ocorrido || '').trim();
  // Envia só referência do submotivo — cláusula CLT 482 permanece imutável no PDF
  const motivoDoc = submotivo || motivo;

  const system = [
    'Você é redator jurídico trabalhista sênior de RH de contact center (3F Contact Center).',
    'Tarefa: transformar o rascunho do ocorrido em NARRATIVA FACTUAL pronta para DOCUMENTO DE AÇÃO DISCIPLINAR.',
    '',
    'REGRAS OBRIGATÓRIAS:',
    '1) NÃO altere, reescreva, resuma nem cite por completo a cláusula padrão imutável do modelo (CLT art. 482). Ela já constará no PDF separadamente.',
    '2) A narrativa deve complementar o modelo: fatos objetivos, conduta, data/contexto, impacto operacional e adequação ao motivo/submotivo Siscad.',
    '3) Linguagem formal, técnica e jurídica (português BR), em 3ª pessoa, sem adjetivos pejorativos, sem julgamento moral excessivo.',
    '4) NÃO invente fatos, datas, valores, testemunhas, CPF ou matrícula ausentes no rascunho.',
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
    motivo_siscad_categoria: motivo || null,
    submotivo_siscad: submotivo || null,
    motivo_documento: motivoDoc || null,
    nivel_medida: nivel || null,
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

  const words = narrativa.split(/\s+/).filter(Boolean).length;
  if (words < 40 || words > 280) {
    return json({ error: `Narrativa fora do tamanho esperado (${words} palavras). Revise o rascunho.` }, 502);
  }
  if (/art\.?\s*482|CLT/i.test(narrativa) && narrativa.length > 120) {
    return json({ error: 'Narrativa parece duplicar a cláusula padrão. Tente novamente.' }, 502);
  }

  return json({ narrativa, explicacao, modelo: MODEL });
}
