/**
 * Matrix de ação sugerida por fatia / estado da proposta.
 */
export type AcaoFilaSugerida = 'consult' | 'cancel' | 'open' | 'activate' | 'reschedule';

export type ItemAcaoInput = {
  proposta: string;
  fatia?: string;
  order_number?: string | null;
  order_status?: string | null;
  ticket_status?: string | null;
  tem_iccid?: boolean;
  esim?: boolean;
  plano?: string | null;
  fila?: string | null;
};

const TERMINAIS = new Set(['sucesso_portado', 'terminal_falha_parcial', 'terminal_cancelada']);

const POR_FATIA: Record<string, AcaoFilaSugerida> = {
  pre_os: 'consult',
  aguardando_ticket: 'consult',
  fila_consult: 'consult',
  fila_open: 'open',
  fila_activate: 'activate',
  fila_reschedule: 'reschedule',
  fila_cancel: 'cancel',
  entregue_com_chip: 'activate',
  entregue_aguardando_chip: 'consult',
  em_transito: 'consult',
  bko: 'consult',
  quebra_logistica: 'consult',
  ticket_conflito: 'consult',
  ticket_pendente: 'consult',
  ticket_suspensa: 'consult',
  ticket_cancelamento_pendente: 'consult',
  order_erro_aprov: 'consult',
  order_em_aprov: 'consult',
  orfao: 'consult',
};

function normTicket(v?: string | null): string {
  return (v || '').trim().toLowerCase();
}

/** Sugere ação TIM para uma proposta da fatia. null = terminal / sem ação. */
export function sugerirAcaoFatia(
  item: ItemAcaoInput,
  fatiaId?: string,
): AcaoFilaSugerida | null {
  const id = (item.fatia || fatiaId || '').trim();
  if (!id || TERMINAIS.has(id)) return null;

  const os = String(item.order_number || '').trim();
  const ticket = normTicket(item.ticket_status);
  const order = (item.order_status || '').toLowerCase();
  const erroAprov = order.includes('erro') && order.includes('aprov');
  const emAprov = /\bem aprov/.test(order) && !erroAprov;

  // Entregue físico: próximo passo é consultar ICCID na Toutbox.
  if (id === 'entregue_aguardando_chip') return 'consult';

  // Em Aprov = consult. Erro Aprov + ICCID = activate.
  if (emAprov) return 'consult';
  if (erroAprov) return item.tem_iccid ? 'activate' : 'consult';

  // OS sem ticket = consult (não open).
  if (os.startsWith('1-') && !ticket) return 'consult';

  if (item.tem_iccid && id !== 'fila_cancel' && id !== 'fila_reschedule') {
    return 'activate';
  }

  // eSIM não espera Toutbox — matrix consult/reschedule/cancel/open/activate.
  if (item.esim) {
    if (!os || os === '0-00' || !os.startsWith('1-')) return 'consult';
    if (ticket.includes('conflito')) return 'reschedule';
    if (ticket.includes('suspens')) return 'cancel';
    if (order.includes('cancelad')) return 'open';
    return 'consult';
  }

  if (!os || os === '0-00' || !os.startsWith('1-')) return 'consult';

  if (ticket.includes('conflito')) return 'consult';
  if (ticket.includes('cancelamento pendente')) return 'consult';

  return POR_FATIA[id] || 'consult';
}

export type LoteInteligenteItem = { proposta: string; acao: AcaoFilaSugerida };

/** Espelha server: cancel/open/activate só admin. */
export const ACOES_DESTRUTIVAS_FILA = new Set<AcaoFilaSugerida>(['cancel', 'open', 'activate']);

export const ACOES_SUPERVISOR_FILA: AcaoFilaSugerida[] = ['consult', 'reschedule'];

export function acaoPermitidaParaRole(acao: AcaoFilaSugerida, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return !ACOES_DESTRUTIVAS_FILA.has(acao);
}

/** Monta lote enfileirável (máx max) com ação por proposta. */
export function montarLoteInteligente(
  items: ItemAcaoInput[],
  fatiaId?: string,
  max = 25,
  opts?: { allowDestructive?: boolean },
): LoteInteligenteItem[] {
  const allowDestructive = opts?.allowDestructive === true;
  const out: LoteInteligenteItem[] = [];
  for (const it of items) {
    let acao = sugerirAcaoFatia(it, fatiaId);
    if (!acao || !it.proposta?.trim()) continue;
    if (!acaoPermitidaParaRole(acao, allowDestructive)) {
      // Degrada para consult — supervisor ainda pode reprocessar leitura TIM
      acao = 'consult';
    }
    out.push({ proposta: it.proposta.trim(), acao });
    if (out.length >= max) break;
  }
  return out;
}

export function resumoLote(lote: LoteInteligenteItem[]): Record<AcaoFilaSugerida, number> {
  const r: Record<string, number> = {};
  for (const x of lote) {
    r[x.acao] = (r[x.acao] || 0) + 1;
  }
  return r as Record<AcaoFilaSugerida, number>;
}

export function formatarResumoLote(lote: LoteInteligenteItem[]): string {
  const r = resumoLote(lote);
  return Object.entries(r)
    .map(([a, n]) => `${n} ${a}`)
    .join(' · ');
}
