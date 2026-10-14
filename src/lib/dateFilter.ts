/**
 * Filtro de data compartilhado entre todas as páginas.
 * Calendário operacional = America/Sao_Paulo (não o fuso do browser).
 */
import { dataBrtIso, shiftIsoDay } from './brt';

export function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const today = dataBrtIso();
  return { dateFrom: today, dateTo: today };
}

export function getYesterdayRange(): { dateFrom: string; dateTo: string } {
  const iso = shiftIsoDay(dataBrtIso(), -1);
  return { dateFrom: iso, dateTo: iso };
}

/**
 * Default para páginas de tendência (Evolução, Insights): últimos 7 dias.
 */
export function getWeekRange(): { dateFrom: string; dateTo: string } {
  const yesterday = shiftIsoDay(dataBrtIso(), -1);
  return {
    dateFrom: shiftIsoDay(yesterday, -6),
    dateTo: yesterday,
  };
}

export type Periodo = { dateFrom: string; dateTo: string };

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Os dois campos preenchidos com dia real e início ≤ fim. */
export function periodoCompleto(p: Partial<Periodo> | null | undefined): p is Periodo {
  const ok = (iso?: string) => !!iso && DIA_ISO.test(iso) && Number.isFinite(Date.parse(`${iso}T00:00:00Z`));
  return !!p && ok(p.dateFrom) && ok(p.dateTo) && p.dateFrom! <= p.dateTo!;
}

/** URL (deep link) > período escolhido em outra aba > padrão da aba. */
export function periodoInicial(
  padrao: Periodo,
  compartilhado: Periodo | null | undefined,
  url?: Partial<Periodo>,
): Periodo {
  const base = periodoCompleto(compartilhado) ? compartilhado : padrao;
  return { dateFrom: url?.dateFrom || base.dateFrom, dateTo: url?.dateTo || base.dateTo };
}

/** Mês corrente (1º dia → hoje BRT) — default da aba SMS Prévio. */
export function getMonthRange(): { dateFrom: string; dateTo: string } {
  const today = dataBrtIso();
  return {
    dateFrom: `${today.slice(0, 7)}-01`,
    dateTo: today,
  };
}
