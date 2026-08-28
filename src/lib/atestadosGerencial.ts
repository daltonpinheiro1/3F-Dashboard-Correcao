import type { Atestado, AtestadoTipo } from './atestadosEscala';
import { TIPO_LABELS } from './atestadosEscala';

export type GerencialAno = {
  ano: number;
  total: number;
  aprovados: number;
  protocolados: number;
  recusados: number;
  em_analise: number;
  total_dias: number;
  total_horas: number;
  por_tipo: Record<AtestadoTipo, { count: number; dias: number; horas: number }>;
  por_mes: Array<{ mes: number; label: string; count: number; dias: number; horas: number }>;
};

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function emptyPorTipo(): GerencialAno['por_tipo'] {
  return {
    medico: { count: 0, dias: 0, horas: 0 },
    odontologico: { count: 0, dias: 0, horas: 0 },
    acompanhamento: { count: 0, dias: 0, horas: 0 },
    declaracao: { count: 0, dias: 0, horas: 0 },
    outro: { count: 0, dias: 0, horas: 0 },
  };
}

function anoDoRegistro(r: Atestado, anoRef: number): boolean {
  const ref = r.data_inicio || r.created_at?.slice(0, 10);
  if (!ref) return false;
  const y = Number(ref.slice(0, 4));
  return y === anoRef;
}

export function agregarGerencialAno(rows: Atestado[], anoRef: number): GerencialAno {
  const filtrados = rows.filter((r) => anoDoRegistro(r, anoRef));
  const por_mes = MESES.map((label, i) => ({
    mes: i + 1,
    label,
    count: 0,
    dias: 0,
    horas: 0,
  }));
  const por_tipo = emptyPorTipo();

  let aprovados = 0;
  let protocolados = 0;
  let recusados = 0;
  let em_analise = 0;
  let total_dias = 0;
  let total_horas = 0;

  for (const r of filtrados) {
    if (r.status === 'aprovado' || r.status === 'arquivado') aprovados++;
    else if (r.status === 'protocolado') protocolados++;
    else if (r.status === 'recusado') recusados++;
    else if (r.status === 'em_analise') em_analise++;

    const dias = Number(r.quantidade_dias) || 0;
    const horas = Number(r.quantidade_horas) || 0;
    if (r.unidade_periodo === 'horas') total_horas += horas;
    else total_dias += dias;

    const tipo = (r.tipo in por_tipo ? r.tipo : 'outro') as AtestadoTipo;
    por_tipo[tipo].count++;
    if (r.unidade_periodo === 'horas') por_tipo[tipo].horas += horas;
    else por_tipo[tipo].dias += dias;

    const ref = r.data_inicio || r.created_at?.slice(0, 10) || '';
    const m = Number(ref.slice(5, 7));
    if (m >= 1 && m <= 12) {
      const slot = por_mes[m - 1];
      slot.count++;
      if (r.unidade_periodo === 'horas') slot.horas += horas;
      else slot.dias += dias;
    }
  }

  return {
    ano: anoRef,
    total: filtrados.length,
    aprovados,
    protocolados,
    recusados,
    em_analise,
    total_dias,
    total_horas,
    por_tipo,
    por_mes,
  };
}

export function formatTipoResumo(tipo: AtestadoTipo, count: number): string {
  return `${TIPO_LABELS[tipo]}: ${count}`;
}
