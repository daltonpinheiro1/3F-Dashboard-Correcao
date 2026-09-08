/** Deep links entre Chamadas, Discagens e Inteligência. */

export function inteligenciaCoachingHref(opts: {
  login?: string | null;
  nome?: string | null;
  sugestao?: string | null;
}): string {
  const q = new URLSearchParams();
  q.set('tab', 'coaching');
  if (opts.login) q.set('login', opts.login);
  if (opts.nome) q.set('nome', opts.nome);
  if (opts.sugestao) q.set('sugestao', opts.sugestao);
  return `/inteligencia?${q.toString()}`;
}

export function chamadasOfensorHref(nome: string, campanha_op?: string | null): string {
  const q = new URLSearchParams();
  q.set('ofensor', nome);
  if (campanha_op) q.set('campanha_op', campanha_op);
  return `/chamadas?${q.toString()}`;
}

export const INTEL_TABS = ['copiloto', 'radar', 'simulador', 'coaching', 'agente', 'conhecimento'] as const;
export type IntelTab = (typeof INTEL_TABS)[number];

export function parseIntelTab(raw: string | null): IntelTab | null {
  if (!raw) return null;
  return (INTEL_TABS as readonly string[]).includes(raw) ? (raw as IntelTab) : null;
}

export function outlierCoachingSugestao(o: {
  user_name?: string;
  queue_curta?: string;
  queue_name?: string;
  tabuladas?: number;
  conv_tab?: number;
}): string {
  const fila = o.queue_curta || o.queue_name || '—';
  const conv = o.conv_tab != null ? `${o.conv_tab}%` : '—';
  return `Outlier conversão · ${fila} · ${o.user_name || '—'} · tabs=${o.tabuladas ?? 0} · conv=${conv} vs pares.`;
}
