import { shiftIsoDay } from './brt';

export type RrHorizonte = 'realtime' | 'semanal' | 'quinzenal' | 'mensal' | 'semestral';

export const RR_HORIZONTE_OPTIONS: Array<{ id: RrHorizonte; label: string; hint: string }> = [
  { id: 'realtime', label: 'Realtime', hint: 'Dia ao vivo · ritmo e nowcast' },
  { id: 'semanal', label: 'Semanal', hint: 'Últimos 7 dias' },
  { id: 'quinzenal', label: 'Quinzenal', hint: 'Últimos 15 dias' },
  { id: 'mensal', label: 'Mensal', hint: 'Mês calendário · escolha o mês' },
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

/** Dias a recuar a partir de dataRef (inclusive = span+1). Mensal usa calendário. */
const RR_HORIZONTE_SPAN: Record<Exclude<RrHorizonte, 'mensal'>, number> = {
  realtime: 0,
  semanal: 6,
  quinzenal: 14,
  semestral: 179,
};

export function isRrHorizonte(s: string): s is RrHorizonte {
  return RR_HORIZONTE_OPTIONS.some((o) => o.id === s);
}

const LS_RR_HORIZONTE = '3f-rr-horizonte';

export type RrHorizontePref = { horizonte: RrHorizonte; mes?: string };

export function parseRrHorizontePref(raw: string | null | undefined): RrHorizontePref | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { horizonte?: string; mes?: string };
    if (!isRrHorizonte(j.horizonte || '')) return null;
    const mes = isMesYm(j.mes || '') ? String(j.mes).slice(0, 7) : undefined;
    return { horizonte: j.horizonte as RrHorizonte, mes };
  } catch {
    return null;
  }
}

export function readRrHorizontePref(): RrHorizontePref | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return parseRrHorizontePref(localStorage.getItem(LS_RR_HORIZONTE));
  } catch {
    return null;
  }
}

export function writeRrHorizontePref(horizonte: RrHorizonte, mes?: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const payload: RrHorizontePref = { horizonte };
    if (horizonte === 'mensal' && isMesYm(mes || '')) payload.mes = String(mes).slice(0, 7);
    localStorage.setItem(LS_RR_HORIZONTE, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function isMesYm(s: string): boolean {
  return /^\d{4}-\d{2}$/.test((s || '').slice(0, 7));
}

export function lastIsoDayOfMonth(ym: string): string {
  const raw = (ym || '').slice(0, 7);
  if (!isMesYm(raw)) return '';
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function clampMesYm(ym: string, tetoYm: string): string {
  const teto = isMesYm(tetoYm) ? tetoYm.slice(0, 7) : '';
  if (!isMesYm(ym)) return teto;
  const m = ym.slice(0, 7);
  if (teto && m > teto) return teto;
  return m;
}

export function labelMesYm(ym: string): string {
  const raw = (ym || '').slice(0, 7);
  if (!isMesYm(raw)) return ym;
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const i = Number(raw.slice(5, 7)) - 1;
  return `${meses[i] || raw.slice(5)}/${raw.slice(0, 4)}`;
}

export function mesesRrRecentes(tetoYm: string, n = 6): string[] {
  const teto = isMesYm(tetoYm) ? tetoYm.slice(0, 7) : '';
  if (!teto) return [];
  let y = Number(teto.slice(0, 4));
  let m = Number(teto.slice(5, 7));
  const out: string[] = [];
  const count = Math.min(12, Math.max(1, Math.floor(n) || 6));
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

function diasInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.round((b - a) / 86_400_000) + 1;
}

function janelaMesCalendario(
  dataRef: string,
  mesYm?: string,
): { from: string; to: string; pedidoDias: number; maxDias: number } {
  const tetoYm = dataRef.slice(0, 7);
  const ym = clampMesYm(mesYm || tetoYm, tetoYm);
  const from = `${ym}-01`;
  const fimMes = lastIsoDayOfMonth(ym);
  const to = ym === tetoYm && dataRef.slice(0, 10) < fimMes ? dataRef.slice(0, 10) : fimMes;
  return {
    from,
    to,
    pedidoDias: diasInclusive(from, to),
    maxDias: RR_HORIZONTE_MAX_DIAS.mensal,
  };
}

export function janelaRrHorizonte(
  dataRef: string,
  horizonte: RrHorizonte,
  mesYm?: string,
): { from: string; to: string; pedidoDias: number; maxDias: number } {
  const to = dataRef.slice(0, 10);
  const max = RR_HORIZONTE_MAX_DIAS[horizonte];
  if (horizonte === 'realtime') {
    return { from: to, to, pedidoDias: 1, maxDias: 1 };
  }
  if (horizonte === 'mensal') {
    return janelaMesCalendario(dataRef, mesYm);
  }
  const span = RR_HORIZONTE_SPAN[horizonte];
  const from = shiftIsoDay(to, -span);
  return { from, to, pedidoDias: span + 1, maxDias: max };
}

export function labelRrHorizonte(h: RrHorizonte): string {
  return RR_HORIZONTE_OPTIONS.find((o) => o.id === h)?.label || h;
}
