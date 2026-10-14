/**
 * Agregação RR 360 no Pages Function (service role).
 * Espelho das regras de smsRules / erroClassification / rr360 — não importar src/.
 */
import { consolidarPorProposta } from '../../shared/correcaoPropostas';

function ehVendedorRobo(nome: string | null | undefined): boolean {
  return /^roboadm\d*$/i.test(String(nome || '').trim());
}

const TICKETS_SUCESSO = new Set([
  'portado',
  'falha parcial',
  'antigo',
  'ativado',
  'activated',
  'ativo',
  'ativa',
]);

const TIPOS_NAO_ERRO = new Set(['referencia_tratamento', 'logradouro_acentuacao']);

function foldSmsText(s: string | null | undefined): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isTicketSucesso(ticket: string | null | undefined): boolean {
  const t = foldSmsText(ticket);
  if (!t) return false;
  if (TICKETS_SUCESSO.has(t)) return true;
  if (/(nao\s+portad|cancelad|suspens|pendente|conflito|negado)/.test(t)) return false;
  if (t.includes('falha parcial')) return true;
  if (t.includes('portado')) return true;
  return /\b(antigo|ativado|activated|ativo|ativa)\b/.test(t);
}

function ticketBloqueiaPortado(ticket: string | null | undefined): boolean {
  const t = foldSmsText(ticket);
  if (!t) return false;
  return /(nao\s+portad|cancelad|suspens|pendente|conflito|negado)/.test(t);
}

function isOrderConcluido(order: string | null | undefined): boolean {
  const o = foldSmsText(order);
  return o === 'concluido' || o === 'completed';
}

export function isPortadoComBilhete(row: { ticket_status?: string | null }): boolean {
  if (ticketBloqueiaPortado(row.ticket_status)) return false;
  return isTicketSucesso(row.ticket_status);
}

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

export function temErroOperacional(tipos: string[] | null | undefined): boolean {
  return (tipos || []).some((t) => t && !TIPOS_NAO_ERRO.has(t));
}

export function dedupePorProposta<T extends { proposta_id?: string | null }>(
  rows: T[],
  pick: (prev: T, next: T) => T,
): T[] {
  const named = new Map<string, T>();
  const unnamed: T[] = [];
  for (const row of rows) {
    const pid = String(row.proposta_id || '').trim();
    if (!pid) {
      unnamed.push(row);
      continue;
    }
    const prev = named.get(pid);
    named.set(pid, prev ? pick(prev, row) : row);
  }
  return [...named.values(), ...unnamed];
}

type SmsLinha = {
  classificacao?: string | null;
  ticket_status?: string | null;
  order_status?: string | null;
  retorno_atualizado_em?: string | null;
};

/** Espelho de pickSmsMaisRecente (smsRules): retorno mais recente; empate → portado consolidado. */
export function pickSmsMaisRecente<T extends SmsLinha>(a: T, b: T): T {
  const aRet = String(a.retorno_atualizado_em || '');
  const bRet = String(b.retorno_atualizado_em || '');
  if (bRet && !aRet) return b;
  if (aRet && !bRet) return a;
  if (bRet !== aRet) return bRet >= aRet ? b : a;
  if (isPortadoConsolidado(b) && !isPortadoConsolidado(a)) return b;
  if (isPortadoConsolidado(a) && !isPortadoConsolidado(b)) return a;
  return b;
}

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export function agregarSmsDia(rows: Array<SmsLinha & { proposta_id?: string | null }>) {
  const uniq = dedupePorProposta(rows, pickSmsMaisRecente);
  const vendasBrutas = uniq.length;
  const portadosConsolidado = uniq.filter(isPortadoConsolidado).length;
  return {
    vendasBrutas,
    portadosConsolidado,
    pctPortadosGross: pct(portadosConsolidado, vendasBrutas),
  };
}

type PassagemErro = {
  proposta_id?: string | null;
  vendedor?: string | null;
  tipos_erro?: string[] | null;
};

/** Mesma semântica de aggregateCorrecao (Erros/Visão geral): 1 proposta, sem robô. Linhas em ordem cronológica. */
function propostasErroHumanas<T extends PassagemErro>(rows: T[]): T[] {
  return consolidarPorProposta(rows).filter((r) => !ehVendedorRobo(r.vendedor));
}

export function agregarErroDia(rows: PassagemErro[]) {
  const humanas = propostasErroHumanas(rows);
  const propostas = humanas.length;
  const comErro = humanas.filter((r) => temErroOperacional(r.tipos_erro)).length;
  return { propostas, comErro, taxaErroPct: pct(comErro, propostas) };
}

export type RrListaItem = {
  proposta_id: string;
  classificacao: string | null;
  ticket_status: string | null;
  vendedor: string | null;
  tipos_erro?: string[] | null;
};

const LISTA_CAP = 80;

export function listaGrossDia(
  rows: Array<SmsLinha & { proposta_id?: string | null; vendedor?: string | null }>,
  cap = LISTA_CAP,
): RrListaItem[] {
  const uniq = dedupePorProposta(rows, pickSmsMaisRecente);
  return uniq.filter((r) => !ehVendedorRobo(r.vendedor)).slice(0, cap).map((r) => ({
    proposta_id: String(r.proposta_id || '—'),
    classificacao: r.classificacao ?? null,
    ticket_status: r.ticket_status ?? null,
    vendedor: r.vendedor ?? null,
  }));
}

export function listaErroDia(
  rows: Array<{
    proposta_id?: string | null;
    vendedor?: string | null;
    tipos_erro?: string[] | null;
  }>,
  cap = LISTA_CAP,
): RrListaItem[] {
  return propostasErroHumanas(rows)
    .filter((r) => temErroOperacional(r.tipos_erro))
    .slice(0, cap)
    .map((r) => ({
      proposta_id: String(r.proposta_id || '—'),
      classificacao: null,
      ticket_status: null,
      vendedor: r.vendedor ?? null,
      tipos_erro: r.tipos_erro ?? null,
    }));
}

/** Início do dia BRT menos (dias-1) — janela operacional, não UTC rolante. */
export function sinceBrtDaysIso(dias: number, agora = new Date()): string {
  const n = Math.min(90, Math.max(1, Math.floor(dias) || 1));
  const start = new Date(startOfBrtDayIso(agora)).getTime();
  return new Date(start - (n - 1) * 86_400_000).toISOString();
}

export function dataBrtIsoFn(d = new Date()): string {
  return startOfBrtDayIso(d).slice(0, 10);
}

/** Cubo SMS grava data_venda como meia-noite UTC. Não usar offset BRT. */
export function smsDataVendaIso(dataRef: string): { gte: string; lte: string } {
  const d = (dataRef || '').slice(0, 10);
  return {
    gte: `${d}T00:00:00.000Z`,
    lte: `${d}T23:59:59.999Z`,
  };
}

export function startOfBrtDayIso(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const num = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return new Date(Date.UTC(num('year'), num('month') - 1, num('day'), 3, 0, 0)).toISOString();
}
