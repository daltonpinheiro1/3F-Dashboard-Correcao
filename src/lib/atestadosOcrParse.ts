/**
 * Parser heurístico de texto OCR (local ou IA) — extrai campos comuns de atestados BR.
 */

import type { IaAnalise, IaRequisitos } from './atestadosEscala';

const CID_RE = /\b([A-Z]\d{2}(?:\.\d{1,2})?)\b/i;
const CRM_RE = /CRM[\s/-]*([A-Z]{2})?\s*[\s:.-]*(\d{3,6})/i;
const DATA_RE = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;
const DIAS_RE = /(\d+)\s*dia[s]?/i;
const HORAS_RE = /(\d+)\s*h(?:ora[s]?)?/i;

function normData(d: number, m: number, y: number): string {
  const year = y < 100 ? 2000 + y : y;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseTextoAtestado(texto: string): Partial<IaAnalise> {
  const t = String(texto || '');
  const cidM = t.match(CID_RE);
  const crmM = t.match(CRM_RE);
  const diasM = t.match(DIAS_RE);
  const horasM = t.match(HORAS_RE);

  const datas: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(DATA_RE.source, 'gi');
  while ((m = re.exec(t)) !== null && datas.length < 4) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) datas.push(normData(d, mo, y));
  }

  const unidade = horasM && !diasM ? 'horas' : 'dias';
  const requisitos: IaRequisitos = {
    periodo: Boolean(diasM || horasM || datas.length >= 1),
    cid: Boolean(cidM),
    tipo_documento: /atestado|declara/i.test(t),
    nome_medico: /dr\.?|dra\.?|m[eé]dic/i.test(t),
    crm: Boolean(crmM),
    assinatura_carimbo: /assinat|carimbo/i.test(t),
    nome_paciente: /paciente|colaborador|funcion[aá]rio/i.test(t),
  };

  const ok = Object.values(requisitos).filter(Boolean).length;
  return {
    tipo: /odontol/i.test(t) ? 'odontologico' : 'medico',
    unidade_periodo: unidade as 'dias' | 'horas',
    quantidade_dias: diasM ? Number(diasM[1]) : datas.length > 1 ? datas.length : 0,
    quantidade_horas: horasM ? Number(horasM[1]) : 0,
    data_inicio: datas[0] || null,
    data_fim: datas[1] || datas[0] || null,
    cid: cidM ? cidM[1].toUpperCase() : null,
    crm_uf: crmM ? `${crmM[2] || ''}${crmM[1] ? `/${crmM[1]}` : ''}`.trim() : null,
    medico_nome: null,
    requisitos,
    alertas: ok < 4 ? ['OCR local: revise campos manualmente.'] : [],
    resumo: 'Análise OCR local (offline). Confira período, CID e assinatura.',
    confianca: Math.min(0.75, 0.35 + ok * 0.06),
    modelo: 'ocr-local',
    analisado_em: new Date().toISOString(),
  };
}
