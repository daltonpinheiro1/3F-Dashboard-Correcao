import { matchCampanhaComercial, type CampanhaOp } from './evaDash';

export type RrDialSlice = {
  campanha_op?: string;
  campaign_name?: string | null;
  queue_name?: string | null;
  dialed?: number;
  cpc?: number;
};

export type RrDialCpc = {
  dialed: number;
  cpc: number;
  /** Sem fatia por_campanha — dialed 0 de propósito (KPI global inclui BKO). */
  semFatia: boolean;
};

/** Discagem/CPC do RR: só fatias comerciais. Nunca usa kpis globais (misturam BKO). */
export function resolveDialCpcRr(opts: {
  campanha: CampanhaOp;
  porCampanha: RrDialSlice[] | undefined;
  jornadaCpc: number;
}): RrDialCpc {
  const slices = (opts.porCampanha || []).filter((s) => matchCampanhaComercial(s, opts.campanha));
  if (slices.length) {
    return {
      dialed: slices.reduce((s, r) => s + (r.dialed || 0), 0),
      cpc: slices.reduce((s, r) => s + (r.cpc || 0), 0),
      semFatia: false,
    };
  }
  return { dialed: 0, cpc: opts.jornadaCpc, semFatia: true };
}
