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

/** Mês corrente (1º dia → hoje BRT) — default da aba SMS Prévio. */
export function getMonthRange(): { dateFrom: string; dateTo: string } {
  const today = dataBrtIso();
  return {
    dateFrom: `${today.slice(0, 7)}-01`,
    dateTo: today,
  };
}
