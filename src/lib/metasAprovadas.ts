import { horaBrt } from './brt';
import {
  matchCampanha,
  type CampanhaOp,
  type EvaPayload,
  type EvaVendasCampanha,
} from './evaDash';

const PRODUTOS: Exclude<CampanhaOp, 'TODAS'>[] = ['PORTABILIDADE', 'MIGRACAO', 'ACAO_BKO'];

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function pesoDia(iso: string): number {
  const dow = new Date(`${iso}T12:00:00`).getDay();
  if (dow === 0) return 0;
  return dow === 6 ? 0.5 : 1;
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasMes(dataRef: string): string[] {
  const ref = new Date(`${dataRef}T12:00:00`);
  const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) =>
    isoLocal(new Date(ref.getFullYear(), ref.getMonth(), i + 1, 12)),
  );
}

function produtosDoFiltro(campanha: CampanhaOp): string[] {
  return campanha === 'TODAS' ? PRODUTOS : [campanha];
}

function vendasFallback(payload: EvaPayload): EvaVendasCampanha[] {
  const acc = new Map<string, EvaVendasCampanha>();
  const isize = Boolean(payload.kpis_chamadas?.isize_cruzamento);
  if (isize) {
    acc.set('PORTABILIDADE', {
      campanha_op: 'PORTABILIDADE',
      vb: Number(payload.kpis_chamadas?.isize_total || 0),
      aprovadas: Number(payload.kpis_chamadas?.isize_aceitas || 0),
      fonte: 'isize',
      detalhe_hora_limitado: true,
    });
  }
  for (const row of payload.jornada || []) {
    const campanha_op = row.campanha_op || 'OUTROS';
    if (isize && campanha_op === 'PORTABILIDADE') continue;
    const cur = acc.get(campanha_op) || { campanha_op, vb: 0, aprovadas: 0, fonte: 'jornada' };
    cur.vb += Number(row.vb || 0);
    cur.aprovadas += Number(row.aprovadas || 0);
    acc.set(campanha_op, cur);
  }
  return [...acc.values()];
}

export function vendasPorCampanhaDoPayload(payload: EvaPayload): EvaVendasCampanha[] {
  return payload.vendas_por_campanha?.length ? payload.vendas_por_campanha : vendasFallback(payload);
}

export function aprovadasDoPayload(payload: EvaPayload, campanha: CampanhaOp): number {
  const produtos = new Set(produtosDoFiltro(campanha));
  return vendasPorCampanhaDoPayload(payload)
    .filter((r) => produtos.has(r.campanha_op) && matchCampanha(r, campanha))
    .reduce((sum, r) => sum + Number(r.aprovadas || 0), 0);
}

export interface MetaAprovadasResumo {
  metaMensal: number;
  aprovadasMes: number;
  atingimentoPct: number;
  necessidadeMensal: number;
  metaBaseDia: number;
  aprovadasDia: number;
  necessidadePorDia: number;
  necessidadeHoje: number;
  necessidadePorHora: number;
  pesoRestante: number;
  diasComDados: number;
}

export function calcularMetaAprovadas(opts: {
  payloads: EvaPayload[];
  campanha: CampanhaOp;
  metaMensal: number;
  dataRef: string;
  expedienteHoras: number;
  horaAtual?: string;
  diaEmAberto: boolean;
}): MetaAprovadasResumo {
  const { payloads, campanha, dataRef, expedienteHoras, diaEmAberto } = opts;
  const metaMensal = Math.max(0, Number(opts.metaMensal) || 0);
  const byDate = new Map<string, EvaPayload>();
  for (const payload of payloads) {
    if (payload.data && payload.data.slice(0, 7) === dataRef.slice(0, 7) && payload.data <= dataRef) {
      byDate.set(payload.data, payload);
    }
  }

  const aprovadasMes = [...byDate.values()].reduce(
    (sum, payload) => sum + aprovadasDoPayload(payload, campanha),
    0,
  );
  const aprovadasDia = byDate.has(dataRef) ? aprovadasDoPayload(byDate.get(dataRef)!, campanha) : 0;
  const necessidadeMensal = Math.max(0, metaMensal - aprovadasMes);
  const dias = diasMes(dataRef);
  const pesoTotal = dias.reduce((sum, iso) => sum + pesoDia(iso), 0);
  const pesoRestante = dias
    .filter((iso) => (diaEmAberto ? iso >= dataRef : iso > dataRef))
    .reduce((sum, iso) => sum + pesoDia(iso), 0);
  const necessidadePorDia = pesoRestante > 0 ? necessidadeMensal / pesoRestante : necessidadeMensal;
  const pesoHoje = diaEmAberto ? pesoDia(dataRef) : 0;
  const necessidadeHoje = necessidadePorDia * pesoHoje;

  const inicio = 9;
  const hora = Number(opts.horaAtual || horaBrt());
  const decorridas = diaEmAberto ? Math.max(0, Math.min(expedienteHoras, hora - inicio + 1)) : expedienteHoras;
  const restantes = Math.max(0, expedienteHoras - decorridas);

  return {
    metaMensal,
    aprovadasMes,
    atingimentoPct: metaMensal > 0 ? round1((aprovadasMes / metaMensal) * 100) : 0,
    necessidadeMensal,
    metaBaseDia: pesoTotal > 0 ? round1(metaMensal / pesoTotal) : 0,
    aprovadasDia,
    necessidadePorDia: round1(necessidadePorDia),
    necessidadeHoje: round1(necessidadeHoje),
    necessidadePorHora: restantes > 0 ? round1(necessidadeHoje / restantes) : 0,
    pesoRestante,
    diasComDados: byDate.size,
  };
}
