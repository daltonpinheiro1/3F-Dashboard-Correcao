/**
 * Decomposição do gap RR e oportunidades (impacto = vendas já medidas, sem elasticidade inventada).
 */
export type RrFonteGap = {
  label: string;
  valor: number;
  pct: number;
};

export type RrOportunidade = {
  id: string;
  tipo: 'gap_sup' | 'cpc' | 'ofensor';
  titulo: string;
  detalhe: string;
  impacto: number;
  prioridade: 'alta' | 'media' | 'baixa';
  href: string;
};

export type RrSupGap = {
  supervisor: string;
  vendas: number;
  metaDia: number;
  gap: number;
  pctMeta: number;
  pctCpc: number;
  alertaCpc?: boolean;
};

function mediana(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round(((s[m - 1]! + s[m]!) / 2) * 10) / 10;
}

function round0(n: number) {
  return Math.round(n);
}

export function decomporGapRr(
  supervisores: RrSupGap[],
  opts?: { ofensoresCriticos?: number; ofensoresAltos?: number },
): { fontes: RrFonteGap[]; oportunidades: RrOportunidade[] } {
  const comMeta = supervisores.filter((s) => s.metaDia > 0);
  const negativos = [...comMeta].filter((s) => s.gap < 0).sort((a, b) => a.gap - b.gap);
  const totalNeg = negativos.reduce((s, x) => s + x.gap, 0);
  const fontes: RrFonteGap[] = negativos.slice(0, 8).map((s) => ({
    label: s.supervisor,
    valor: s.gap,
    pct: totalNeg ? Math.round((s.gap / totalNeg) * 1000) / 10 : 0,
  }));

  const medPct = mediana(comMeta.map((s) => s.pctMeta));
  const oportunidades: RrOportunidade[] = [];

  for (const s of negativos.slice(0, 4)) {
    const alvoPct = Math.min(100, Math.max(s.pctMeta, medPct));
    const extra = round0((alvoPct / 100) * s.metaDia - s.vendas);
    if (extra <= 0) continue;
    oportunidades.push({
      id: `sup-${s.supervisor}`,
      tipo: 'gap_sup',
      titulo: `${s.supervisor} até a mediana da casa`,
      detalhe: `${s.pctMeta}% da meta → ${alvoPct}% · gap ${s.gap}`,
      impacto: extra,
      prioridade: extra >= 8 ? 'alta' : extra >= 3 ? 'media' : 'baixa',
      href: '/hora',
    });
  }

  for (const s of comMeta.filter((x) => x.alertaCpc && x.gap < 0).slice(0, 2)) {
    if (oportunidades.some((o) => o.id === `sup-${s.supervisor}`)) continue;
    oportunidades.push({
      id: `cpc-${s.supervisor}`,
      tipo: 'cpc',
      titulo: `CPC baixo · ${s.supervisor}`,
      detalhe: `CPC ${s.pctCpc}% com gap ${s.gap} — coaching de tabulação (não projeta venda extra)`,
      impacto: Math.abs(round0(s.gap)),
      prioridade: 'media',
      href: '/chamadas',
    });
  }

  const crit = opts?.ofensoresCriticos || 0;
  const altos = opts?.ofensoresAltos || 0;
  if (crit + altos > 0) {
    oportunidades.push({
      id: 'ofensores',
      tipo: 'ofensor',
      titulo: `${crit + altos} ofensor(es) no recorte`,
      detalhe: `${crit} críticos · ${altos} altos — fechar coaching no dia`,
      impacto: 0,
      prioridade: crit > 0 ? 'alta' : 'media',
      href: '/operacao?vista=ofensores',
    });
  }

  oportunidades.sort((a, b) => {
    const p = { alta: 0, media: 1, baixa: 2 };
    return p[a.prioridade] - p[b.prioridade] || b.impacto - a.impacto;
  });
  return { fontes, oportunidades: oportunidades.slice(0, 8) };
}
