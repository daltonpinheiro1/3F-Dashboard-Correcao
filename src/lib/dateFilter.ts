/**
 * Filtro de data compartilhado entre todas as páginas.
 * Garante consistência: todas as abas usam o MESMO período.
 */
export function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const today = new Date().toISOString().slice(0, 10);
  return { dateFrom: today, dateTo: today };
}
