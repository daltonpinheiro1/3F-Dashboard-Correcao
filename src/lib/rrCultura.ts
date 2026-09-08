/** Cultura da RR — frase da casa e pódio/banco (números já medidos). */

export type RrCulturaNome = {
  supervisor: string;
  vendas: number;
  metaDia: number;
  gap: number;
  pctMeta: number;
};

export function fraseDaCasa(opts: {
  gap: number;
  pctMeta: number;
  mix: Array<{ id: string; label: string; gap: number }>;
  ofensores: number;
}): string {
  const ritmo =
    opts.gap > 0 ? `Acima +${opts.gap}` : opts.gap < 0 ? `Abaixo ${opts.gap}` : 'No ritmo';
  const parts = [`${ritmo} · ${opts.pctMeta}% da meta`];
  if (opts.mix.length >= 2) {
    const pior = [...opts.mix].sort((a, b) => a.gap - b.gap)[0];
    if (pior && pior.gap < 0) {
      const short = pior.id === 'port' ? 'Port' : pior.id === 'mig' ? 'Mig' : pior.label;
      parts.push(`${short} puxa o buraco`);
    }
  }
  if (opts.ofensores > 0) {
    parts.push(`${opts.ofensores} ofensor${opts.ofensores === 1 ? '' : 'es'} na cadeira`);
  }
  return parts.join(' · ');
}

/** Top N por % meta; banco = piores em gap que não estão no pódio. */
export function podioBanco(sups: RrCulturaNome[], n = 3): { podio: RrCulturaNome[]; banco: RrCulturaNome[] } {
  const com = sups.filter((s) => s.metaDia > 0);
  const podio = [...com].sort((a, b) => b.pctMeta - a.pctMeta || b.vendas - a.vendas).slice(0, n);
  const noPodio = new Set(podio.map((s) => s.supervisor));
  const banco = [...com]
    .sort((a, b) => a.gap - b.gap || a.pctMeta - b.pctMeta)
    .filter((s) => !noPodio.has(s.supervisor))
    .slice(0, n);
  return { podio, banco };
}
