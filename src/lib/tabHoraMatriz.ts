/** Matriz Tabulação × Hora (Discagens): valor visível = chave de ordenação. */

export type TabHoraMode = 'pct' | 'vol' | 'drop' | 'tma';

export const TAB_HORA_TOP = 40;

export function tabHoraSortCol(hora: string) {
  return `_h_${hora}`;
}

/** Mesma regra de % da página Discagens (`rateFine`). */
export function rateTabHora(n: number, d: number) {
  if (!d) return 0;
  const pct = (100 * n) / d;
  return Math.round(pct * (pct > 0 && pct < 1 ? 100 : 10)) / (pct > 0 && pct < 1 ? 100 : 10);
}

export type TabHoraCelula = {
  horas?: Record<string, number>;
  pct_hora?: Record<string, number>;
  tma_horas?: Record<string, number>;
  horas_drop?: Record<string, number>;
};

/** Número da célula na métrica ativa — o que a tela mostra é o que a coluna ordena. */
export function valorCelulaTabHora(r: TabHoraCelula, hora: string, mode: TabHoraMode): number {
  const vol = r.horas?.[hora] || 0;
  if (mode === 'pct') return r.pct_hora?.[hora] || 0;
  if (mode === 'vol') return vol;
  if (mode === 'drop') {
    const dropN = r.horas_drop?.[hora] || 0;
    return vol > 0 ? rateTabHora(dropN, vol) : 0;
  }
  return r.tma_horas?.[hora] || 0;
}

export function comSortPorHora<T extends TabHoraCelula>(
  rows: T[],
  horas: string[],
  mode: TabHoraMode,
): T[] {
  return rows.map((r) => {
    const extra: Record<string, number> = {};
    for (const h of horas) extra[tabHoraSortCol(h)] = valorCelulaTabHora(r, h, mode);
    return { ...r, ...extra };
  });
}
