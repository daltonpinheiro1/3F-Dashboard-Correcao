import type { Atestado } from './atestadosEscala';
import { STATUS_LABELS, TIPO_LABELS } from './atestadosEscala';
import { downloadExcelTable } from './exportSpreadsheet';

const HEADERS = [
  'Protocolo',
  'Colaborador',
  'Matrícula',
  'CPF',
  'Tipo',
  'Unidade',
  'Dias',
  'Horas',
  'Data início',
  'Data fim',
  'CID',
  'Médico',
  'CRM/UF',
  'Status',
  'IA confiança',
  'Arquivo',
  'Protocolado por',
  'Analisado por',
  'Analisado em',
  'Criado em',
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

export function atestadosToExcelRows(rows: Atestado[]): (string | number)[][] {
  return rows.map((r) => [
    r.protocolo,
    r.colaborador_nome,
    r.colaborador_matricula || '',
    r.colaborador_cpf || '',
    TIPO_LABELS[r.tipo],
    r.unidade_periodo,
    r.quantidade_dias ?? '',
    r.quantidade_horas ?? '',
    fmtDate(r.data_inicio),
    fmtDate(r.data_fim),
    r.cid || '',
    r.medico_nome || '',
    r.crm_uf || '',
    STATUS_LABELS[r.status],
    r.ia_confianca != null ? Math.round(Number(r.ia_confianca) * 100) : '',
    r.arquivo_path || '',
    r.criado_por_nome || r.criado_por_email || '',
    r.analisado_por_nome || r.analisado_por_email || '',
    fmtDateTime(r.analisado_em),
    fmtDateTime(r.created_at),
    r.id,
  ]);
}

export function exportAtestadosExcel(rows: Atestado[], ano?: number): void {
  const suffix = ano ? `_${ano}` : '';
  downloadExcelTable(
    `atestados${suffix}_${new Date().toISOString().slice(0, 10)}.xls`,
    `Atestados${suffix}`,
    HEADERS,
    atestadosToExcelRows(rows),
  );
}

export function exportInssRelatorio(rows: Atestado[], ano: number): void {
  const headers = ['Protocolo', 'Colaborador', 'Matrícula', 'Dias', 'Início', 'Fim', 'CID', 'Status', 'Médico'];
  const dataRows = rows.map((r) => [
    r.protocolo,
    r.colaborador_nome,
    r.colaborador_matricula || '',
    r.quantidade_dias ?? '',
    r.data_inicio || '',
    r.data_fim || '',
    r.cid || '',
    STATUS_LABELS[r.status],
    r.medico_nome || '',
  ]);
  downloadExcelTable(`atestados_inss_${ano}.xls`, `INSS ${ano}`, headers, dataRows);
}

export function exportGerencialResumo(
  rows: Atestado[],
  ano: number,
  resumo: { total: number; total_dias: number; total_horas: number },
): void {
  const headers = ['Mês', 'Quantidade', 'Dias', 'Horas'];
  const byMonth = new Map<number, { count: number; dias: number; horas: number }>();
  for (let m = 1; m <= 12; m++) byMonth.set(m, { count: 0, dias: 0, horas: 0 });
  for (const r of rows) {
    const ref = r.data_inicio || r.created_at?.slice(0, 10) || '';
    if (!ref.startsWith(String(ano))) continue;
    const m = Number(ref.slice(5, 7));
    if (m < 1 || m > 12) continue;
    const slot = byMonth.get(m)!;
    slot.count++;
    if (r.unidade_periodo === 'horas') slot.horas += Number(r.quantidade_horas) || 0;
    else slot.dias += Number(r.quantidade_dias) || 0;
  }
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const dataRows = meses.map((label, i) => {
    const s = byMonth.get(i + 1)!;
    return [label, s.count, s.dias, s.horas];
  });
  dataRows.push(['TOTAL', resumo.total, resumo.total_dias, resumo.total_horas]);
  downloadExcelTable(
    `atestados_gerencial_${ano}.xls`,
    `Gerencial ${ano}`,
    headers,
    dataRows,
  );
}
