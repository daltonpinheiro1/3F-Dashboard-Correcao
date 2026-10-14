import {
  matchCampanhaComercial,
  type CampanhaOp,
  type EvaJornada,
  type EvaPayload,
  type EvaSerieHora,
} from './evaDash';
import { shiftIsoDay } from './brt';

export type RrCmpPonto = { dia: string; vendas: number; cpcPct: number };

export function vendasEvaSerie(serie: EvaSerieHora[], campanha: CampanhaOp): number {
  return serie.filter((r) => matchCampanhaComercial(r, campanha)).reduce((s, r) => s + (r.sucesso || 0), 0);
}

/** CPC% = cpc / tabuladas da jornada no recorte — mesma régua do hero (rrExecutivo) e do período. */
export function cpcEvaJornada(jornada: EvaJornada[], campanha: CampanhaOp): number {
  let c = 0;
  let t = 0;
  for (const j of jornada) {
    if (!matchCampanhaComercial(j, campanha)) continue;
    c += Number(j.cpc || 0);
    t += Number(j.tabuladas || 0);
  }
  if (!t) return 0;
  return Math.round((c / t) * 1000) / 10;
}

export function pontoDePayload(dia: string, p: EvaPayload | null, campanha: CampanhaOp): RrCmpPonto {
  return {
    dia,
    vendas: vendasEvaSerie(p?.serie_hora || [], campanha),
    cpcPct: cpcEvaJornada(p?.jornada || [], campanha),
  };
}

export function deltaPct(atual: number, base: number): number | null {
  if (!base) return null;
  return Math.round(((atual - base) / base) * 1000) / 10;
}

export function janelaComparativo(dataRef: string): { d1: string; d7: string; spark: string[] } {
  const spark: string[] = [];
  for (let i = 6; i >= 1; i--) spark.push(shiftIsoDay(dataRef, -i));
  spark.push(dataRef);
  return { d1: shiftIsoDay(dataRef, -1), d7: shiftIsoDay(dataRef, -7), spark };
}

export type RrComparativo = {
  hoje: RrCmpPonto;
  d1: RrCmpPonto | null;
  d7: RrCmpPonto | null;
  mtdVendas: number;
  spark: RrCmpPonto[];
  vsD1Pct: number | null;
  vsD7Pct: number | null;
};

export function montarComparativo(opts: {
  hoje: RrCmpPonto;
  d1: RrCmpPonto | null;
  d7: RrCmpPonto | null;
  spark: RrCmpPonto[];
  mtdVendas: number;
}): RrComparativo {
  return {
    ...opts,
    vsD1Pct: opts.d1 ? deltaPct(opts.hoje.vendas, opts.d1.vendas) : null,
    vsD7Pct: opts.d7 ? deltaPct(opts.hoje.vendas, opts.d7.vendas) : null,
  };
}
