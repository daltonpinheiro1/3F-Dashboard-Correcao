import { BRT_TZ, dataBrtIso, shiftIsoDay } from '../../lib/brt';

export function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR', { timeZone: BRT_TZ });
}

export function fmtDateTime(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { timeZone: BRT_TZ });
}

export function periodoSuspensaoBrt(aprovadoEm: string, dias: number): string | null {
  const parsed = new Date(aprovadoEm);
  if (Number.isNaN(parsed.getTime()) || dias <= 0) return null;
  const inicio = dataBrtIso(parsed);
  const fim = shiftIsoDay(inicio, Math.max(0, dias - 1));
  return dias === 1 ? fmtDate(inicio) : `${fmtDate(inicio)} a ${fmtDate(fim)}`;
}
