import { downloadExcelTable } from './exportSpreadsheet';

export type PortabilidadeFatiaRow = {
  proposta: string;
  order_number?: string | null;
  order_status?: string | null;
  ticket_status?: string | null;
  ticket_number?: string | null;
  tem_iccid: boolean;
  iccid_label?: string | null;
  logistica?: string | null;
  fila?: string | null;
  motivo_recusar?: string | null;
  cancelamento?: string | null;
  updated_at?: string | null;
};

const HEADERS = [
  'Proposta',
  'OS',
  'Order status',
  'Ticket status',
  'Ticket nº',
  'Motivo recusar',
  'Cancelamento',
  'ICCID',
  'Toutbox',
  'Fila',
  'Atualizado em',
];

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
}

export function portabilidadeFatiaToExcelRows(rows: PortabilidadeFatiaRow[]): (string | number)[][] {
  return rows.map((r) => [
    r.proposta,
    r.order_number || '',
    r.order_status || '',
    r.ticket_status || '',
    r.ticket_number || '',
    r.motivo_recusar || '',
    r.cancelamento || '',
    r.iccid_label || (r.tem_iccid ? 'sim' : 'não'),
    r.logistica || '',
    r.fila || '',
    fmtDateTime(r.updated_at),
  ]);
}

export function exportPortabilidadeFatiaExcel(
  rows: PortabilidadeFatiaRow[],
  opts: { fatiaLabel: string; fatiaId: string; mes: string; modo: string },
): void {
  if (!rows.length) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const safeId = opts.fatiaId.replace(/[^\w-]+/g, '_').slice(0, 40);
  downloadExcelTable(
    `portabilidade_${safeId}_${opts.mes}_${stamp}`,
    `${opts.fatiaLabel.slice(0, 24)} · ${opts.modo}`,
    HEADERS,
    portabilidadeFatiaToExcelRows(rows),
  );
}
