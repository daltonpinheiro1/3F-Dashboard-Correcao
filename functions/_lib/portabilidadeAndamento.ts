/**
 * Andamento Toutbox ≠ erro de ICCID.
 * ICCID só existe depois que o chip entrega.
 * Em rota = espera. Cancelada/expirada = quebra (fim).
 */
import { normTicket } from './portabilidadePropostaKey';

export type AgAndamento = {
  status?: string | null;
  toutbox_classificacao?: string | null;
  iccid?: string | null;
};

export type CeAndamento = {
  ticket_status?: string | null;
  order_status?: string | null;
  status?: string | null;
  order_number?: string | null;
  iccid?: string | null;
  tim_chip?: string | null;
  plano?: string | null;
  tipo_chip?: string | null;
  fluxo?: string | null;
};

export type AcaoMatrix = 'consult' | 'cancel' | 'open' | 'activate' | 'reschedule';

export type FilaAndamento = {
  acao?: string | null;
  status?: string | null;
};

export function hasIccid(iccid?: string | null, tim?: string | null): boolean {
  const c = String(iccid || tim || '').replace(/\D/g, '');
  return c.length >= 19;
}

function fold(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function normOrder(o: string | null | undefined): string {
  return fold(o);
}

/** eSIM não passa na Toutbox. Quando aprovada, em geral já tem ICCID. */
export function isEsim(ce?: CeAndamento | null): boolean {
  const blob = fold([ce?.tipo_chip, ce?.fluxo, ce?.plano].filter(Boolean).join(' '));
  return /\be[\s-]?sim\b/.test(blob);
}

/**
 * Matrix TIM (consult / reschedule / cancel / open / activate).
 * Usada em eSIM sem logística — não esperar chip físico.
 */
export function acaoMatrixTim(ce?: CeAndamento | null): AcaoMatrix {
  const ticket = normTicket(ce?.ticket_status);
  const order = normOrder(ce?.order_status);
  const os = String(ce?.order_number || '').trim();
  const chip = hasIccid(ce?.iccid, ce?.tim_chip);

  if (!os || os === '0-00' || !os.startsWith('1-')) return 'consult';
  // Erro Aprov + ICCID = activate; sem chip = consult. Em Aprov = consult.
  if (order.includes('erro') && order.includes('aprov')) {
    return chip ? 'activate' : 'consult';
  }
  if (order.includes('em aprov') || order.includes('aprovisionamento')) return 'consult';
  // OS sem ticket = consult (não open)
  if (!ticket && os.startsWith('1-')) return 'consult';
  if (ticket.includes('conflito')) return 'reschedule';
  if (ticket.includes('suspens')) return 'cancel';
  if (ticket.includes('cancelamento pendente')) return 'consult';
  if (order.includes('cancelad')) return 'open';
  if (chip) return 'activate';
  return 'consult';
}

/** Texto de andamento da entrega — o que a Toutbox está fazendo agora. */
export function andamentoToutbox(
  ag: AgAndamento | null | undefined,
  temIccid: boolean,
): string | null {
  if (!ag) return null;
  const st = fold(ag.status);
  const tout = fold(ag.toutbox_classificacao);

  if (st === 'quebra_logistica' || tout === 'cancelada') {
    if (tout.includes('expir') || tout.includes('max_ciclo')) {
      return 'quebra · expirada (sem entrega)';
    }
    return 'quebra · cancelada (chip não chegou)';
  }

  if (tout === 'entregue' || st === 'acao_enviada') {
    return temIccid ? 'entregue · com ICCID' : 'entregue · consultar ICCID Toutbox';
  }

  if (st === 'monitorando' || tout === 'em_transito' || tout === 'sem_dados') {
    if (tout === 'sem_dados') return 'sem rastreio · aguardando';
    return 'em rota · aguardando';
  }

  return ag.status || ag.toutbox_classificacao || null;
}

/**
 * ICCID é consequência da entrega, não motivo de erro em trânsito.
 */
export function rotuloIccidPorAndamento(
  temIccid: boolean,
  andamento: string | null | undefined,
): string {
  if (temIccid) return 'sim';
  const a = fold(andamento);
  if (a.startsWith('em rota') || a.startsWith('sem rastreio')) {
    return '— · aguarda entrega';
  }
  if (a.includes('entregue') && (a.includes('aguarda iccid') || a.includes('consultar iccid'))) {
    return 'consultar ICCID Toutbox';
  }
  if (a.startsWith('quebra')) {
    return 'não · quebra (chip não chegou)';
  }
  return 'não';
}

/** Motivo da fatia: andamento Toutbox na logística; BKO só quando não está em espera. */
export function motivoPorAndamento(opts: {
  fatia: string;
  andamento: string | null;
  motivoFila: string | null;
}): string | null {
  if (opts.fatia === 'em_transito' || opts.fatia === 'entregue_aguardando_chip') {
    return opts.andamento;
  }
  if (opts.fatia === 'quebra_logistica') {
    return opts.andamento || opts.motivoFila;
  }
  return opts.motivoFila || opts.andamento;
}

export function classificarFatia(opts: {
  ce?: CeAndamento;
  ag?: AgAndamento;
  filas?: FilaAndamento[];
}): string {
  const ticket = normTicket(opts.ce?.ticket_status);
  const order = normOrder(opts.ce?.order_status);
  const ceStatus = fold(opts.ce?.status);
  const agSt = fold(opts.ag?.status);
  const tout = fold(opts.ag?.toutbox_classificacao);
  const filas = opts.filas || [];
  const emVoo = filas.filter((f) =>
    ['pendente', 'executando'].includes(fold(f.status)),
  );
  const emBko = filas.some((f) => fold(f.status) === 'bko');
  const chip = hasIccid(opts.ag?.iccid, opts.ce?.iccid || opts.ce?.tim_chip);

  if (ticket === 'portado') return 'sucesso_portado';
  if (ticket === 'falha parcial') return 'terminal_falha_parcial';
  if (ticket === 'portabilidade cancelada' && emVoo.length === 0 && !emBko) {
    return 'terminal_cancelada';
  }

  // 1) Toutbox finalizada sem chip = quebra (não é BKO)
  if (agSt === 'quebra_logistica' || (agSt === 'monitorando' && tout === 'cancelada')) {
    return 'quebra_logistica';
  }

  // 2) Andamento da entrega vence BKO: em rota / entregue sem chip = espera
  if (agSt === 'monitorando') {
    if (tout === 'entregue') {
      return chip ? 'entregue_com_chip' : 'entregue_aguardando_chip';
    }
    return 'em_transito';
  }
  if (agSt === 'acao_enviada') {
    if (chip && emVoo.some((f) => fold(f.acao) === 'activate')) return 'fila_activate';
    return chip ? 'entregue_com_chip' : 'entregue_aguardando_chip';
  }

  // 3) Sem logística: eSIM não espera Toutbox — cai na matrix TIM.
  //    Chip físico sem rastreio + BKO permanece BKO.
  if (emBko && isEsim(opts.ce)) {
    if (chip && order.includes('erro') && order.includes('aprov')) {
      return emVoo.some((f) => fold(f.acao) === 'activate') ? 'fila_activate' : 'entregue_com_chip';
    }
  } else if (emBko) {
    return 'bko';
  }

  const acaoVoo = (a: string) => emVoo.some((f) => fold(f.acao) === a);
  if (acaoVoo('activate')) return 'fila_activate';
  if (acaoVoo('reschedule')) return 'fila_reschedule';
  if (acaoVoo('cancel')) return 'fila_cancel';
  if (acaoVoo('open')) return 'fila_open';
  if (acaoVoo('consult')) return 'fila_consult';

  if (ticket === 'conflito') return 'ticket_conflito';
  if (ticket === 'portabilidade pendente') return 'ticket_pendente';
  if (ticket === 'portabilidade suspensa') return 'ticket_suspensa';
  if (ticket === 'cancelamento pendente') return 'ticket_cancelamento_pendente';

  if (order.includes('erro') && order.includes('aprov')) return 'order_erro_aprov';
  if (order.includes('em aprov') || order.includes('aprovisionamento')) {
    return 'order_em_aprov';
  }

  const os = String(opts.ce?.order_number || '');
  if (os.startsWith('1-') && !ticket) return 'aguardando_ticket';

  if (
    !os ||
    ['aguardando_os', 'aguardando_consulta'].includes(ceStatus) ||
    (ceStatus === 'enviada' && !os.startsWith('1-'))
  ) {
    if (!os.startsWith('1-')) return 'pre_os';
  }

  if (os.startsWith('1-') && !ticket) return 'aguardando_ticket';

  return 'orfao';
}
