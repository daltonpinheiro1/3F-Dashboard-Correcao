import { shiftIsoDay } from './brt';

export type RrHorizonte = 'realtime' | 'semanal' | 'quinzenal' | 'mensal' | 'semestral';

export const RR_HORIZONTE_OPTIONS: Array<{ id: RrHorizonte; label: string; hint: string }> = [
  { id: 'realtime', label: 'Realtime', hint: 'Dia ao vivo · ritmo e nowcast' },
  { id: 'semanal', label: 'Semanal', hint: 'Últimos 7 dias' },
  { id: 'quinzenal', label: 'Quinzenal', hint: 'Últimos 15 dias' },
  { id: 'mensal', label: 'Mensal', hint: 'Últimos 30 dias' },
  { id: 'semestral', label: 'Semestral', hint: 'Até 90 dias recentes do semestre' },
];

/** Teto de snapshots diários (semestral não baixa 180 arquivos). */
export const RR_HORIZONTE_MAX_DIAS: Record<RrHorizonte, number> = {
  realtime: 1,
  semanal: 7,
  quinzenal: 15,
  mensal: 31,
  semestral: 90,
};

/** Dias a recuar a partir de dataRef (inclusive = span+1). */
const RR_HORIZONTE_SPAN: Record<RrHorizonte, number> = {
  realtime: 0,
  semanal: 6,
  quinzenal: 14,
  mensal: 29,
  semestral: 179,
};

export function isRrHorizonte(s: string): s is RrHorizonte {
  return RR_HORIZONTE_OPTIONS.some((o) => o.id === s);
}

export function janelaRrHorizonte(
  dataRef: string,
  horizonte: RrHorizonte,
): { from: string; to: string; pedidoDias: number; maxDias: number } {
  const to = dataRef.slice(0, 10);
  const max = RR_HORIZONTE_MAX_DIAS[horizonte];
  if (horizonte === 'realtime') {
    return { from: to, to, pedidoDias: 1, maxDias: 1 };
  }
  const span = RR_HORIZONTE_SPAN[horizonte];
  const from = shiftIsoDay(to, -span);
  return { from, to, pedidoDias: span + 1, maxDias: max };
}

export function labelRrHorizonte(h: RrHorizonte): string {
  return RR_HORIZONTE_OPTIONS.find((o) => o.id === h)?.label || h;
}
