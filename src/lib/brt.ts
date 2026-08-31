/**
 * Calendário e relógio operacional 3F — sempre America/Sao_Paulo.
 * Não usar getHours()/getFullYear() do browser: nowcast no fuso errado distorce meta/hora.
 * Brasil sem DST desde 2019 → 00:00 BRT = 03:00 UTC.
 */
export const BRT_TZ = 'America/Sao_Paulo';

export type BrtParts = {
  y: number;
  m: number;
  day: number;
  h: number;
  min: number;
};

function partNum(parts: Intl.DateTimeFormatPart[], type: string): number {
  return Number(parts.find((p) => p.type === type)?.value || 0);
}

export function brtParts(d: Date = new Date()): BrtParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BRT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  let h = partNum(parts, 'hour');
  if (h === 24) h = 0;
  return {
    y: partNum(parts, 'year'),
    m: partNum(parts, 'month'),
    day: partNum(parts, 'day'),
    h,
    min: partNum(parts, 'minute'),
  };
}

/** YYYY-MM-DD no calendário BRT. */
export function dataBrtIso(d: Date = new Date()): string {
  const p = brtParts(d);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Hora 00–23 no relógio BRT (string 2 dígitos). */
export function horaBrt(d: Date = new Date()): string {
  return String(brtParts(d).h).padStart(2, '0');
}

/** YYYY-MM no calendário BRT. */
export function mesBrt(d: Date = new Date()): string {
  return dataBrtIso(d).slice(0, 7);
}

/** 00:00 BRT do dia calendário como ISO UTC (03:00Z). */
export function startOfBrtDayIso(d: Date = new Date()): string {
  const p = brtParts(d);
  return new Date(Date.UTC(p.y, p.m - 1, p.day, 3, 0, 0)).toISOString();
}

/** Soma/subtrai dias num YYYY-MM-DD (calendário, sem fuso). */
export function shiftIsoDay(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Dias YYYY-MM-DD de 1 até `ate` (inclusive) no mês de `ate`. */
export function diasDoMesAte(ateIso: string): string[] {
  const [y, m, last] = ateIso.slice(0, 10).split('-').map(Number);
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

export function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const name = 'name' in e ? String((e as { name?: string }).name) : '';
  const msg = 'message' in e ? String((e as { message?: string }).message) : '';
  return name === 'AbortError' || /abort/i.test(msg);
}

/** Data operacional EVA: payload.data, senão updated_at em BRT, senão hoje BRT. */
export function dataRefEva(payload: { data?: string; updated_at?: string } | null | undefined): string {
  if (payload?.data) return String(payload.data).slice(0, 10);
  const u = payload?.updated_at;
  if (u) {
    const raw = String(u);
    const t = Date.parse(raw.length === 19 && !raw.includes('Z') ? `${raw}-03:00` : raw);
    if (Number.isFinite(t)) return dataBrtIso(new Date(t));
    const sliced = raw.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(sliced)) return sliced;
  }
  return dataBrtIso();
}
