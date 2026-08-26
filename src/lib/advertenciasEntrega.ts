import type { Advertencia, EntregaModo, EntregaStatus } from './advertenciasEscala';

export type { EntregaModo, EntregaStatus };

export const ENTREGA_LABEL: Record<EntregaStatus, string> = {
  aguardando_aprovacao: 'Aguardando aprovação DP',
  aguardando_impressao: 'Aguardando impressão',
  impressa: 'Impressa — aguardando entrega',
  entregue: 'Entregue / protocolada',
  recusada_ciencia: 'Recusa de ciência (testemunhas)',
};

export const ENTREGA_CLS: Record<EntregaStatus, string> = {
  aguardando_aprovacao: 'bg-amber-100 text-amber-800',
  aguardando_impressao: 'bg-sky-100 text-sky-800',
  impressa: 'bg-indigo-100 text-indigo-800',
  entregue: 'bg-emerald-100 text-emerald-800',
  recusada_ciencia: 'bg-orange-100 text-orange-800',
};

export const ENTREGA_MODO_LABEL: Record<EntregaModo, string> = {
  assinatura_colaborador: 'Assinatura do colaborador',
  recusa_ciencia_testemunhas: 'Recusa de ciência + testemunhas',
  protocolo_dp: 'Protocolo entregue ao DP',
};

export function entregaInicialPorStatus(status: Advertencia['status']): EntregaStatus {
  if (status === 'pendente') return 'aguardando_aprovacao';
  if (status === 'aprovada' || status === 'executada') return 'aguardando_impressao';
  return 'aguardando_aprovacao';
}

export function podeMarcarImpressa(r: Advertencia): boolean {
  return (
    r.status === 'aprovada' &&
    (r.entrega_status === 'aguardando_impressao' || !r.entrega_status)
  );
}

export function podeConfirmarEntrega(r: Advertencia): boolean {
  return r.status === 'aprovada' && r.entrega_status === 'impressa';
}

export function entregaPendente(r: Advertencia): boolean {
  return (
    r.status === 'aprovada' &&
    r.entrega_status !== 'entregue' &&
    r.entrega_status !== 'recusada_ciencia'
  );
}
