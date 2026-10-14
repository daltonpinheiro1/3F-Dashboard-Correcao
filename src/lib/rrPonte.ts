/**
 * Ponte do gap: mix Port/Mig e CPC baixo — fatias já medidas, sem elasticidade.
 * Mix e supervisores são duas leituras do mesmo gap; não somar as duas.
 */
import type { CampanhaOp, EvaPayload } from './evaDash';
import { vendasEvaSerie } from './rrComparativos';
import type { RrSupGap } from './rrOportunidades';
import { metaJanelaRr, type RrMetaMensal } from './rrPeriodo';

export type RrPonteFatia = {
  id: string;
  label: string;
  vendas: number;
  meta: number;
  gap: number;
  pctMeta: number;
  /** Meta cheia do dia quando a fatia usa a meta nowcast (live). */
  metaDiaCheia?: number;
};

export type RrPonte = {
  mix: RrPonteFatia[];
  cpcBaixo: RrPonteFatia[];
  gapCasa: number;
  vendasCasa: number;
  metaCasa: number;
  nowcast: boolean;
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
  metaPort: RrMetaMensal;
  metaMig: RrMetaMensal;
  from: string;
  to: string;
  supervisores: RrSupGap[];
  /** Live: fração da meta do dia já devida agora (mesma régua do hero/nowcast). */
  fracaoNowcast?: number | null;
}): RrPonte {
  const { campanha, payloads, from, to, supervisores } = opts;
  const fr = opts.fracaoNowcast;
  const nowcast = fr != null && Number.isFinite(fr);
  const fracao = nowcast ? Math.min(1, Math.max(0, fr as number)) : 1;
  const metaPortDia = metaJanelaRr(opts.metaPort, from, to);
  const metaMigDia = metaJanelaRr(opts.metaMig, from, to);
  const vPort = vendasMixPayloads(payloads, 'PORTABILIDADE');
  const vMig = vendasMixPayloads(payloads, 'MIGRACAO');
  const comMeta = (f: RrPonteFatia, cheia: number): RrPonteFatia =>
    nowcast ? { ...f, metaDiaCheia: cheia } : f;

  const mix: RrPonteFatia[] = [];
  if (campanha === 'TODAS' || campanha === 'PORTABILIDADE') {
    mix.push(comMeta(fatia('port', 'Portabilidade', vPort, Math.round(metaPortDia * fracao)), metaPortDia));
  }
  if (campanha === 'TODAS' || campanha === 'MIGRACAO') {
    mix.push(comMeta(fatia('mig', 'Migração', vMig, Math.round(metaMigDia * fracao)), metaMigDia));
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
    nowcast,
  };
}
