import type { Advertencia } from './advertenciasEscala';
import { ENTREGA_LABEL, ENTREGA_MODO_LABEL } from './advertenciasEntrega';
import { NOTIFICACAO_LABEL } from './advertenciasNotificacao';
import { STATUS_LABEL } from './advertenciasService';
import { downloadExcelTable } from './exportSpreadsheet';

const HEADERS = [
  'Data ocorrido',
  'Colaborador',
  'Matrícula',
  'CPF',
  'Cargo',
  'Responsável',
  'E-mail responsável',
  'Motivo (Siscad)',
  'Submotivo / texto documento',
  'Nível',
  'Dias suspensão',
  'Status',
  'Descrição',
  'Aprovado por',
  'Aprovado em',
  'Motivo recusa',
  'Obs. supervisor',
  'Justificativa pulo etapa',
  'Ciência colaborador',
  'Testemunha 1',
  'CPF testemunha 1',
  'Testemunha 2',
  'CPF testemunha 2',
  'Criado em',
  'Entrega',
  'Impressa em',
  'Entregue em',
  'Modo entrega',
  'Notificação e-mail',
  'ID',
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
}

export function advertenciasToExcelRows(rows: Advertencia[]): (string | number)[][] {
  return rows.map((r) => [
    fmtDate(r.data_ocorrido),
    r.colaborador_nome,
    r.colaborador_matricula || '',
    r.colaborador_cpf || '',
    r.colaborador_cargo || '',
    r.criado_por_nome || '',
    r.criado_por_email || '',
    r.motivo_categoria,
    r.motivo_texto,
    r.nivel_label,
    r.dias_suspensao ?? 0,
    STATUS_LABEL[r.status] || r.status,
    r.descricao,
    r.aprovado_por_nome || '',
    fmtDateTime(r.aprovado_em),
    r.recusa_motivo || '',
    r.observacoes_supervisor || '',
    r.justificativa_pulo || '',
    r.ciencia_colaborador ? 'Sim' : 'Não',
    r.testemunha1_nome || '',
    r.testemunha1_cpf || '',
    r.testemunha2_nome || '',
    r.testemunha2_cpf || '',
    fmtDateTime(r.created_at),
    r.entrega_status ? ENTREGA_LABEL[r.entrega_status] : '',
    fmtDateTime(r.impressa_em),
    fmtDateTime(r.entregue_em),
    r.entrega_modo ? ENTREGA_MODO_LABEL[r.entrega_modo] : '',
    r.notificacao_status ? NOTIFICACAO_LABEL[r.notificacao_status] : '',
    r.id,
  ]);
}

/** Exporta registros filtrados da aba Controle (RH) para Excel (.xls). */
export function exportAdvertenciasExcel(rows: Advertencia[], filenameBase = 'advertencias_controle'): void {
  if (!rows.length) return;
  const stamp = new Date().toISOString().slice(0, 10);
  downloadExcelTable(`${filenameBase}_${stamp}`, 'Advertências', HEADERS, advertenciasToExcelRows(rows));
}
