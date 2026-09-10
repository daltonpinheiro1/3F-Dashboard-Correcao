/**
 * Dados/helpers puros da visão Hora a hora.
 * Extraídos de HoraPage para reduzir o god-component (PR 1/3).
 */
import { horaBrt } from './brt';
import type {
  CampanhaOp,
  EvaHoraMotivo,
  EvaHoraOperador,
  EvaHoraSupervisor,
  EvaPayload,
  EvaSerieHora,
} from './evaDash';

export const HORAS: string[] = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'];

export function horaKey(h: string | number) {
  return String(h).padStart(2, '0').slice(0, 2);
}

export function resolveHoraComercialRefs(
  campanha: CampanhaOp,
  refs: {
    metaPort: number;
    metaMig: number;
    metaBko: number;
    metaCc: number;
    metaAlgar: number;
    expedientePort: number;
    expedienteMig: number;
    expedienteBko: number;
    expedienteCc: number;
    expedienteAlgar: number;
  },
): { metaVendasMes: number; expedienteHoras: number } {
  if (campanha === 'PORTABILIDADE') {
    return { metaVendasMes: refs.metaPort, expedienteHoras: refs.expedientePort };
  }
  if (campanha === 'MIGRACAO') {
    return { metaVendasMes: refs.metaMig, expedienteHoras: refs.expedienteMig };
  }
  if (campanha === 'CONTROLE_CONTROLE') {
    return { metaVendasMes: refs.metaCc, expedienteHoras: refs.expedienteCc };
  }
  if (campanha === 'ACAO_BKO') {
    return { metaVendasMes: refs.metaBko, expedienteHoras: refs.expedienteBko };
  }
  if (campanha === 'ALGAR') {
    return { metaVendasMes: refs.metaAlgar, expedienteHoras: refs.expedienteAlgar };
  }
  return {
    metaVendasMes: refs.metaPort + refs.metaMig,
    expedienteHoras: (refs.expedientePort + refs.expedienteMig) / 2,
  };
}

export function mergeSerie(hist: EvaPayload[]): EvaSerieHora[] {
  const acc: Record<string, EvaSerieHora> = {};
  for (const p of hist) {
    for (const r of p.serie_hora || []) {
      const k = `${horaKey(r.hora)}|${r.campanha_op || ''}`;
      if (!acc[k]) {
        acc[k] = {
          ...r,
          hora: horaKey(r.hora),
          total: 0,
          cpc: 0,
          sucesso: 0,
          vb: 0,
          aprovadas: 0,
        };
      }
      acc[k].total += r.total || 0;
      acc[k].cpc = (acc[k].cpc || 0) + (r.cpc || 0);
      acc[k].sucesso = (acc[k].sucesso || 0) + (r.sucesso || 0);
      acc[k].vb = (acc[k].vb || 0) + (r.vb || 0);
      acc[k].aprovadas = (acc[k].aprovadas || 0) + (r.aprovadas || 0);
    }
  }
  return Object.values(acc).map((r) => ({
    ...r,
    pct_cpc: r.total ? Math.round((1000 * (r.cpc || 0)) / r.total) / 10 : 0,
  }));
}

/** Crivo = aprovadas ÷ VB da série. Hora filtrada nunca usa jornada do dia. */
export function crivoDoIntervalo(
  serie: Array<{ hora?: string | number; vb?: number; aprovadas?: number }>,
  hora: string,
): { crivo: number | null; vb: number; aprovadas: number; fonte: 'intervalo' | 'dia' } {
  const rows = hora === 'todas' ? serie : serie.filter((r) => horaKey(r.hora ?? '') === hora);
  const vb = rows.reduce((s, r) => s + (r.vb || 0), 0);
  const aprovadas = rows.reduce((s, r) => s + (r.aprovadas || 0), 0);
  return {
    vb,
    aprovadas,
    crivo: vb > 0 ? Math.round((1000 * aprovadas) / vb) / 10 : null,
    fonte: hora === 'todas' ? 'dia' : 'intervalo',
  };
}

export function mergeSup(hist: EvaPayload[]): EvaHoraSupervisor[] {
  const acc: Record<string, EvaHoraSupervisor> = {};
  for (const p of hist) {
    for (const r of p.hora_supervisor || []) {
      const k = `${horaKey(r.hora)}|${r.supervisor}|${r.campanha_op || ''}`;
      if (!acc[k]) acc[k] = { ...r, hora: horaKey(r.hora), total: 0, cpc: 0, sucesso: 0, pct_cpc: 0 };
      acc[k].total += r.total;
      acc[k].cpc += r.cpc;
      acc[k].sucesso = (acc[k].sucesso || 0) + (r.sucesso || 0);
    }
  }
  return Object.values(acc).map((r) => ({
    ...r,
    pct_cpc: r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0,
  }));
}

export function mergeMotivo(
  hist: EvaPayload[],
  field: 'hora_motivo' | 'hora_sup_motivo' = 'hora_motivo',
): EvaHoraMotivo[] {
  const acc: Record<string, EvaHoraMotivo & { _tmaW: number; _tmaN: number }> = {};
  for (const p of hist) {
    for (const r of (p[field] || []) as EvaHoraMotivo[]) {
      const k = `${horaKey(r.hora)}|${r.nome}|${r.campanha_op || ''}|${r.supervisor || ''}`;
      if (!acc[k]) acc[k] = { ...r, hora: horaKey(r.hora), total: 0, cpc: 0, pct_cpc: 0, _tmaW: 0, _tmaN: 0 };
      acc[k].total += r.total;
      acc[k].cpc += r.cpc;
      if (r.tma_seg) {
        acc[k]._tmaW += r.tma_seg * r.total;
        acc[k]._tmaN += r.total;
      }
    }
  }
  return Object.values(acc).map(({ _tmaW, _tmaN, ...r }) => ({
    ...r,
    pct_cpc: r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0,
    tma_seg: _tmaN ? Math.round((_tmaW / _tmaN) * 10) / 10 : r.tma_seg,
  }));
}

export function mergeOps(hist: EvaPayload[]): EvaHoraOperador[] {
  const acc: Record<string, EvaHoraOperador & { _tmaW: number; _tmaN: number }> = {};
  for (const p of hist) {
    for (const r of p.hora_operador || []) {
      const k = `${horaKey(r.hora)}|${r.login}|${r.campanha_op || ''}`;
      if (!acc[k]) acc[k] = { ...r, hora: horaKey(r.hora), total: 0, cpc: 0, sucesso: 0, pct_cpc: 0, _tmaW: 0, _tmaN: 0 };
      acc[k].total += r.total;
      acc[k].cpc += r.cpc;
      acc[k].sucesso = (acc[k].sucesso || 0) + (r.sucesso || 0);
      if (r.tma_seg) {
        acc[k]._tmaW += r.tma_seg * r.total;
        acc[k]._tmaN += r.total;
      }
    }
  }
  return Object.values(acc).map(({ _tmaW, _tmaN, ...r }) => ({
    ...r,
    pct_cpc: r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0,
    tma_seg: _tmaN ? Math.round((_tmaW / _tmaN) * 10) / 10 : r.tma_seg,
  }));
}

export function diasDoMes(dataRef: string) {
  const d = new Date(`${dataRef}T12:00:00`);
  const y = d.getFullYear();
  const m = d.getMonth();
  const total = new Date(y, m + 1, 0).getDate();
  let uteis = 0;
  let sabados = 0;
  for (let i = 1; i <= total; i++) {
    const dow = new Date(y, m, i).getDay();
    if (dow === 0) continue;
    if (dow === 6) sabados++;
    else uteis++;
  }
  return { uteis, sabados, total };
}

export function diaAtualEhSabado(dataRef: string) {
  return new Date(`${dataRef}T12:00:00`).getDay() === 6;
}

export interface NowcastRow {
  hora: string;
  metaAcum: number;
  realizado: number;
  gap: number;
  gapPct: number;
}

export interface NowcastSup {
  supervisor: string;
  vendidoAteAgora: number;
  metaDiaSup: number;
  gapSup: number;
  metaRestante: number;
  metaPorHoraRestante: number;
}

/** Fatias da meta do dia por supervisor (pesos de capacidade). Soma ≈ metaDia. */
export function alocarMetaDiaPorSupervisor(
  supervisors: string[],
  metaDia: number,
  weights?: Record<string, number>,
): Record<string, number> {
  const n = supervisors.length || 1;
  const sumW = supervisors.reduce((sum, name) => sum + Math.max(0, weights?.[name] ?? 1), 0);
  const out: Record<string, number> = {};
  for (const name of supervisors) {
    const weight = Math.max(0, weights?.[name] ?? 1);
    const share = sumW > 0 ? weight / sumW : 1 / n;
    out[name] = Math.round(metaDia * share * 10) / 10;
  }
  return out;
}

export function buildNowcast(
  serie: EvaSerieHora[],
  sups: EvaHoraSupervisor[],
  metaVendasMes: number,
  expediente: number,
  dataRef: string,
  horaAtual: string,
  supervisorWeights?: Record<string, number>,
): {
  rows: NowcastRow[];
  supRows: NowcastSup[];
  metaDiaUtil: number;
  metaSabado: number;
  metaHora: number;
  metaDia: number;
  vendasTotal: number;
  gapAcum: number;
  gapPct: number;
  horasDecorridas: number;
  horasRestantes: number;
  metaRestanteTotal: number;
  metaHoraRestante: number;
} {
  const { uteis, sabados } = diasDoMes(dataRef);
  const pesoTotal = uteis + sabados * 0.5;
  const metaDiaUtil = pesoTotal > 0 ? Math.round(metaVendasMes / pesoTotal) : 0;
  const metaSabado = Math.round(metaDiaUtil * 0.5);
  const ehSabado = diaAtualEhSabado(dataRef);
  const metaDia = ehSabado ? metaSabado : metaDiaUtil;
  const expedienteEff = Math.max(0, Math.min(expediente, HORAS.length));
  const metaHora = expedienteEff > 0 ? Math.round((metaDia / expedienteEff) * 10) / 10 : 0;

  const INICIO = Number(HORAS[0]);
  const vendasPorHora: Record<string, number> = {};
  for (const r of serie) {
    const hh = horaKey(r.hora);
    vendasPorHora[hh] = (vendasPorHora[hh] || 0) + (r.sucesso || 0);
  }

  const hAtual = Number(horaAtual === 'todas' ? horaBrt() : horaAtual);
  const horasDecorridas = Math.max(0, Math.min(expedienteEff, hAtual - INICIO + 1));
  const horasRestantes = Math.max(0, expedienteEff - horasDecorridas);
  const metaProjetada = Math.round(metaHora * horasDecorridas * 10) / 10;

  let acumReal = 0;
  const rows: NowcastRow[] = [];
  for (let i = 0; i < expedienteEff && INICIO + i <= 21; i++) {
    const hh = String(INICIO + i).padStart(2, '0');
    const vendido = vendasPorHora[hh] || 0;
    if (i + 1 <= horasDecorridas) acumReal += vendido;
    const metaAcum = Math.round(metaHora * (i + 1) * 10) / 10;
    const gap = Math.round((acumReal - metaAcum) * 10) / 10;
    const gapPct = metaAcum > 0 ? Math.round((gap / metaAcum) * 1000) / 10 : 0;
    rows.push({ hora: `${hh}h`, metaAcum, realizado: acumReal, gap, gapPct });
  }

  const vendasTotal = acumReal;
  const gapAcum = Math.round((vendasTotal - metaProjetada) * 10) / 10;
  const gapPct = metaProjetada > 0 ? Math.round((gapAcum / metaProjetada) * 1000) / 10 : 0;
  const metaRestanteTotal = Math.max(0, metaDia - vendasTotal);
  const metaHoraRestante = horasRestantes > 0 ? Math.round((metaRestanteTotal / horasRestantes) * 10) / 10 : 0;

  const limiteHoraNum = INICIO + horasDecorridas - 1;
  const supAcc: Record<string, { supervisor: string; sucesso: number }> = {};
  for (const r of sups) {
    const hhNum = Number(horaKey(r.hora));
    if (horasDecorridas <= 0 || hhNum > limiteHoraNum) continue;
    if (!supAcc[r.supervisor]) supAcc[r.supervisor] = { supervisor: r.supervisor, sucesso: 0 };
    supAcc[r.supervisor].sucesso += r.sucesso || 0;
  }
  const supList = Object.values(supAcc);
  const alocMeta = alocarMetaDiaPorSupervisor(
    supList.map((s) => s.supervisor),
    metaDia,
    supervisorWeights,
  );

  const supRows: NowcastSup[] = supList
    .map((s) => {
      const metaDiaSup = alocMeta[s.supervisor] ?? 0;
      // Bug fix: guarda contra divisão por zero quando expedienteEff = 0.
      const gapSup = expedienteEff > 0
        ? Math.round((s.sucesso - (metaDiaSup * horasDecorridas) / expedienteEff) * 10) / 10
        : 0;
      const rest = Math.max(0, metaDiaSup - s.sucesso);
      return {
        supervisor: s.supervisor,
        vendidoAteAgora: s.sucesso,
        metaDiaSup,
        gapSup,
        metaRestante: Math.round(rest * 10) / 10,
        metaPorHoraRestante: horasRestantes > 0 ? Math.round((rest / horasRestantes) * 10) / 10 : 0,
      };
    })
    .sort((a, b) => a.gapSup - b.gapSup);

  return {
    rows,
    supRows,
    metaDiaUtil,
    metaSabado,
    metaHora,
    metaDia,
    vendasTotal,
    gapAcum,
    gapPct,
    horasDecorridas,
    horasRestantes,
    metaRestanteTotal,
    metaHoraRestante,
  };
}

export interface ForecastDia {
  otimista: number;
  realista: number;
  pessimista: number;
  meta: number;
  vendasAtual: number;
  horasRestantes: number;
  mediaHora: number;
  recenteHora: number;
}

export interface MonteCarloDia {
  probabilidade: number;
  meta: number;
  vendasAtual: number;
  horasRestantes: number;
  projecaoMedia: number;
  projecaoP10: number;
  projecaoP50: number;
  projecaoP90: number;
  forecastRealista: number;
}

/** Vendas (sucesso) por hora do expediente — mesma base do forecast do dia.
 *  Inclui horas com zero vendas para que o cenário pessimista do Monte Carlo
 *  reflita corretamente paralisações/horários de almoço. */
export function vendasPorHoraFromSerie(serie: EvaSerieHora[]): number[] {
  const vendasPorH: number[] = [];
  for (const h of HORAS) {
    const total = serie
      .filter((r) => horaKey(r.hora) === h)
      .reduce((s, r) => s + (r.sucesso || 0), 0);
    // Bug fix: inclui zeros para não inflar o cenário pessimista artificialmente.
    vendasPorH.push(total);
  }
  // Remove apenas as horas ainda não decorridas (trailing zeros sem dados reais).
  while (vendasPorH.length > 0 && vendasPorH[vendasPorH.length - 1] === 0) {
    vendasPorH.pop();
  }
  return vendasPorH;
}

/** Forecast de fechamento do dia (3 cenários + ritmos horários). */
export function buildForecastDia(
  serie: EvaSerieHora[],
  vendasAtual: number,
  horasRestantes: number,
  metaDia: number,
): ForecastDia | null {
  const vendasPorH = vendasPorHoraFromSerie(serie);
  if (!vendasPorH.length) return null;
  const avg = vendasPorH.reduce((a, b) => a + b, 0) / vendasPorH.length;
  const best = Math.max(...vendasPorH);
  const worst = Math.min(...vendasPorH);
  const last2 = vendasPorH.slice(-2);
  const recent = last2.length ? last2.reduce((a, b) => a + b, 0) / last2.length : avg;
  const rest = horasRestantes;
  return {
    otimista: Math.round(vendasAtual + best * rest),
    realista: Math.round(vendasAtual + recent * rest),
    pessimista: Math.round(vendasAtual + worst * rest),
    meta: metaDia,
    vendasAtual,
    horasRestantes: rest,
    mediaHora: Math.round(avg * 10) / 10,
    recenteHora: Math.round(recent * 10) / 10,
  };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

/** Monte Carlo sobre o forecast do dia — probabilidade e percentis de fechamento. */
export function buildMonteCarloDia(
  forecast: ForecastDia,
  vendasPorH: number[],
  opts?: { sims?: number; rng?: () => number },
): MonteCarloDia | null {
  if (!vendasPorH.length) return null;

  if (forecast.horasRestantes <= 0) {
    const hit = forecast.vendasAtual >= forecast.meta;
    return {
      probabilidade: hit ? 100 : 0,
      meta: forecast.meta,
      vendasAtual: forecast.vendasAtual,
      horasRestantes: 0,
      projecaoMedia: forecast.vendasAtual,
      projecaoP10: forecast.vendasAtual,
      projecaoP50: forecast.vendasAtual,
      projecaoP90: forecast.vendasAtual,
      forecastRealista: forecast.vendasAtual,
    };
  }

  const mean = forecast.recenteHora;
  // Bug fix: desvio padrão calculado em torno de `mean` (recenteHora), não de mediaHora,
  // pois é `mean` quem pilota a projeção Monte Carlo.
  const stdDev =
    vendasPorH.length >= 2
      ? Math.sqrt(
          vendasPorH.reduce((a, b) => a + (b - mean) ** 2, 0) / vendasPorH.length,
        )
      : Math.max(mean * 0.25, 1);

  const sims = opts?.sims ?? 2000;
  const rand = opts?.rng ?? Math.random;
  const projections: number[] = [];
  let above = 0;

  for (let s = 0; s < sims; s++) {
    let total = forecast.vendasAtual;
    for (let h = 0; h < forecast.horasRestantes; h++) {
      const u1 = rand() || 1e-10;
      const u2 = rand();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      total += Math.max(0, mean + stdDev * z);
    }
    projections.push(total);
    if (total >= forecast.meta) above++;
  }

  projections.sort((a, b) => a - b);
  const media = projections.reduce((a, b) => a + b, 0) / projections.length;

  return {
    probabilidade: Math.round((above / sims) * 100),
    meta: forecast.meta,
    vendasAtual: forecast.vendasAtual,
    horasRestantes: forecast.horasRestantes,
    projecaoMedia: Math.round(media),
    projecaoP10: Math.round(percentile(projections, 0.1)),
    projecaoP50: Math.round(percentile(projections, 0.5)),
    projecaoP90: Math.round(percentile(projections, 0.9)),
    forecastRealista: forecast.realista,
  };
}

export function motivoSourceLabel(source?: string) {
  if (source === 'operador_payload') return 'Operador';
  if (source === 'operador_estimado') return 'Estimado op.';
  if (source === 'supervisor_fallback') return 'Fallback sup.';
  if (source === 'global_fallback') return 'Fallback global';
  return 'Indisponível';
}

export type FunilEtapa = { etapa: string; valor: number; pct: number };

/**
 * Funil Tabuladas → CPC → Sucesso → VB → Aprovadas.
 * Com Hora filtrada, NUNCA usa isize_total/isize_aceitas do dia (mistura recortes).
 * Nesse caso VB/aprovadas vêm da série do intervalo (vendas_hora / serieRitmo).
 */
export function buildFunilConversaoHora(args: {
  hora: string;
  tabuladas: number;
  cpc: number;
  sucessoEva: number;
  vbJornada: number;
  aprovJornada: number;
  serieRitmo: Array<{ hora?: string | number; vb?: number; aprovadas?: number }>;
  isizeCruzamento: boolean;
  isizeTotal: number;
  isizeAceitas: number;
  isizeAplicavel: boolean;
}): FunilEtapa[] {
  const {
    hora,
    tabuladas,
    cpc,
    sucessoEva,
    vbJornada,
    aprovJornada,
    serieRitmo,
    isizeCruzamento,
    isizeTotal,
    isizeAceitas,
    isizeAplicavel,
  } = args;

  const intervalo = crivoDoIntervalo(serieRitmo, hora);
  const usarIsizeDia =
    hora === 'todas' && isizeAplicavel && isizeCruzamento && isizeTotal > 0;
  const usarSerieHora = hora !== 'todas' && (intervalo.vb > 0 || intervalo.aprovadas > 0);

  // Sucesso no modo iSize do dia = isize_total (≈ VB). Com hora, espelha VB da série do intervalo.
  const sucFinal = usarIsizeDia
    ? isizeTotal
    : usarSerieHora
      ? intervalo.vb
      : sucessoEva;
  const vbFinal = usarIsizeDia
    ? isizeTotal
    : usarSerieHora
      ? intervalo.vb
      : hora === 'todas'
        ? vbJornada
        : 0;
  const aprovFinal =
    usarIsizeDia && isizeAceitas > 0
      ? isizeAceitas
      : usarSerieHora
        ? intervalo.aprovadas
        : hora === 'todas'
          ? aprovJornada
          : 0;

  const tagIsize = usarIsizeDia || usarSerieHora ? ' (iSize)' : '';

  const pct = (v: number) =>
    tabuladas > 0 ? Math.round((v / tabuladas) * 1000) / 10 : 0;

  return [
    { etapa: 'Tabuladas', valor: tabuladas, pct: 100 },
    { etapa: 'CPC', valor: cpc, pct: pct(cpc) },
    { etapa: `Sucesso${tagIsize}`, valor: sucFinal, pct: pct(sucFinal) },
    { etapa: `VB${tagIsize}`, valor: vbFinal, pct: pct(vbFinal) },
    { etapa: `Aprovadas${tagIsize}`, valor: aprovFinal, pct: pct(aprovFinal) },
  ];
}

/** Consolidados do heatmap Supervisor × Hora. */
export function buildHeatmapConsolidados(
  supervisors: string[],
  horas: string[],
  acc: Record<string, number>,
): {
  porHora: Record<string, number>;
  porSupervisor: Record<string, number>;
  totalDia: number;
} {
  const porHora: Record<string, number> = {};
  const porSupervisor: Record<string, number> = {};
  let totalDia = 0;
  for (const h of horas) porHora[h] = 0;
  for (const sup of supervisors) {
    let row = 0;
    for (const h of horas) {
      const v = acc[`${sup}|${h}`] || 0;
      row += v;
      porHora[h] += v;
      totalDia += v;
    }
    porSupervisor[sup] = row;
  }
  return { porHora, porSupervisor, totalDia };
}

export function motivoSourceClass(source?: string) {
  if (source === 'operador_payload') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (source === 'operador_estimado') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (source === 'supervisor_fallback') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (source === 'global_fallback') return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-gray-50 text-gray-500 border-gray-200';
}
