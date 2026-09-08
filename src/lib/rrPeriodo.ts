import { shiftIsoDay } from './brt';
import {
  matchCampanhaComercial,
  type CampanhaOp,
  type EvaPayload,
} from './evaDash';
import { pesoDiaOperacional } from './metasAprovadas';
import { vendasEvaSerie } from './rrComparativos';
import type { RrSupGap } from './rrOportunidades';

export type RrPontoDia = { dia: string; vendas: number; cpcPct: number };

export type RrPeriodoSnap = {
  from: string;
  to: string;
  diasComDados: number;
  pedidoDias: number;
  truncado: boolean;
  vendas: number;
  meta: number;
  gap: number;
  pctMeta: number;
  cpcPct: number;
  supervisores: RrSupGap[];
  pontos: RrPontoDia[];
};

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function pesoMes(dataRef: string): number {
  const y = Number(dataRef.slice(0, 4));
  const m = Number(dataRef.slice(5, 7));
  const last = new Date(y, m, 0).getDate();
  let w = 0;
  for (let d = 1; d <= last; d++) {
    const iso = `${dataRef.slice(0, 7)}-${String(d).padStart(2, '0')}`;
    w += pesoDiaOperacional(iso);
  }
  return w;
}

function cpcDoPayload(p: EvaPayload, campanha: CampanhaOp): { cpc: number; tabs: number } {
  let cpc = 0;
  let tabs = 0;
  for (const j of p.jornada || []) {
    if (!matchCampanhaComercial(j, campanha)) continue;
    cpc += Number(j.cpc || 0);
    tabs += Number(j.tabuladas || 0);
  }
  return { cpc, tabs };
}

/** Meta da janela = fatia da meta mensal pelo peso dos dias (sábado 0.5). */
export function metaJanelaRr(metaMensal: number, from: string, to: string, dataRefMes: string): number {
  const wMes = pesoMes(dataRefMes);
  if (!wMes || metaMensal <= 0) return 0;
  let w = 0;
  const start = from.slice(0, 10);
  const end = to.slice(0, 10);
  let cur = start;
  let guard = 0;
  while (cur <= end && guard < 400) {
    w += pesoDiaOperacional(cur);
    cur = shiftIsoDay(cur, 1);
    guard += 1;
  }
  return Math.round((metaMensal * w) / wMes);
}

export function buildRrPeriodo(opts: {
  payloads: EvaPayload[];
  campanha: CampanhaOp;
  metaMensal: number;
  from: string;
  to: string;
  truncado?: boolean;
  pedidoDias?: number;
}): RrPeriodoSnap {
  const { payloads, campanha, metaMensal, from, to } = opts;
  const byDia = new Map<string, EvaPayload>();
  for (const p of payloads) {
    const dia = (p.data || '').slice(0, 10);
    if (dia) byDia.set(dia, p);
  }

  const pontos: RrPontoDia[] = [];
  let vendas = 0;
  let cpc = 0;
  let tabs = 0;
  const accSup: Record<
    string,
    { vendas: number; cpc: number; tabs: number; ops: Set<string>; peso: number }
  > = {};

  for (const [dia, p] of [...byDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const v = vendasEvaSerie(p.serie_hora || [], campanha);
    const cj = cpcDoPayload(p, campanha);
    pontos.push({ dia, vendas: v, cpcPct: pct(cj.cpc, cj.tabs) });
    vendas += v;
    cpc += cj.cpc;
    tabs += cj.tabs;
    const peso = pesoDiaOperacional(dia);
    for (const j of p.jornada || []) {
      if (!matchCampanhaComercial(j, campanha)) continue;
      const sup = j.supervisor_name || 'Sem supervisor';
      if (!accSup[sup]) {
        accSup[sup] = { vendas: 0, cpc: 0, tabs: 0, ops: new Set(), peso: 0 };
      }
      accSup[sup].vendas += Number(j.sucesso || 0);
      accSup[sup].cpc += Number(j.cpc || 0);
      accSup[sup].tabs += Number(j.tabuladas || 0);
      const login = j.login || String(j.id_user);
      if (login) accSup[sup].ops.add(`${dia}|${login}`);
      accSup[sup].peso += peso;
    }
  }

  const meta = metaJanelaRr(metaMensal, from, to, to);
  const wMes = pesoMes(to);
  const metaDiaBase = wMes > 0 ? metaMensal / wMes : 0;
  const supervisores: RrSupGap[] = Object.entries(accSup)
    .map(([supervisor, a]) => {
      const metaDia = Math.round(metaDiaBase * (a.peso || 0));
      const gap = a.vendas - metaDia;
      return {
        supervisor,
        vendas: a.vendas,
        metaDia,
        gap,
        pctMeta: pct(a.vendas, metaDia),
        pctCpc: pct(a.cpc, a.tabs),
        alertaCpc: a.tabs >= 8 && pct(a.cpc, a.tabs) < 50,
      };
    })
    .sort((a, b) => a.gap - b.gap);

  return {
    from,
    to,
    diasComDados: byDia.size,
    pedidoDias: opts.pedidoDias || pontos.length,
    truncado: Boolean(opts.truncado),
    vendas,
    meta,
    gap: vendas - meta,
    pctMeta: pct(vendas, meta),
    cpcPct: pct(cpc, tabs),
    supervisores,
    pontos,
  };
}
