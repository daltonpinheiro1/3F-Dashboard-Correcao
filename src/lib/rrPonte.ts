/**
 * Ponte do gap: mix Port/Mig e CPC baixo — fatias já medidas, sem elasticidade.
 * Mix e supervisores são duas leituras do mesmo gap; não somar as duas.
 */
import type { CampanhaOp, EvaPayload } from './evaDash';
import { vendasEvaSerie } from './rrComparativos';
import type { RrSupGap } from './rrOportunidades';
import { metaJanelaRr } from './rrPeriodo';

export type RrPonteFatia = {
  id: string;
  label: string;
  vendas: number;
  meta: number;
  gap: number;
  pctMeta: number;
};

export type RrPonte = {
  mix: RrPonteFatia[];
  cpcBaixo: RrPonteFatia[];
  gapCasa: number;
  vendasCasa: number;
  metaCasa: number;
};

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function fatia(id: string, label: string, vendas: number, meta: number): RrPonteFatia {
  return { id, label, vendas, meta, gap: vendas - meta, pctMeta: pct(vendas, meta) };
}

export function vendasMixPayloads(
  payloads: EvaPayload[],
  produto: 'PORTABILIDADE' | 'MIGRACAO',
): number {
  return payloads.reduce((s, p) => s + vendasEvaSerie(p.serie_hora || [], produto), 0);
}

export function buildRrPonte(opts: {
  campanha: CampanhaOp;
  payloads: EvaPayload[];
  metaPort: number;
  metaMig: number;
  from: string;
  to: string;
  supervisores: RrSupGap[];
}): RrPonte {
  const { campanha, payloads, from, to, supervisores } = opts;
  const mesRef = to.slice(0, 10) || from.slice(0, 10);
  const metaPortJ = metaJanelaRr(opts.metaPort, from, to, mesRef);
  const metaMigJ = metaJanelaRr(opts.metaMig, from, to, mesRef);
  const vPort = vendasMixPayloads(payloads, 'PORTABILIDADE');
  const vMig = vendasMixPayloads(payloads, 'MIGRACAO');

  let mix: RrPonteFatia[] = [];
  if (campanha === 'TODAS' || campanha === 'PORTABILIDADE') {
    mix.push(fatia('port', 'Portabilidade', vPort, metaPortJ));
  }
  if (campanha === 'TODAS' || campanha === 'MIGRACAO') {
    mix.push(fatia('mig', 'Migração', vMig, metaMigJ));
  }

  const vendasCasa = mix.reduce((s, f) => s + f.vendas, 0);
  const metaCasa = mix.reduce((s, f) => s + f.meta, 0);
  const cpcBaixo = supervisores
    .filter((s) => s.alertaCpc && s.gap < 0)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 6)
    .map((s) => fatia(`cpc-${s.supervisor}`, s.supervisor, s.vendas, s.metaDia));

  return {
    mix,
    cpcBaixo,
    gapCasa: vendasCasa - metaCasa,
    vendasCasa,
    metaCasa,
  };
}
