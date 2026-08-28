/**
 * Análise inteligente de atestado (OpenAI Vision).
 * Extrai período, CID, tipo, CRM e valida requisitos obrigatórios.
 */

import {
  allowRate,
  authorizeRequest,
  clientIp,
  json,
  requireAdmin,
  type EnvAuth,
} from '../_lib/auth';
import { decodeImageBase64 } from '../_lib/atestadosStorage';

const MODEL = 'gpt-4o-mini';
const MAX_BODY_BYTES = 12_000_000;
const hits = new Map<string, number[]>();

export type IaRequisitos = {
  periodo: boolean;
  cid: boolean;
  tipo_documento: boolean;
  nome_medico: boolean;
  crm: boolean;
  assinatura_carimbo: boolean;
  nome_paciente: boolean;
};

export type IaAnaliseResult = {
  tipo: string;
  unidade_periodo: 'dias' | 'horas';
  quantidade_dias: number;
  quantidade_horas: number;
  data_inicio: string | null;
  data_fim: string | null;
  cid: string | null;
  medico_nome: string | null;
  crm_uf: string | null;
  colaborador_nome_detectado: string | null;
  requisitos: IaRequisitos;
  alertas: string[];
  resumo: string;
  confianca: number;
  modelo: string;
  analisado_em: string;
};

export async function onRequestPost(context: {
  request: Request;
  env: EnvAuth & { OPENAI_API_KEY?: string };
}) {
  const ip = clientIp(context.request);
  if (!allowRate(hits, ip, 60_000, 10)) {
    return json({ error: 'Rate limit. Aguarde 1 minuto.' }, 429);
  }

  const auth = requireAdmin(await authorizeRequest(context.request, context.env));
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const key = context.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY ausente no Pages.' }, 503);

  const raw = await context.request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: `Payload grande demais (${raw.length} bytes).` }, 413);
  }

  let payload: { imagem_base64?: string; colaborador_nome?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'JSON inválido.' }, 400);
  }

  const imgRaw = String(payload.imagem_base64 || '').trim();
  const decoded = decodeImageBase64(imgRaw);
  if (!decoded.ok) return json({ error: decoded.error }, 400);

  const colaboradorEsperado = String(payload.colaborador_nome || '').trim();
  const dataUrl = imgRaw.startsWith('data:')
    ? imgRaw
    : `data:${decoded.mime};base64,${imgRaw.replace(/\s/g, '')}`;

  const system = [
    'Você é especialista em departamento pessoal brasileiro e validação de atestados médicos.',
    'Analise a imagem do atestado e extraia dados estruturados.',
    'NÃO invente informações ausentes — use null e marque requisitos como false.',
    'Tipos: medico, odontologico, acompanhamento, declaracao, outro.',
    'unidade_periodo: "dias" para afastamento em dias; "horas" para horas (ex.: comparecimento).',
    'Datas no formato YYYY-MM-DD quando legíveis.',
    'CID no formato alfanumérico (ex.: J06.9) se presente.',
    'requisitos: booleans indicando se o campo está visível e legível no documento.',
    'alertas: lista de problemas (ex.: "CID ausente", "período ilegível").',
    'confianca: 0 a 1 (qualidade da leitura).',
    'Responda APENAS JSON válido, sem markdown.',
  ].join('\n');

  const userContent = [
    {
      type: 'text',
      text: JSON.stringify({
        colaborador_esperado: colaboradorEsperado || null,
        instrucao:
          'Extraia campos do atestado e avalie requisitos obrigatórios para protocolo de RH.',
      }),
    },
    {
      type: 'image_url',
      image_url: { url: dataUrl, detail: 'high' },
    },
  ];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
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
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: userContent,
          },
        ],
      }),
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return json({ error: 'Timeout na IA (45s). Tente novamente.' }, 504);
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

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    return json({ error: 'Resposta da IA inválida.', detalhe: content.slice(0, 200) }, 502);
  }

  const requisitos = (parsed.requisitos || {}) as Partial<IaRequisitos>;
  const confianca = Math.min(1, Math.max(0, Number(parsed.confianca) || 0.5));
  const alertas = Array.isArray(parsed.alertas)
    ? parsed.alertas.map((a) => String(a)).slice(0, 12)
    : [];

  if (colaboradorEsperado && parsed.colaborador_nome_detectado) {
    const exp = colaboradorEsperado.toLowerCase().slice(0, 8);
    const det = String(parsed.colaborador_nome_detectado).toLowerCase();
    if (exp.length >= 4 && !det.includes(exp)) {
      alertas.push('Nome no documento pode não corresponder ao colaborador selecionado.');
    }
  }

  const result: IaAnaliseResult = {
    tipo: String(parsed.tipo || 'medico'),
    unidade_periodo: parsed.unidade_periodo === 'horas' ? 'horas' : 'dias',
    quantidade_dias: Number(parsed.quantidade_dias) || 0,
    quantidade_horas: Number(parsed.quantidade_horas) || 0,
    data_inicio: parsed.data_inicio ? String(parsed.data_inicio).slice(0, 10) : null,
    data_fim: parsed.data_fim ? String(parsed.data_fim).slice(0, 10) : null,
    cid: parsed.cid ? String(parsed.cid).trim().slice(0, 12) : null,
    medico_nome: parsed.medico_nome ? String(parsed.medico_nome).trim().slice(0, 200) : null,
    crm_uf: parsed.crm_uf ? String(parsed.crm_uf).trim().slice(0, 24) : null,
    colaborador_nome_detectado: parsed.colaborador_nome_detectado
      ? String(parsed.colaborador_nome_detectado).trim()
      : null,
    requisitos: {
      periodo: Boolean(requisitos.periodo),
      cid: Boolean(requisitos.cid),
      tipo_documento: Boolean(requisitos.tipo_documento),
      nome_medico: Boolean(requisitos.nome_medico),
      crm: Boolean(requisitos.crm),
      assinatura_carimbo: Boolean(requisitos.assinatura_carimbo),
      nome_paciente: Boolean(requisitos.nome_paciente),
    },
    alertas,
    resumo: String(parsed.resumo || 'Análise concluída. Revise os campos antes de protocolar.').slice(
      0,
      500,
    ),
    confianca,
    modelo: MODEL,
    analisado_em: new Date().toISOString(),
  };

  return json({ analise: result });
}
