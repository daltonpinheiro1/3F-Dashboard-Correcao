/**
 * Regras únicas de SMS Prévio / portabilidade consolidada.
 * Usar em SmsPage, Insights, Operadores, Supervisores, Evolução.
 */
import { startOfBrtDayIso } from './brt';

/** Tickets = sucesso consolidado (mesma regra do sync). */
export const TICKETS_SUCESSO = new Set([
  'portado',
  'falha parcial',
  'antigo',
  'ativado',
  'activated',
  'ativo',
  'ativa',
]);

function foldSmsText(s: string | null | undefined): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isTicketSucesso(ticket: string | null | undefined): boolean {
  const t = foldSmsText(ticket);
  if (!t) return false;
  if (TICKETS_SUCESSO.has(t)) return true;
  if (/(nao\s+portad|cancelad|suspens|pendente|conflito|negado)/.test(t)) return false;
  if (t.includes('falha parcial')) return true;
  if (t.includes('portado')) return true;
  return /\b(antigo|ativado|activated|ativo|ativa)\b/.test(t);
}

/** Ticket que impede promover OS "Concluído" a portado. */
export function ticketBloqueiaPortado(ticket: string | null | undefined): boolean {
  const t = foldSmsText(ticket);
  if (!t) return false;
  return /(nao\s+portad|cancelad|suspens|pendente|conflito|negado)/.test(t);
}

/** TIM passou a devolver orderStatus=Concluído sem ticketStatus (~18/08/2026). */
export function isOrderConcluido(order: string | null | undefined): boolean {
  const o = foldSmsText(order);
  return o === 'concluido' || o === 'completed';
}

/** Prefere retorno mais recente; só usa portado como desempate. */
export function pickSmsMaisRecente<T extends {
  classificacao?: string | null;
  ticket_status?: string | null;
  retorno_atualizado_em?: string | null;
}>(a: T, b: T): T {
  const aRet = String(a.retorno_atualizado_em || '');
  const bRet = String(b.retorno_atualizado_em || '');
  if (bRet && !aRet) return b;
  if (aRet && !bRet) return a;
  if (bRet !== aRet) return bRet >= aRet ? b : a;
  if (isPortadoConsolidado(b) && !isPortadoConsolidado(a)) return b;
  if (isPortadoConsolidado(a) && !isPortadoConsolidado(b)) return a;
  return b;
}

/** Uma linha por proposta — prefere portado consolidado e retorno mais recente. */
export function dedupeSmsPorProposta<T extends {
  proposta_id?: string | null;
  classificacao?: string | null;
  ticket_status?: string | null;
  retorno_atualizado_em?: string | null;
}>(rows: T[]): T[] {
  const named = new Map<string, T>();
  const unnamed: T[] = [];
  for (const row of rows) {
    const pid = String(row.proposta_id || '').trim();
    if (!pid) {
      unnamed.push(row);
      continue;
    }
    const prev = named.get(pid);
    if (!prev) {
      named.set(pid, row);
      continue;
    }
    named.set(pid, pickSmsMaisRecente(prev, row));
  }
  return [...named.values(), ...unnamed];
}

/** Intervalo BRT para colunas timestamptz (ex.: retorno_atualizado_em). Não usar em data_venda YYYY-MM-DD. */
export function brtRangeIso(dateFrom: string, dateTo: string): { gte: string; lte: string } {
  return {
    gte: `${dateFrom}T00:00:00.000-03:00`,
    lte: `${dateTo}T23:59:59.999-03:00`,
  };
}

/** Sucesso consolidado = ticket de sucesso, ou OS Concluído sem bilhete. */
export function isPortadoConsolidado(row: {
  classificacao?: string | null;
  ticket_status?: string | null;
  order_status?: string | null;
}): boolean {
  if (ticketBloqueiaPortado(row.ticket_status)) return false;
  if (isTicketSucesso(row.ticket_status)) return true;
  const ticket = foldSmsText(row.ticket_status);
  if (ticket) return false;
  if ((row.classificacao || '').trim().toLowerCase() === 'sucesso') return true;
  return isOrderConcluido(row.order_status);
}

export function isAguardando(classificacao: string | null | undefined): boolean {
  const c = (classificacao || '').trim().toLowerCase();
  return c === 'aguardando' || c === 'sem_retorno';
}

/** Só true/false — null não entra no comparativo COM/SEM. */
export function hasSmsInfo(sms: boolean | null | undefined): boolean {
  return sms === true || sms === false;
}

export function isComSms(sms: boolean | null | undefined): boolean {
  return sms === true;
}

export function isSemSms(sms: boolean | null | undefined): boolean {
  return sms === false;
}

/** Início do dia em BRT (America/Sao_Paulo) como ISO UTC. */
export function startOfTodayBrtIso(): string {
  return startOfBrtDayIso();
}

/** YYYY-MM-DD local (calendário do browser). */
export function toLocalIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDiaBr(isoDay: string): string {
  if (!isoDay || isoDay.length < 10) return isoDay;
  const [, m, d] = isoDay.slice(0, 10).split('-');
  return `${d}/${m}`;
}
