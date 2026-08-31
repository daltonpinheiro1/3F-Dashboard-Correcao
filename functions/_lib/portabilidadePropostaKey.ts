/**
 * Chave canônica por proposta — uma proposta iSize = um lugar no funil/histórico.
 */

export type CeLike = {
  proposta_isize?: string | null;
  ticket_status?: string | null;
  ultimo_retorno_em?: string | null;
  enviada_em?: string | null;
};

export function normTicket(t: string | null | undefined): string {
  return (t || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/** Normaliza para 3F-XXXXXXXX (mesma regra em funil, enqueue e histórico). */
export function normPropostaKey(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const digits = s.replace(/^3F-/i, '');
  if (/^\d+$/.test(digits)) return `3F-${digits}`;
  return s.startsWith('3F-') ? s : `3F-${s}`;
}

/** Prioridade do ticket terminal — alinhado ao merge do funil. */
export function ticketPriority(ticket: string | null | undefined): number {
  const t = normTicket(ticket);
  if (t === 'portado') return 100;
  if (t === 'falha parcial') return 90;
  if (t === 'portabilidade cancelada') return 80;
  return 0;
}

/** Escolhe a linha CE canônica quando há duplicatas da mesma proposta. */
export function mergeCeRow<T extends CeLike>(prev: T | undefined, raw: T): T {
  if (!prev) return raw;
  const pNew = ticketPriority(raw.ticket_status);
  const pOld = ticketPriority(prev.ticket_status);
  if (pNew > pOld) return raw;
  if (pNew < pOld) return prev;
  const tsNew = raw.ultimo_retorno_em || raw.enviada_em || '';
  const tsOld = prev.ultimo_retorno_em || prev.enviada_em || '';
  return tsNew >= tsOld ? raw : prev;
}
