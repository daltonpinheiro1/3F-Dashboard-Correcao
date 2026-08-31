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

export function isTicketSucesso(ticket: string | null | undefined): boolean {
  return TICKETS_SUCESSO.has((ticket || '').trim().toLowerCase());
}

/** Sucesso consolidado = classificação sucesso OU ticket de sucesso. */
export function isPortadoConsolidado(row: {
  classificacao?: string | null;
  ticket_status?: string | null;
}): boolean {
  if ((row.classificacao || '').trim().toLowerCase() === 'sucesso') return true;
  return isTicketSucesso(row.ticket_status);
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
