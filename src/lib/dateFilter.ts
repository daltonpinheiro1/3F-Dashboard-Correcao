/**
 * Filtro de data compartilhado entre todas as páginas.
 * Garante consistência: todas as abas usam o MESMO período.
 */
function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const today = localIso(new Date());
  return { dateFrom: today, dateTo: today };
}

export function getYesterdayRange(): { dateFrom: string; dateTo: string } {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const iso = localIso(d);
  return { dateFrom: iso, dateTo: iso };
}

/**
 * Default para páginas de tendência (Evolução, Insights): últimos 7 dias.
 */
export function getWeekRange(): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  return {
    dateFrom: localIso(weekAgo),
    dateTo: localIso(today),
  };
}

/** Mês corrente (1º dia → hoje) — default da aba SMS Prévio. */
export function getMonthRange(): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    dateFrom: localIso(first),
    dateTo: localIso(today),
  };
}
