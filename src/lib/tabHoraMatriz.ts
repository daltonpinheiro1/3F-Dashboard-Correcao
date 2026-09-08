/** Matriz Tabulação × Hora (Discagens): valor visível = chave de ordenação. */

import { isTabEventoQueda } from './evaDash';

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
  nome?: string;
  horas?: Record<string, number>;
  pct_hora?: Record<string, number>;
  tma_horas?: Record<string, number>;
  horas_drop?: Record<string, number>;
  drop_total?: number;
};

export type TabHoraSortOpts = {
  /** Sem bit Agente Desligou na matriz: ordena tabs de queda/desligou pelo volume (evento, não culpa). */
  dropFallbackEvento?: boolean;
};

/** Qtd Agente Desligou na célula — o que a tela mostra é o que a coluna ordena. */
export function valorCelulaTabHora(
  r: TabHoraCelula,
  hora: string,
  mode: TabHoraMode,
  opts?: TabHoraSortOpts,
): number {
  const vol = r.horas?.[hora] || 0;
  if (mode === 'pct') return r.pct_hora?.[hora] || 0;
  if (mode === 'vol') return vol;
  if (mode === 'drop') {
    const dropN = r.horas_drop?.[hora] || 0;
    if (dropN > 0) return dropN;
    if (opts?.dropFallbackEvento && isTabEventoQueda(r.nome)) return vol;
    return 0;
  }
  return r.tma_horas?.[hora] || 0;
}

/** Célula DROP agente: nunca pinta 0% (some o ruído). */
export function fmtDropCelula(dropN: number, vol: number): string {
  if (dropN > 0) {
    const pct = vol > 0 ? rateTabHora(dropN, vol) : 0;
    return `${dropN} · ${pct}%`;
  }
  if (vol > 0) return '—';
  return '';
}

/** Fallback visual: volume da tab de queda/desligou (evento operacional). */
export function fmtEventoDropCelula(vol: number, pctHora: number): string {
  if (vol <= 0) return '';
  return `${vol} · ${pctHora}%`;
}

export function rowTemDropAgente(r: TabHoraCelula): boolean {
  if ((r.drop_total || 0) > 0) return true;
  return Object.values(r.horas_drop || {}).some((n) => n > 0);
}

export function comSortPorHora<T extends TabHoraCelula>(
  rows: T[],
  horas: string[],
  mode: TabHoraMode,
  opts?: TabHoraSortOpts,
): T[] {
  return rows.map((r) => {
    const extra: Record<string, number> = {};
    for (const h of horas) extra[tabHoraSortCol(h)] = valorCelulaTabHora(r, h, mode, opts);
    return { ...r, ...extra };
  });
}
