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

/** Hora `09` do alerta: `slot_hora` (09:10) ou `slot` (YYYY-MM-DD 09:10). Sem slot volta vazia. */
export function horaDoAlerta(a: Pick<EvaDiscagensAlertaQueda, 'slot' | 'slot_hora'>): string {
  const m = String(a.slot_hora || '').match(/^(\d{1,2}):/) || String(a.slot || '').match(/\s(\d{2}):/);
  return m ? m[1].padStart(2, '0') : '';
}

/** Alerta sem slot não tem hora conhecida: sai quando há hora filtrada. */
export function filtrarAlertasQuedaHora(
  rows: EvaDiscagensAlertaQueda[] | undefined,
  hora: string,
): EvaDiscagensAlertaQueda[] {
  if (hora === 'todas') return rows || [];
  const hh = hora.padStart(2, '0').slice(0, 2);
  return (rows || []).filter((a) => horaDoAlerta(a) === hh);
}

/**
 * Aviso de bloco cuja origem não tem o recorte pedido (número segue sendo do dia/da casa).
 * null quando o bloco acompanha todos os filtros ativos.
 */
export function avisoGranularidade(opts: {
  hora: string;
  campanha: CampanhaOp;
  detalhaHora: boolean;
  detalhaCampanha: boolean;
}): string | null {
  const semHora = opts.hora !== 'todas' && !opts.detalhaHora;
  const semCampanha = opts.campanha !== 'TODAS' && !opts.detalhaCampanha;
  if (semHora && semCampanha) return 'Dia inteiro, todas as campanhas: a origem não detalha por hora nem por campanha.';
  if (semHora) return 'Dia inteiro: a origem não detalha por hora.';
  if (semCampanha) return 'Todas as campanhas: a origem não detalha por campanha.';
  return null;
}

/**
 * Tempo discando vem só da jornada (dia inteiro por campanha).
 * Hora filtrada: null (não há dialing_time por hora na origem).
 */
export function tempoDiscandoRecorte(opts: {
  hora: string;
  campanha: CampanhaOp;
  kpisDialingSeg?: number | null;
  jornada: Array<{ campanha_op?: string; campaign_name?: string | null; dialing_time?: number | null }>;
}): number | null {
  if (opts.hora !== 'todas') return null;
  if (opts.campanha === 'TODAS') return opts.kpisDialingSeg ?? null;
  const rows = opts.jornada.filter((j) => matchCampanha(j, opts.campanha));
  if (!rows.some((j) => j.dialing_time != null)) return null;
  return rows.reduce((s, j) => s + (Number(j.dialing_time) || 0), 0);
}

export type OciosidadePulse = {
  media: number;
  medida: boolean;
  vales: number | null;
  nota?: string;
};

/**
 * Ociosidade do Pulse no recorte de hora. `noRecorte` = a espera/hora é do mesmo recorte
 * (casa inteira em TODAS ou fatia `ociosidade_hora_camp`); vales > 45s só existem no dia.
 */
export function ociosidadePulseNaHora(opts: {
  hora: string;
  noRecorte: boolean;
  dia: { media: number; medida: boolean; vales: number | null };
  porHora: Map<string, number>;
}): OciosidadePulse {
  if (opts.hora === 'todas') return { ...opts.dia };
  const hh = opts.hora.padStart(2, '0').slice(0, 2);
  if (opts.noRecorte && opts.porHora.has(hh)) {
    return { media: opts.porHora.get(hh) as number, medida: true, vales: null, nota: `espera média ${hh}h · vales só no dia` };
  }
  return { media: 0, medida: false, vales: null, nota: 'sem espera por hora neste recorte' };
}
