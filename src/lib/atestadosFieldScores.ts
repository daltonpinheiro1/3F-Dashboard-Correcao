import type { IaAnalise } from './atestadosEscala';

export type FieldScoreStatus = 'ok' | 'warn' | 'missing' | 'calculated' | 'manual';

export type FieldScore = {
  key: string;
  label: string;
  score: number;
  status: FieldScoreStatus;
  hint?: string;
};

export type FormSnapshot = {
  dataInicio: string;
  dataFim: string;
  qtdDias: string;
  qtdHoras: string;
  cid: string;
  medico: string;
  crm: string;
  unidade: 'dias' | 'horas';
};

const BASE = 0.35;

function fieldScore(
  filled: boolean,
  requisito: boolean | undefined,
  confianca: number,
  calculated?: boolean,
): { score: number; status: FieldScoreStatus } {
  if (filled && calculated) return { score: Math.round(70 + confianca * 25), status: 'calculated' };
  if (filled) return { score: Math.round(75 + confianca * 25), status: 'ok' };
  if (requisito) return { score: Math.round(BASE * 100), status: 'missing' };
  return { score: Math.round(40 + confianca * 20), status: 'warn' };
}

/** Score por campo — inspirado em confiança granular (Stripe Radar / DocuSign). */
export function buildFieldScores(analise: IaAnalise | null, form: FormSnapshot): FieldScore[] {
  if (!analise) return [];
  const conf = analise.confianca ?? 0.5;
  const req = analise.requisitos;
  const fimCalculada = Boolean(
    form.dataFim &&
      form.dataInicio &&
      form.qtdDias &&
      analise.alertas?.some((a) => a.includes('Data fim calculada')),
  );

  const rows: Array<Omit<FieldScore, 'score' | 'status'> & { filled: boolean; req?: boolean; calc?: boolean }> = [
    { key: 'periodo', label: 'Período', filled: form.unidade === 'dias' ? Boolean(form.qtdDias) : Boolean(form.qtdHoras), req: req?.periodo },
    { key: 'dataInicio', label: 'Data início', filled: Boolean(form.dataInicio), req: req?.periodo },
    {
      key: 'dataFim',
      label: 'Data fim',
      filled: Boolean(form.dataFim),
      req: req?.periodo,
      calc: fimCalculada,
    },
    { key: 'cid', label: 'CID', filled: Boolean(form.cid.trim()), req: req?.cid },
    { key: 'medico', label: 'Médico', filled: Boolean(form.medico.trim()), req: req?.nome_medico },
    { key: 'crm', label: 'CRM/UF', filled: Boolean(form.crm.trim()), req: req?.crm },
  ];

  return rows.map(({ filled, req: r, calc, ...rest }) => {
    const { score, status } = fieldScore(filled, r, conf, calc);
    let hint: string | undefined;
    if (status === 'missing') hint = 'Legível no documento — preencha manualmente.';
    if (status === 'calculated') hint = 'Calculado a partir de início + dias.';
    if (status === 'warn' && !filled) hint = 'Não detectado na foto.';
    return { ...rest, score, status, hint };
  });
}
