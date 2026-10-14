/** Reconcile Gross EVA (sucesso tabulado) ↔ Gross SMS (OS TIM 1-xxx). */
import type { CampanhaOp, EvaSerieHora } from './evaDash';
import { vendasEvaSerie } from './rrComparativos';

export const RECONCILE_LIMIAR_PCT = 25;

/** Gross SMS é universo Portabilidade: em TODAS (Port+Mig) o lado EVA usa só Port. */
export function vendasEvaReconcile(opts: {
  campanha: CampanhaOp;
  vendasRecorte: number;
  serie: EvaSerieHora[];
}): number {
  return opts.campanha === 'TODAS' ? vendasEvaSerie(opts.serie, 'PORTABILIDADE') : opts.vendasRecorte;
}

export type RrReconcile = {
  eva: number;
  sms: number;
  delta: number;
  pct: number;
  alerta: boolean;
  limiarPct: number;
};

export function reconcileGrossEvaSms(
  eva: number,
  sms: number,
  limiarPct = RECONCILE_LIMIAR_PCT,
): RrReconcile {
  const e = Math.max(0, eva);
  const s = Math.max(0, sms);
  const delta = e - s;
  const base = Math.max(e, s);
  const pct = base ? Math.round((Math.abs(delta) / base) * 1000) / 10 : 0;
  return {
    eva: e,
    sms: s,
    delta,
    pct,
    alerta: base > 0 && pct > limiarPct,
    limiarPct,
  };
}

export function reconcileDetalhe(r: RrReconcile): string {
  const sinal = r.delta > 0 ? '+' : '';
  return `EVA ${r.eva} vs SMS ${r.sms} · Δ ${sinal}${r.delta} (${r.pct}% · limiar ${r.limiarPct}%)`;
}
