import { labelGapRitmo } from './rrExecutivo';
import type { AnaliseOperador } from './ofensorOp';

export type RrExceptionNivel = 'critico' | 'alto';

export type RrException = {
  id: string;
  nivel: RrExceptionNivel;
  titulo: string;
  detalhe: string;
  href?: string;
  /** Supervisor sugerido como dono do alerta (quem mais pesa no gap). */
  dono?: string;
};

/** Probabilidade (Monte Carlo) abaixo disso aciona alerta preditivo. */
export const PROB_META_LIMIAR = 35;
/** Antes disso (hora BRT) a amostra do dia é curta demais para o Monte Carlo. */
export const PROB_META_HORA_MIN = 12;

export function buildRrExceptions(opts: {
  taxaErroPct: number;
  emTransito: number;
  funilUniverso: number;
  gap: number;
  ofensoresCriticos: number;
  stale?: boolean;
  reconcileAlerta?: boolean;
  reconcileDetalhe?: string;
  aplicavel360?: boolean;
  /** 0–100, do Monte Carlo do dia. */
  probMeta?: number | null;
  horaBrt?: number;
  forecastRealista?: number | null;
  metaDia?: number;
  supervisorDono?: string | null;
}): RrException[] {
  const out: RrException[] = [];
  if (opts.stale) {
    out.push({
      id: 'live_stale',
      nivel: 'alto',
      titulo: 'Live EVA atrasado',
      detalhe: 'Sync live.json acima de 8 min — nowcast pode estar defasado.',
    });
  }
  if (opts.aplicavel360 !== false && opts.taxaErroPct >= 15) {
    out.push({
      id: 'erro_critico',
      nivel: 'critico',
      titulo: `Taxa de erro ${opts.taxaErroPct}%`,
      detalhe: 'Qualidade cadastral ≥ 15% — ofensor de correção.',
      href: '/erros',
    });
  } else if (opts.aplicavel360 !== false && opts.taxaErroPct >= 8) {
    out.push({
      id: 'erro_alto',
      nivel: 'alto',
      titulo: `Taxa de erro ${opts.taxaErroPct}%`,
      detalhe: 'Acima do limiar 8%.',
      href: '/erros',
    });
  }
  const univ = opts.funilUniverso || 0;
  const tr = opts.emTransito || 0;
  const trPct = univ ? Math.round((tr / univ) * 1000) / 10 : 0;
  if (opts.aplicavel360 !== false && (tr >= 200 || trPct >= 15)) {
    out.push({
      id: 'transito',
      nivel: tr >= 400 || trPct >= 25 ? 'critico' : 'alto',
      titulo: `Trânsito ${tr} (${trPct}% do universo)`,
      detalhe: 'Logística travada — cohort mês.',
      href: '/disparos',
    });
  }
  const ritmo = labelGapRitmo(opts.gap);
  if (ritmo.abaixo) {
    out.push({
      id: 'gap_meta',
      nivel: opts.gap <= -20 ? 'critico' : 'alto',
      titulo: ritmo.texto,
      detalhe: 'Vendas EVA abaixo da meta projetada agora.',
    });
  }
  const prob = opts.probMeta;
  if (
    prob != null &&
    Number.isFinite(prob) &&
    prob < PROB_META_LIMIAR &&
    (opts.horaBrt ?? 0) >= PROB_META_HORA_MIN
  ) {
    const dono = opts.supervisorDono?.trim() || undefined;
    const proj =
      opts.forecastRealista != null && opts.metaDia
        ? `Forecast realista ${Math.round(opts.forecastRealista)} de meta ${Math.round(opts.metaDia)}. `
        : '';
    out.push({
      id: 'prob_meta_baixa',
      nivel: prob < 15 ? 'critico' : 'alto',
      titulo: `Chance de bater a meta ${Math.round(prob)}%`,
      detalhe: `${proj}Monte Carlo do ritmo do dia (sem LLM).${dono ? ` Dono: ${dono}.` : ''}`,
      href: '/hora',
      dono,
    });
  }
  if (opts.ofensoresCriticos > 0) {
    out.push({
      id: 'ofensor_p0',
      nivel: 'critico',
      titulo: `${opts.ofensoresCriticos} ofensor(es) P0`,
      detalhe: 'Operadores em nível crítico no recorte.',
      href: '/hora',
    });
  }
  if (opts.reconcileAlerta) {
    out.push({
      id: 'reconcile',
      nivel: 'alto',
      titulo: 'Gross EVA ≠ Gross SMS',
      detalhe: opts.reconcileDetalhe || 'Divergência acima do limiar.',
    });
  }
  return out;
}

export function ofensoresP0(ofensores: AnaliseOperador[]): AnaliseOperador[] {
  return ofensores.filter((o) => o.nivel === 'critico');
}
