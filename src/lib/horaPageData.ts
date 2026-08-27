/**
 * Dados/helpers puros da visão Hora a hora.
 * Extraídos de HoraPage para reduzir o god-component (PR 1/3).
 */
import type {
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

export function mergeSerie(hist: EvaPayload[]): EvaSerieHora[] {
  const acc: Record<string, EvaSerieHora> = {};
  for (const p of hist) {
    for (const r of p.serie_hora || []) {
      const k = `${horaKey(r.hora)}|${r.campanha_op || ''}`;
      if (!acc[k]) acc[k] = { ...r, hora: horaKey(r.hora), total: 0, cpc: 0, sucesso: 0 };
      acc[k].total += r.total || 0;
      acc[k].cpc = (acc[k].cpc || 0) + (r.cpc || 0);
      acc[k].sucesso = (acc[k].sucesso || 0) + (r.sucesso || 0);
    }
  }
  return Object.values(acc).map((r) => ({
    ...r,
    pct_cpc: r.total ? Math.round((1000 * (r.cpc || 0)) / r.total) / 10 : 0,
  }));
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

export function buildNowcast(
  serie: EvaSerieHora[],
  sups: EvaHoraSupervisor[],
  metaVendasMes: number,
  expediente: number,
  dataRef: string,
  horaAtual: string,
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

  const hAtual = Number(horaAtual === 'todas' ? String(new Date().getHours()) : horaAtual);
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
  const nSups = supList.length || 1;
  const sumSucesso = supList.reduce((s, x) => s + x.sucesso, 0);

  const metaDiaSupFor = (s: { supervisor: string; sucesso: number }) => {
    if (sumSucesso > 0) {
      const w = s.sucesso / sumSucesso;
      return Math.round(metaDia * w * 10) / 10;
    }
    return Math.round((metaDia / nSups) * 10) / 10;
  };

  const supRows: NowcastSup[] = supList
    .map((s) => {
      const metaDiaSup = metaDiaSupFor(s);
      const gapSup = Math.round((s.sucesso - (metaDiaSup * horasDecorridas) / expedienteEff) * 10) / 10;
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

export function motivoSourceLabel(source?: string) {
  if (source === 'operador_payload') return 'Operador';
  if (source === 'operador_estimado') return 'Estimado op.';
  if (source === 'supervisor_fallback') return 'Fallback sup.';
  if (source === 'global_fallback') return 'Fallback global';
  return 'Indisponível';
}

export function motivoSourceClass(source?: string) {
  if (source === 'operador_payload') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (source === 'operador_estimado') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (source === 'supervisor_fallback') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (source === 'global_fallback') return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-gray-50 text-gray-500 border-gray-200';
}
