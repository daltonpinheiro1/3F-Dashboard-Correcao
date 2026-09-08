export type RrVista = 'tudo' | 'resultado' | 'drivers' | 'capacidade' | 'qualidade' | 'pauta';

export const RR_VISTA_OPTIONS: Array<{ id: RrVista; label: string; hint: string }> = [
  { id: 'tudo', label: 'Tudo', hint: 'Pauta completa' },
  { id: 'resultado', label: 'Resultado', hint: 'EVA, meta, comparativo' },
  { id: 'drivers', label: 'Drivers', hint: 'Ponte do gap e oportunidades' },
  { id: 'capacidade', label: 'Capacidade', hint: 'Logados e produtividade' },
  { id: 'qualidade', label: 'Qualidade', hint: '360°, ofensores, erro' },
  { id: 'pauta', label: 'Pauta', hint: 'Briefing IA e ações' },
];

export function isRrVista(s: string): s is RrVista {
  return RR_VISTA_OPTIONS.some((o) => o.id === s);
}

export function mostraRrBloco(vista: RrVista, bloco: Exclude<RrVista, 'tudo'>): boolean {
  return vista === 'tudo' || vista === bloco;
}

export function tilesMensais(
  pontos: Array<{ dia: string; vendas: number }>,
): Array<{ mes: string; vendas: number; dias: number }> {
  const acc = new Map<string, { vendas: number; dias: number }>();
  for (const p of pontos) {
    const mes = p.dia.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) continue;
    const cur = acc.get(mes) || { vendas: 0, dias: 0 };
    cur.vendas += p.vendas;
    cur.dias += 1;
    acc.set(mes, cur);
  }
  return [...acc.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, v]) => ({ mes, vendas: v.vendas, dias: v.dias }));
}

export function produtividadeRr(opts: {
  vendas: number;
  logados: number;
  horasTrabalhadas: number;
}): { porLogin: number; porHoraLogin: number } {
  const log = Math.max(0, opts.logados);
  const h = Math.max(0, opts.horasTrabalhadas);
  return {
    porLogin: log ? Math.round((opts.vendas / log) * 10) / 10 : 0,
    porHoraLogin: log && h ? Math.round((opts.vendas / (log * h)) * 10) / 10 : 0,
  };
}

export type RrSlideId = 'casa' | 'podio' | 'situacao' | 'ponte' | 'sups' | 'qualidade' | 'forecast' | 'pauta';

export type RrSlide = { id: RrSlideId; label: string };

/** Pauta da TV: huddle no live (com nowcast); comitê no período (sem forecast). */
export function slidesRrApresentacao(opts: { isLive: boolean; temMix: boolean }): RrSlide[] {
  const out: RrSlide[] = [
    { id: 'casa', label: 'Casa' },
    { id: 'podio', label: 'Pódio' },
  ];
  out.push({ id: 'situacao', label: 'Situação' });
  if (opts.temMix) out.push({ id: 'ponte', label: 'Ponte' });
  out.push({ id: 'sups', label: 'Supervisores' }, { id: 'qualidade', label: 'Qualidade' });
  if (opts.isLive) out.push({ id: 'forecast', label: 'Nowcast' });
  out.push({ id: 'pauta', label: 'Pauta' });
  return out;
}
