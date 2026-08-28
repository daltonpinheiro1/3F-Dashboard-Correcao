import type { Atestado, AtestadoTipo } from './atestadosEscala';
import { TIPO_LABELS } from './atestadosEscala';
import {
  diasEfetivos,
  findSobreposicoes,
  INSS_DIAS_LIMIAR,
  requerAlertaInss,
} from './atestadosDuplicidade';

export type GerencialAno = {
  ano: number;
  total: number;
  aprovados: number;
  protocolados: number;
  recusados: number;
  em_analise: number;
  solicitacoes_supervisor: number;
  total_dias: number;
  total_horas: number;
  media_dias: number;
  taxa_aprovacao_pct: number;
  inss_longos: Atestado[];
  duplicidades: Array<{ a: Atestado; b: Atestado }>;
  top_colaboradores: Array<{ nome: string; matricula: string; count: number; dias: number }>;
  por_tipo: Record<AtestadoTipo, { count: number; dias: number; horas: number }>;
  por_mes: Array<{ mes: number; label: string; count: number; dias: number; horas: number }>;
  por_origem: Record<string, number>;
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
  return Number(ref.slice(0, 4)) === anoRef;
}

function detectarDuplicidades(filtrados: Atestado[]): Array<{ a: Atestado; b: Atestado }> {
  const pares: Array<{ a: Atestado; b: Atestado }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < filtrados.length; i++) {
    for (let j = i + 1; j < filtrados.length; j++) {
      const a = filtrados[i];
      const b = filtrados[j];
      const hits = findSobreposicoes([a], b);
      if (hits.length) {
        const key = [a.id, b.id].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          pares.push({ a, b });
        }
      }
    }
  }
  return pares;
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
  const por_origem: Record<string, number> = { dp: 0, supervisor: 0, colaborador: 0 };
  const colabMap = new Map<string, { nome: string; matricula: string; count: number; dias: number }>();

  let aprovados = 0;
  let protocolados = 0;
  let recusados = 0;
  let em_analise = 0;
  let solicitacoes_supervisor = 0;
  let total_dias = 0;
  let total_horas = 0;
  let diasCount = 0;
  const inss_longos: Atestado[] = [];

  for (const r of filtrados) {
    if (r.status === 'aprovado' || r.status === 'arquivado') aprovados++;
    else if (r.status === 'protocolado') protocolados++;
    else if (r.status === 'recusado') recusados++;
    else if (r.status === 'em_analise') em_analise++;

    const orig = String(r.origem || 'dp');
    por_origem[orig] = (por_origem[orig] || 0) + 1;
    if (orig === 'supervisor') solicitacoes_supervisor++;

    const dias = Number(r.quantidade_dias) || diasEfetivos(r);
    const horas = Number(r.quantidade_horas) || 0;
    if (r.unidade_periodo === 'horas') total_horas += horas;
    else {
      total_dias += dias;
      if (dias > 0) diasCount++;
    }

    if (requerAlertaInss(r)) inss_longos.push(r);

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

    const ck = r.colaborador_matricula || r.colaborador_nome;
    const prev = colabMap.get(ck) || {
      nome: r.colaborador_nome,
      matricula: r.colaborador_matricula || '',
      count: 0,
      dias: 0,
    };
    prev.count++;
    if (r.unidade_periodo !== 'horas') prev.dias += dias;
    colabMap.set(ck, prev);
  }

  const decididos = aprovados + recusados;
  const taxa_aprovacao_pct = decididos ? Math.round((aprovados / decididos) * 100) : 0;
  const top_colaboradores = [...colabMap.values()]
    .sort((a, b) => b.dias - a.dias || b.count - a.count)
    .slice(0, 10);

  return {
    ano: anoRef,
    total: filtrados.length,
    aprovados,
    protocolados,
    recusados,
    em_analise,
    solicitacoes_supervisor,
    total_dias,
    total_horas,
    media_dias: diasCount ? Math.round((total_dias / diasCount) * 10) / 10 : 0,
    taxa_aprovacao_pct,
    inss_longos,
    duplicidades: detectarDuplicidades(filtrados),
    top_colaboradores,
    por_tipo,
    por_mes,
    por_origem,
  };
}

export function formatTipoResumo(tipo: AtestadoTipo, count: number): string {
  return `${TIPO_LABELS[tipo]}: ${count}`;
}

export { INSS_DIAS_LIMIAR };
