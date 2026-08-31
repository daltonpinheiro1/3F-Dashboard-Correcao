import { labelGapRitmo } from './rrExecutivo';
import type { AnaliseOperador } from './ofensorOp';

export type RrExceptionNivel = 'critico' | 'alto';

export type RrException = {
  id: string;
  nivel: RrExceptionNivel;
  titulo: string;
  detalhe: string;
  href?: string;
};

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
}): RrException[] {
  const out: RrException[] = [];
  if (opts.stale) {
    out.push({
      id: 'live_stale',
      nivel: 'alto',
      titulo: 'Live EVA atrasado',
      detalhe: 'Sync live.json acima de 5 min — nowcast pode estar defasado.',
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
