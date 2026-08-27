import { requerAprovacaoDp, type Advertencia } from './advertenciasEscala';

/** Filas do Controle DP — mutuamente exclusivas (exceto "todas"). */
export type DpInboxFiltro = 'todas' | 'enviadas' | 'autorizadas' | 'recusadas' | 'recebidas';

export const DP_INBOX_LABEL: Record<DpInboxFiltro, string> = {
  todas: 'Todas',
  enviadas: 'Enviadas',
  autorizadas: 'Autorizadas',
  recusadas: 'Recusadas',
  recebidas: 'Recebidas',
};

export const DP_INBOX_HINT: Record<DpInboxFiltro, string> = {
  todas: 'Todas as advertências do período/filtro',
  enviadas: 'Aguardando aprovação do DP (suspensão / apuração)',
  autorizadas: 'Aprovadas — impressão ou entrega pendente',
  recusadas: 'Devolvidas ao solicitante pelo DP',
  recebidas: 'Entregues / protocoladas (ciência ou testemunhas)',
};

export function isRecebida(r: Advertencia): boolean {
  return r.entrega_status === 'entregue' || r.entrega_status === 'recusada_ciencia';
}

/** Enviada ao DP e ainda sem decisão. */
export function isEnviadaDp(r: Advertencia): boolean {
  return r.status === 'pendente' && requerAprovacaoDp(r.nivel_idx);
}

/** Autorizada pelo DP (ou auto-aprovada) e ainda em trilha de entrega. */
export function isAutorizadaAberta(r: Advertencia): boolean {
  if (r.status !== 'aprovada' && r.status !== 'executada') return false;
  return !isRecebida(r);
}

export function isRecusadaDp(r: Advertencia): boolean {
  return r.status === 'recusada';
}

export function matchDpInbox(r: Advertencia, filtro: DpInboxFiltro): boolean {
  if (filtro === 'todas') return true;
  if (filtro === 'enviadas') return isEnviadaDp(r);
  if (filtro === 'autorizadas') return isAutorizadaAberta(r);
  if (filtro === 'recusadas') return isRecusadaDp(r);
  if (filtro === 'recebidas') return isRecebida(r);
  return true;
}

export function contarDpInbox(rows: Advertencia[]): Record<DpInboxFiltro, number> {
  const counts: Record<DpInboxFiltro, number> = {
    todas: rows.length,
    enviadas: 0,
    autorizadas: 0,
    recusadas: 0,
    recebidas: 0,
  };
  for (const r of rows) {
    if (isEnviadaDp(r)) counts.enviadas += 1;
    else if (isAutorizadaAberta(r)) counts.autorizadas += 1;
    else if (isRecusadaDp(r)) counts.recusadas += 1;
    else if (isRecebida(r)) counts.recebidas += 1;
  }
  return counts;
}

export function parseDpInboxParam(raw: string | null): DpInboxFiltro {
  const v = (raw || '').toLowerCase();
  if (v === 'enviadas' || v === 'autorizadas' || v === 'recusadas' || v === 'recebidas' || v === 'todas') {
    return v;
  }
  return 'todas';
}
