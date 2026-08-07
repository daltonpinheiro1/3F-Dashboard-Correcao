/**
 * Filtro de data compartilhado entre todas as páginas.
 * Garante consistência: todas as abas usam o MESMO período.
 */
export function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const today = new Date().toISOString().slice(0, 10);
  return { dateFrom: today, dateTo: today };
}

/**
 * Default para páginas de tendência (Evolução, Insights): últimos 7 dias.
 */
export function getWeekRange(): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  return {
    dateFrom: weekAgo.toISOString().slice(0, 10),
    dateTo: today.toISOString().slice(0, 10),
  };
}
