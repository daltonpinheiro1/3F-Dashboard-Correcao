import { matchCampanha, type CampanhaOp } from './evaDash';
import type {
  EvaDiscagensAlertaQueda,
  EvaDiscagensInsight,
  EvaDiscagensOutlier,
} from './evaDash';

export {
  applyCpcTabulacaoHumana,
  overlayCpcTabulacaoHumana,
  sumCpcHumano,
} from './evaDash';

/**
 * % discado AMD = share entre as linhas AMD, nunca vs kpis.dialed.
 * AMD conta eventos do classificador (milhões); discadas do KPI são tentativas (milhares).
 */
export function amdMixShare(dialed: number, mixTotal: number): number {
  if (!mixTotal) return 0;
  const pct = (100 * (dialed || 0)) / mixTotal;
  return Math.round(pct * (pct > 0 && pct < 1 ? 100 : 10)) / (pct > 0 && pct < 1 ? 100 : 10);
}

/** Fila/campanha do recorte Discagens (insights, PIR e outliers usam os mesmos campos). */
export function matchDiscRow(
  r: { campanha_op?: string; queue_name?: string; campanha_label?: string; mailing?: string; mailing_nome?: string },
  campanha: CampanhaOp,
): boolean {
  return matchCampanha(
    {
      campanha_op: r.campanha_op,
      campaign_name: r.mailing_nome || r.mailing || r.campanha_label,
      queue_name: r.queue_name,
    },
    campanha,
  );
}

/** Insight global de métrica peer não tem fila — some no recorte de campanha. */
export function matchDiscInsight(ins: EvaDiscagensInsight, campanha: CampanhaOp): boolean {
  if (ins.tipo === 'metrica') return campanha === 'TODAS';
  return matchDiscRow(ins, campanha);
}

export function filtrarOutliersConversao(
  rows: EvaDiscagensOutlier[] | undefined,
  campanha: CampanhaOp,
): EvaDiscagensOutlier[] {
  return (rows || []).filter((r) => matchDiscRow(r, campanha));
}

export function filtrarAlertasQueda(
  rows: EvaDiscagensAlertaQueda[] | undefined,
  campanha: CampanhaOp,
): EvaDiscagensAlertaQueda[] {
  return (rows || []).filter((r) => matchDiscRow(r, campanha));
}

export function filtrarInsightsDiscagens(
  rows: EvaDiscagensInsight[] | undefined,
  campanha: CampanhaOp,
): EvaDiscagensInsight[] {
  return (rows || []).filter((r) => matchDiscInsight(r, campanha));
}
