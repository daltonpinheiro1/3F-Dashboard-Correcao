import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  BarChart2,
  Bell,
  BellOff,
  Calendar,
  Clipboard,
  Clock,
  Filter,
  Gauge,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
} from 'recharts';
import { AdminLayout } from '../components/AdminLayout';
import {
  CPC_META,
  calcularPerdas,
  fetchEvaDia,
  fetchEvaLive,
  fetchEvaPeriodo,
  fmtHms,
  fmtPerda,
  isTabNaoCpc,
  matchCampanha,
  type EvaHoraMotivo,
  type EvaHoraOperador,
  type EvaHoraSupervisor,
  type EvaPayload,
  type EvaSerieHora,
} from '../lib/evaDash';
import { jornadaUnicaPorLogin, preverSaida } from '../lib/ofensorOp';
import { filtroEvaAtivo, useFiltroEvaStore } from '../store/filtroStore';
import { metaDoSupervisor, useMetaCpcStore } from '../store/metaCpcStore';

const HORAS = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'];

function horaKey(h: string | number) {
  return String(h).padStart(2, '0').slice(0, 2);
}

function mergeSerie(hist: EvaPayload[]): EvaSerieHora[] {
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

function mergeSup(hist: EvaPayload[]): EvaHoraSupervisor[] {
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

function mergeMotivo(hist: EvaPayload[], field: 'hora_motivo' | 'hora_sup_motivo' = 'hora_motivo'): EvaHoraMotivo[] {
  const acc: Record<string, EvaHoraMotivo & { _tmaW: number; _tmaN: number }> = {};
  for (const p of hist) {
    for (const r of (p[field] || []) as EvaHoraMotivo[]) {
      const k = `${horaKey(r.hora)}|${r.nome}|${r.campanha_op || ''}|${r.supervisor || ''}`;
      if (!acc[k]) acc[k] = { ...r, hora: horaKey(r.hora), total: 0, cpc: 0, pct_cpc: 0, _tmaW: 0, _tmaN: 0 };
      acc[k].total += r.total;
      acc[k].cpc += r.cpc;
      if (r.tma_seg) { acc[k]._tmaW += r.tma_seg * r.total; acc[k]._tmaN += r.total; }
    }
  }
  return Object.values(acc).map(({ _tmaW, _tmaN, ...r }) => ({
    ...r,
    pct_cpc: r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0,
    tma_seg: _tmaN ? Math.round((_tmaW / _tmaN) * 10) / 10 : r.tma_seg,
  }));
}

function mergeOps(hist: EvaPayload[]): EvaHoraOperador[] {
  const acc: Record<string, EvaHoraOperador & { _tmaW: number; _tmaN: number }> = {};
  for (const p of hist) {
    for (const r of p.hora_operador || []) {
      const k = `${horaKey(r.hora)}|${r.login}|${r.campanha_op || ''}`;
      if (!acc[k]) acc[k] = { ...r, hora: horaKey(r.hora), total: 0, cpc: 0, sucesso: 0, pct_cpc: 0, _tmaW: 0, _tmaN: 0 };
      acc[k].total += r.total;
      acc[k].cpc += r.cpc;
      acc[k].sucesso = (acc[k].sucesso || 0) + (r.sucesso || 0);
      if (r.tma_seg) { acc[k]._tmaW += r.tma_seg * r.total; acc[k]._tmaN += r.total; }
    }
  }
  return Object.values(acc).map(({ _tmaW, _tmaN, ...r }) => ({
    ...r,
    pct_cpc: r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0,
    tma_seg: _tmaN ? Math.round((_tmaW / _tmaN) * 10) / 10 : r.tma_seg,
  }));
}

function diasDoMes(dataRef: string) {
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

function diaAtualEhSabado(dataRef: string) {
  return new Date(`${dataRef}T12:00:00`).getDay() === 6;
}

interface NowcastRow {
  hora: string;
  metaAcum: number;
  realizado: number;
  gap: number;
  gapPct: number;
}

interface NowcastSup {
  supervisor: string;
  vendidoAteAgora: number;
  metaDiaSup: number;
  gapSup: number;
  metaRestante: number;
  metaPorHoraRestante: number;
}

function buildNowcast(
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
  const metaHora = expediente > 0 ? Math.round((metaDia / expediente) * 10) / 10 : 0;

  const INICIO = Number(HORAS[0]);
  const vendasPorHora: Record<string, number> = {};
  for (const r of serie) {
    const hh = horaKey(r.hora);
    vendasPorHora[hh] = (vendasPorHora[hh] || 0) + (r.sucesso || 0);
  }

  let acumReal = 0;
  const rows: NowcastRow[] = [];
  for (let i = 0; i < expediente && INICIO + i <= 21; i++) {
    const hh = String(INICIO + i).padStart(2, '0');
    const vendido = vendasPorHora[hh] || 0;
    acumReal += vendido;
    const metaAcum = Math.round(metaHora * (i + 1) * 10) / 10;
    const gap = Math.round((acumReal - metaAcum) * 10) / 10;
    const gapPct = metaAcum > 0 ? Math.round((gap / metaAcum) * 1000) / 10 : 0;
    rows.push({ hora: `${hh}h`, metaAcum, realizado: acumReal, gap, gapPct });
  }

  const vendasTotal = acumReal;
  const hAtual = Number(horaAtual === 'todas' ? String(new Date().getHours()) : horaAtual);
  const horasDecorridas = Math.max(0, Math.min(expediente, hAtual - INICIO + 1));
  const horasRestantes = Math.max(0, expediente - horasDecorridas);
  const metaProjetada = Math.round(metaHora * horasDecorridas * 10) / 10;
  const gapAcum = Math.round((vendasTotal - metaProjetada) * 10) / 10;
  const gapPct = metaProjetada > 0 ? Math.round((gapAcum / metaProjetada) * 1000) / 10 : 0;
  const metaRestanteTotal = Math.max(0, metaDia - vendasTotal);
  const metaHoraRestante = horasRestantes > 0 ? Math.round((metaRestanteTotal / horasRestantes) * 10) / 10 : 0;

  // Meta por supervisor precisa (1) considerar somente o que já ocorreu (horas decorridas)
  // e (2) redistribuir a meta do dia proporcionalmente ao vendido até agora.
  const limiteHoraNum = INICIO + horasDecorridas - 1; // inclusive
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
      const gapSup = Math.round((s.sucesso - (metaDiaSup * horasDecorridas / expediente)) * 10) / 10;
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
    rows, supRows, metaDiaUtil, metaSabado, metaHora, metaDia,
    vendasTotal, gapAcum, gapPct, horasDecorridas, horasRestantes,
    metaRestanteTotal, metaHoraRestante,
  };
}

export function HoraPage() {
  const tab = useFiltroEvaStore((s) => s.tab);
  const setTab = useFiltroEvaStore((s) => s.setTab);
  const campanha = useFiltroEvaStore((s) => s.campanha);
  const setCampanha = useFiltroEvaStore((s) => s.setCampanha);
  const dateFrom = useFiltroEvaStore((s) => s.dateFrom);
  const dateTo = useFiltroEvaStore((s) => s.dateTo);
  const setDateFrom = useFiltroEvaStore((s) => s.setDateFrom);
  const setDateTo = useFiltroEvaStore((s) => s.setDateTo);
  const search = useFiltroEvaStore((s) => s.search);
  const setSearch = useFiltroEvaStore((s) => s.setSearch);
  const limparFiltro = useFiltroEvaStore((s) => s.limpar);
  const filtroOn = filtroEvaAtivo({ tab, campanha, dateFrom, dateTo, search });
  const metaMes = useMetaCpcStore((s) => s.metaMes);
  const metaDia = useMetaCpcStore((s) => s.metaDia);
  const metasSup = useMetaCpcStore((s) => s.metasSup);
  const setMetaMes = useMetaCpcStore((s) => s.setMetaMes);
  const setMetaDia = useMetaCpcStore((s) => s.setMetaDia);
  const setMetaSup = useMetaCpcStore((s) => s.setMetaSup);
  const metaVendasMes = useMetaCpcStore((s) => s.metaVendasMes);
  const setMetaVendasMes = useMetaCpcStore((s) => s.setMetaVendasMes);
  const expedienteHoras = useMetaCpcStore((s) => s.expedienteHoras);
  const setExpedienteHoras = useMetaCpcStore((s) => s.setExpedienteHoras);

  const [data, setData] = useState<EvaPayload | null>(null);
  const [hist, setHist] = useState<EvaPayload[]>([]);
  const [ontem, setOntem] = useState<EvaPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [insight, setInsight] = useState('');
  const [iaErro, setIaErro] = useState('');
  const [iaLoading, setIaLoading] = useState(false);
  const [supDrill, setSupDrill] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const [hora, setHora] = useState(() => {
    const h = String(new Date().getHours()).padStart(2, '0');
    return HORAS.includes(h) ? h : 'todas';
  });

  useEffect(() => { setSupDrill(null); }, [tab, campanha, dateFrom, dateTo, hora]);

  const loadLive = useCallback(async (spin = true) => {
    if (spin) setIsLoading(true);
    setFetchError(null);
    if (!spin) setRefreshing(true);
    try {
      const live = await fetchEvaLive();
      setData(live);
      setLastRefresh(new Date());
      const d = live.data;
      if (d) {
        const prev = new Date(`${d}T00:00:00`);
        prev.setDate(prev.getDate() - 1);
        const y = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
        setOntem(await fetchEvaDia(y));
      }
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Falha no EVA.');
    } finally {
      if (spin) setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadHist = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const { dias } = await fetchEvaPeriodo(dateFrom, dateTo);
      setHist(dias);
      setOntem(null);
      setLastRefresh(new Date());
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Falha no histórico.');
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (tab === 'live') loadLive(true);
    else loadHist();
  }, [tab, loadLive, loadHist]);

  useEffect(() => {
    if (tab !== 'live') return;
    const id = setInterval(() => loadLive(false), 30_000);
    return () => clearInterval(id);
  }, [tab, loadLive]);

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const q = debouncedSearch.trim().toLowerCase();
  const serie = useMemo(() => {
    const rows = tab === 'live' ? data?.serie_hora || [] : mergeSerie(hist);
    return rows.filter((r) => matchCampanha(r, campanha));
  }, [tab, data, hist, campanha]);
  const sups = useMemo(() => {
    const rows = tab === 'live' ? data?.hora_supervisor || [] : mergeSup(hist);
    return rows.filter((r) => {
      if (!matchCampanha(r, campanha)) return false;
      if (hora !== 'todas' && horaKey(r.hora) !== hora) return false;
      if (!q) return true;
      return r.supervisor.toLowerCase().includes(q);
    });
  }, [tab, data, hist, campanha, hora, q]);
  const motivos = useMemo(() => {
    const rows = tab === 'live' ? data?.hora_motivo || [] : mergeMotivo(hist);
    return rows
      .filter((r) => matchCampanha(r, campanha) && (hora === 'todas' || horaKey(r.hora) === hora))
      .sort((a, b) => b.total - a.total);
  }, [tab, data, hist, campanha, hora]);

  const [opViewDia, setOpViewDia] = useState(false);

  const operadoresRaw = useMemo(() => {
    const rows = tab === 'live' ? data?.hora_operador || [] : mergeOps(hist);
    return rows.filter((r) => matchCampanha(r, campanha));
  }, [tab, data, hist, campanha]);

  const operadores = useMemo(() => {
    const filtroHora = opViewDia ? 'todas' : hora;
    // Quando vendo dia todo, agregar por operador (login)
    if (filtroHora === 'todas' && hora !== 'todas') {
      const acc: Record<string, typeof operadoresRaw[0]> = {};
      for (const r of operadoresRaw) {
        if (supDrill && r.supervisor !== supDrill) continue;
        if (q && !`${r.operador} ${r.login} ${r.supervisor}`.toLowerCase().includes(q)) continue;
        const k = `${r.login}|${r.campanha_op || ''}`;
        if (!acc[k]) acc[k] = { ...r, total: 0, cpc: 0, sucesso: 0, pct_cpc: 0 };
        acc[k].total += r.total;
        acc[k].cpc += r.cpc;
        acc[k].sucesso = (acc[k].sucesso || 0) + (r.sucesso || 0);
      }
      return Object.values(acc)
        .map((r) => ({ ...r, pct_cpc: r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0 }))
        .sort((a, b) => a.pct_cpc - b.pct_cpc);
    }
    return operadoresRaw
      .filter((r) => {
        if (filtroHora !== 'todas' && horaKey(r.hora) !== filtroHora) return false;
        if (supDrill && r.supervisor !== supDrill) return false;
        if (q) return `${r.operador} ${r.login} ${r.supervisor}`.toLowerCase().includes(q);
        return true;
      })
      .sort((a, b) => a.pct_cpc - b.pct_cpc);
  }, [operadoresRaw, hora, opViewDia, q, supDrill]);

  const supMotivos = useMemo(() => {
    if (!supDrill) return [];
    const rows = tab === 'live' ? (data?.hora_sup_motivo || []) as EvaHoraMotivo[] : mergeMotivo(hist, 'hora_sup_motivo');
    return rows
      .filter((r) => r.supervisor === supDrill && matchCampanha(r, campanha) && (hora === 'todas' || horaKey(r.hora) === hora))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [supDrill, tab, data, hist, campanha, hora]);

  const jornada = useMemo(() => {
    const rows = tab === 'live' ? data?.jornada || [] : hist.flatMap((h) => h.jornada || []);
    const filtrada = rows.filter((j) => {
      if (!matchCampanha(j, campanha)) return false;
      if (!q) return true;
      return `${j.user_name} ${j.login} ${j.supervisor_name}`.toLowerCase().includes(q);
    });
    return jornadaUnicaPorLogin(filtrada);
  }, [tab, data, hist, campanha, q]);

  const chartHora = useMemo(() => {
    const acc: Record<string, { hora: string; total: number; cpc: number; meta: number }> = {};
    for (const h of HORAS) acc[h] = { hora: `${h}h`, total: 0, cpc: 0, meta: metaDia };
    for (const r of serie) {
      const hh = horaKey(r.hora);
      if (!acc[hh]) continue;
      acc[hh].total += r.total || 0;
      acc[hh].cpc += r.cpc || 0;
    }
    return HORAS.map((h) => {
      const r = acc[h];
      const pct = r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0;
      return { ...r, pct_cpc: pct };
    });
  }, [serie, metaDia]);

  const recorte = useMemo(() => {
    const rows = hora === 'todas' ? serie : serie.filter((r) => horaKey(r.hora) === hora);
    const total = rows.reduce((s, r) => s + (r.total || 0), 0);
    const cpc = rows.reduce((s, r) => s + (r.cpc || 0), 0);
    const sucesso = rows.reduce((s, r) => s + (r.sucesso || 0), 0);
    const pct = total ? Math.round((1000 * cpc) / total) / 10 : 0;
    return { total, cpc, sucesso, pct };
  }, [serie, hora]);

  const ontemRecorte = useMemo(() => {
    const rows = (ontem?.serie_hora || []).filter((r) => matchCampanha(r, campanha));
    const slice = hora === 'todas' ? rows : rows.filter((r) => horaKey(r.hora) === hora);
    const total = slice.reduce((s, r) => s + (r.total || 0), 0);
    const cpc = slice.reduce((s, r) => s + (r.cpc || 0), 0);
    const pct = total ? Math.round((1000 * cpc) / total) / 10 : 0;
    return { total, pct };
  }, [ontem, campanha, hora]);

  const tmaPond = jornada.reduce((s, j) => s + (j.tma_seg || 0) * (j.chamadas || 0), 0);
  const attN = jornada.reduce((s, j) => s + (j.chamadas || 0), 0);
  const tma = attN ? tmaPond / attN : 0;
  const logado = jornada.reduce((s, j) => s + (j.logged_time || 0), 0);
  const pausa = jornada.reduce((s, j) => s + (j.pausa_seg || 0), 0);
  const perdido = jornada.reduce((s, j) => s + (j.tempo_perdido_seg || 0), 0);
  const capacidade = tma > 0 ? logado / tma : 0;
  const ocupacao = capacidade > 0 ? Math.round((1000 * attN) / capacidade) / 10 : 0;
  const perdas = calcularPerdas({
    tempoDeslogueSeg: perdido,
    pausaSeg: pausa,
    logadoSeg: logado,
    tmaSeg: tma,
    tabuladas: recorte.total,
    sucesso: recorte.sucesso,
    vb: jornada.reduce((s, j) => s + (j.vb || 0), 0),
  });
  const totalDia = serie.reduce((s, r) => s + (r.total || 0), 0);
  const pesoHora = recorte.total && totalDia
    ? recorte.total / totalDia
    : hora === 'todas' ? 1 : 0;
  const perdaHora = {
    chamadas: Math.round(perdas.chamadas_perdidas * pesoHora * 10) / 10,
    vendas: Math.round(perdas.vendas_perdidas * pesoHora * 10) / 10,
  };

  const rankingSup = useMemo(() => {
    const acc: Record<string, { supervisor: string; total: number; cpc: number; sucesso: number }> = {};
    for (const r of sups) {
      if (!acc[r.supervisor]) acc[r.supervisor] = { supervisor: r.supervisor, total: 0, cpc: 0, sucesso: 0 };
      acc[r.supervisor].total += r.total;
      acc[r.supervisor].cpc += r.cpc;
      acc[r.supervisor].sucesso += r.sucesso || 0;
    }
    return Object.values(acc)
      .map((r) => {
        const pct = r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0;
        const meta = metaDoSupervisor(metasSup, r.supervisor, metaDia);
        return { ...r, pct_cpc: pct, meta, gap: Math.round((pct - meta) * 10) / 10 };
      })
      .sort((a, b) => a.pct_cpc - b.pct_cpc);
  }, [sups, metasSup, metaDia]);

  const motivosTop = useMemo(
    () =>
      [...motivos]
        .sort((a, b) => {
          const aOut = isTabNaoCpc(a.nome) ? 0 : 1;
          const bOut = isTabNaoCpc(b.nome) ? 0 : 1;
          if (a.pct_cpc !== b.pct_cpc) return a.pct_cpc - b.pct_cpc;
          return b.total - a.total || aOut - bOut;
        })
        .slice(0, 12),
    [motivos],
  );

  const dataRef = data?.data || new Date().toISOString().slice(0, 10);
  const supsAllHours = useMemo(() => {
    const rows = tab === 'live' ? data?.hora_supervisor || [] : mergeSup(hist);
    return rows.filter((r) => matchCampanha(r, campanha));
  }, [tab, data, hist, campanha]);
  const nowcast = useMemo(
    () => buildNowcast(serie, supsAllHours, metaVendasMes, expedienteHoras, dataRef, hora),
    [serie, supsAllHours, metaVendasMes, expedienteHoras, dataRef, hora],
  );

  const chartNowcast = useMemo(() => {
    return nowcast.rows.map((r) => ({
      hora: r.hora,
      meta_acum: r.metaAcum,
      realizado: r.realizado,
      gap: r.gap,
    }));
  }, [nowcast.rows]);

  // ── #1 Alerta inteligente push/som ──
  const [alertaAtivo, setAlertaAtivo] = useState(true);
  const prevGap = useRef(nowcast.gapAcum);
  useEffect(() => {
    if (!alertaAtivo || tab !== 'live' || isLoading) return;
    const GAP_THRESHOLD = -(nowcast.metaHora * 0.5);
    if (nowcast.gapAcum < GAP_THRESHOLD && prevGap.current >= GAP_THRESHOLD) {
      try { new Audio('data:audio/wav;base64,UklGRl9vT19teleHVhdmVmbXQgEAAAAAEAAQBAHwAAQB8AAEABCAA=').play().catch(() => {}); } catch {}
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Gap de vendas crítico', { body: `Gap: ${nowcast.gapAcum} un. (${nowcast.gapPct}%)`, icon: '/logo-3f-oficial.png' });
      }
    }
    prevGap.current = nowcast.gapAcum;
  }, [nowcast.gapAcum, nowcast.metaHora, nowcast.gapPct, alertaAtivo, tab, isLoading]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }, []);

  // ── #2 Heatmap Supervisor × Hora ──
  const heatmapData = useMemo(() => {
    const rows = tab === 'live' ? data?.hora_supervisor || [] : mergeSup(hist);
    const filtered = rows.filter((r) => matchCampanha(r, campanha));
    const supSet = new Set<string>();
    const acc: Record<string, number> = {};
    for (const r of filtered) {
      const hh = horaKey(r.hora);
      supSet.add(r.supervisor);
      const k = `${r.supervisor}|${hh}`;
      acc[k] = (acc[k] || 0) + (r.sucesso || 0);
    }
    const supervisors = [...supSet].sort();
    return { supervisors, acc };
  }, [tab, data, hist, campanha]);

  // ── #3 Velocímetro (gauge) de conversão ──
  const conversao = recorte.total > 0 ? Math.round((recorte.sucesso / recorte.total) * 1000) / 10 : 0;

  // ── #4 Forecast de fechamento (3 cenários) ──
  const forecast = useMemo(() => {
    const vendasPorH: number[] = [];
    for (const h of HORAS) {
      const total = serie.filter((r) => horaKey(r.hora) === h).reduce((s, r) => s + (r.sucesso || 0), 0);
      if (total > 0) vendasPorH.push(total);
    }
    if (!vendasPorH.length) return null;
    const avg = vendasPorH.reduce((a, b) => a + b, 0) / vendasPorH.length;
    const best = Math.max(...vendasPorH);
    const worst = Math.min(...vendasPorH);
    const last2 = vendasPorH.slice(-2);
    const recent = last2.length ? last2.reduce((a, b) => a + b, 0) / last2.length : avg;
    const rest = nowcast.horasRestantes;
    const atual = nowcast.vendasTotal;
    return {
      otimista: Math.round(atual + best * rest),
      realista: Math.round(atual + recent * rest),
      pessimista: Math.round(atual + worst * rest),
      meta: nowcast.metaDia,
    };
  }, [serie, nowcast]);

  // ── #5 Leaderboard operadores (top vendedores) ──
  const leaderboard = useMemo(() => {
    const ops = tab === 'live' ? data?.hora_operador || [] : mergeOps(hist);
    const acc: Record<string, { operador: string; supervisor: string; vendas: number; total: number }> = {};
    for (const o of ops) {
      if (!matchCampanha(o, campanha)) continue;
      if (!acc[o.login]) acc[o.login] = { operador: o.operador, supervisor: o.supervisor, vendas: 0, total: 0 };
      acc[o.login].vendas += o.sucesso || 0;
      acc[o.login].total += o.total;
    }
    return Object.values(acc).sort((a, b) => b.vendas - a.vendas).slice(0, 8);
  }, [tab, data, hist, campanha]);

  // ── #6 Funil por tabulação ──
  const funnel = useMemo(() => {
    const tab_total = recorte.total;
    const cpc_total = recorte.cpc;
    const sucesso_total = recorte.sucesso;
    const vb_total = jornada.reduce((s, j) => s + (j.vb || 0), 0);
    const aprov = jornada.reduce((s, j) => s + (j.aprovadas || 0), 0);
    return [
      { etapa: 'Tabuladas', valor: tab_total, pct: 100 },
      { etapa: 'CPC', valor: cpc_total, pct: tab_total ? Math.round((cpc_total / tab_total) * 1000) / 10 : 0 },
      { etapa: 'Sucesso', valor: sucesso_total, pct: tab_total ? Math.round((sucesso_total / tab_total) * 1000) / 10 : 0 },
      { etapa: 'VB', valor: vb_total, pct: tab_total ? Math.round((vb_total / tab_total) * 1000) / 10 : 0 },
      { etapa: 'Aprovadas', valor: aprov, pct: tab_total ? Math.round((aprov / tab_total) * 1000) / 10 : 0 },
    ];
  }, [recorte, jornada]);

  // ── #8 Alertas de jornada ──
  const jornadaAlerts = useMemo(() => {
    if (tab !== 'live') return { emRisco: 0, atrasados: 0, perdaEstimada: 0 };
    const agora = new Date();
    let emRisco = 0;
    let atrasados = 0;
    for (const j of jornada) {
      const saida = preverSaida(j, agora);
      if (saida.atrasada) atrasados++;
      else if (saida.emAndamento && saida.faltaLogado > 3600) emRisco++;
    }
    const tmaM = tma > 0 ? tma : 180;
    const perdaEstimada = Math.round(((emRisco + atrasados) * 1800) / tmaM * conversao / 100 * 10) / 10;
    return { emRisco, atrasados, perdaEstimada };
  }, [tab, jornada, tma, conversao]);

  // ── #9 Comparativo semanal (sparklines data) ──
  const [weekHist, setWeekHist] = useState<{ dia: string; vendas: number; cpc: number }[]>([]);
  const weekFetched = useRef('');
  useEffect(() => {
    if (tab !== 'live' || !data?.data || weekFetched.current === data.data) return;
    weekFetched.current = data.data;
    const today = new Date(`${data.data}T12:00:00`);
    const promises: Promise<{ dia: string; vendas: number; cpc: number } | null>[] = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      promises.push(
        fetchEvaDia(iso).then((p) => {
          if (!p) return null;
          const v = (p.serie_hora || []).reduce((s, r) => s + (r.sucesso || 0), 0);
          const t = (p.serie_hora || []).reduce((s, r) => s + (r.total || 0), 0);
          const c = (p.serie_hora || []).reduce((s, r) => s + (r.cpc || 0), 0);
          return { dia: iso.slice(5), vendas: v, cpc: t ? Math.round((c / t) * 1000) / 10 : 0 };
        }),
      );
    }
    Promise.all(promises).then((results) => {
      setWeekHist((results.filter(Boolean) as { dia: string; vendas: number; cpc: number }[]).sort((a, b) => a.dia.localeCompare(b.dia)));
    });
  }, [tab, data?.data]);
  const weekData = useMemo(() => {
    const out = [...weekHist];
    if (data?.data) out.push({ dia: data.data.slice(5) + ' (hoje)', vendas: nowcast.vendasTotal, cpc: recorte.pct });
    return out;
  }, [weekHist, data?.data, nowcast.vendasTotal, recorte.pct]);

  // ── #11 Meta por campanha ──
  const cpcPorCamp = useMemo(() => {
    const port = serie.filter((r) => r.campanha_op === 'PORTABILIDADE');
    const mig = serie.filter((r) => r.campanha_op === 'MIGRACAO');
    const calc = (rows: EvaSerieHora[]) => {
      const t = rows.reduce((s, r) => s + (r.total || 0), 0);
      const c = rows.reduce((s, r) => s + (r.cpc || 0), 0);
      const v = rows.reduce((s, r) => s + (r.sucesso || 0), 0);
      return { total: t, cpc: c, vendas: v, pct: t ? Math.round((c / t) * 1000) / 10 : 0 };
    };
    return { port: calc(port), mig: calc(mig) };
  }, [serie]);

  // ── #12 Correlação TMA × Conversão ──
  const scatterTma = useMemo(() => {
    const ops = tab === 'live' ? data?.hora_operador || [] : mergeOps(hist);
    const acc: Record<string, { tma: number; conv: number; total: number; nome: string }> = {};
    for (const o of ops) {
      if (!matchCampanha(o, campanha) || !o.tma_seg || o.total < 3) continue;
      if (!acc[o.login]) acc[o.login] = { tma: 0, conv: 0, total: 0, nome: o.operador };
      acc[o.login].tma = o.tma_seg;
      acc[o.login].total += o.total;
      acc[o.login].conv += o.sucesso || 0;
    }
    return Object.values(acc)
      .filter((a) => a.total >= 3)
      .map((a) => ({ tma: Math.round(a.tma), conv: a.total ? Math.round((a.conv / a.total) * 1000) / 10 : 0, nome: a.nome }));
  }, [tab, data, hist, campanha]);

  // ── #14 Monte Carlo previsão mensal ──
  const monteCarlo = useMemo(() => {
    if (weekData.length < 3) return null;
    const vendas = weekData.map((d) => d.vendas).filter((v) => v > 0);
    if (vendas.length < 2) return null;
    const mean = vendas.reduce((a, b) => a + b, 0) / vendas.length;
    const stdDev = Math.sqrt(vendas.reduce((a, b) => a + (b - mean) ** 2, 0) / vendas.length);
    const hoje = new Date(`${dataRef}T12:00:00`);
    const y = hoje.getFullYear();
    const m = hoje.getMonth();
    const ultimoDia = new Date(y, m + 1, 0).getDate();
    const diaDoMes = hoje.getDate();
    let diasRestantes = 0;
    for (let i = diaDoMes + 1; i <= ultimoDia; i++) {
      if (new Date(y, m, i).getDay() === 0) continue;
      diasRestantes++;
    }
    const acumMes = nowcast.vendasTotal;
    const sims = 500;
    let above = 0;
    for (let s = 0; s < sims; s++) {
      let total = acumMes;
      for (let d = 0; d < diasRestantes; d++) {
        const r = mean + stdDev * (Math.random() + Math.random() + Math.random() - 1.5) * 0.8165;
        total += Math.max(0, r);
      }
      if (total >= metaVendasMes) above++;
    }
    return { probabilidade: Math.round((above / sims) * 100), diasRestantes, acumMes, mediaDia: Math.round(mean) };
  }, [weekData, dataRef, metaVendasMes, nowcast.vendasTotal]);

  // ── #10 Copiar relatório ──
  const copiarRelatorio = () => {
    const lines = [
      `📊 RELATÓRIO HORA A HORA — ${dataRef}`,
      `Campanha: ${campanha} | Horário: ${hora === 'todas' ? 'Dia' : hora + 'h'}`,
      '',
      `▸ CPC: ${recorte.pct.toFixed(1)}% (meta ${metaDia}%) | ${recorte.cpc}/${recorte.total} tab.`,
      `▸ Vendas: ${nowcast.vendasTotal} un. | Meta dia: ${nowcast.metaDia} | Gap: ${nowcast.gapAcum}`,
      `▸ Ritmo necessário: ${nowcast.metaHoraRestante} un./h (${nowcast.horasRestantes}h restantes)`,
      `▸ Ocupação: ${ocupacao.toFixed(0)}% | TMA: ${fmtHms(tma)}`,
      `▸ Perdas: ${fmtPerda(perdas.vendas_perdidas)} vendas | ${fmtPerda(perdas.chamadas_perdidas)} chamadas`,
      '',
      '🏆 SUPERVISORES:',
      ...rankingSup.slice(0, 5).map((s) => `  ${s.supervisor}: CPC ${s.pct_cpc.toFixed(1)}% | ${s.sucesso} vendas | gap ${s.gap.toFixed(1)} p.p.`),
      '',
      forecast ? `📈 FORECAST: Otimista ${forecast.otimista} | Realista ${forecast.realista} | Pessimista ${forecast.pessimista} (meta ${forecast.meta})` : '',
      monteCarlo ? `🎲 PREVISÃO MENSAL: ${monteCarlo.probabilidade}% de chance de bater ${metaVendasMes} un.` : '',
      '',
      insight ? `🤖 INSIGHT IA:\n${insight}` : '',
    ].filter(Boolean);
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const [copied, setCopied] = useState(false);

  const pedirInsight = async () => {
    setIaLoading(true);
    setIaErro('');
    setInsight('');
    try {
      const r = await fetch('/api/hora-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recorte: hora === 'todas' ? 'dia' : `${hora}h`,
          campanha,
          meta_mes: metaMes,
          meta_dia: metaDia,
          cpc: recorte,
          vs_ontem: ontemRecorte,
          ocupacao_pct: ocupacao,
          capacidade_teorica: Math.round(capacidade),
          perdas_intervalo: perdaHora,
          supervisores: rankingSup.slice(0, 8),
          motivos: motivosTop.slice(0, 8).map((m) => ({ nome: m.nome, total: m.total, pct_cpc: m.pct_cpc })),
          serie: chartHora,
          nowcasting: {
            meta_vendas_mes: metaVendasMes,
            meta_dia: nowcast.metaDia,
            meta_hora: nowcast.metaHora,
            vendas_ate_agora: nowcast.vendasTotal,
            gap_acum: nowcast.gapAcum,
            gap_pct: nowcast.gapPct,
            horas_restantes: nowcast.horasRestantes,
            meta_restante_total: nowcast.metaRestanteTotal,
            meta_hora_restante: nowcast.metaHoraRestante,
            redistribuicao_sup: nowcast.supRows.slice(0, 6).map((s) => ({
              supervisor: s.supervisor,
              vendido: s.vendidoAteAgora,
              gap: s.gapSup,
              meta_restante: s.metaRestante,
              meta_hora_restante: s.metaPorHoraRestante,
            })),
          },
          forecast: forecast ? { otimista: forecast.otimista, realista: forecast.realista, pessimista: forecast.pessimista } : null,
          monte_carlo: monteCarlo ? { probabilidade_pct: monteCarlo.probabilidade } : null,
          coaching_operadores: operadores.slice(0, 5).map((o) => ({ nome: o.operador, cpc: o.pct_cpc, tma: o.tma_seg, motivo: o.motivo })),
          funil: funnel.map((f) => ({ etapa: f.etapa, valor: f.valor, pct: f.pct })),
          jornada_alertas: tab === 'live' ? jornadaAlerts : null,
          tendencia_semanal: weekData.slice(-3).map((d) => ({ dia: d.dia, vendas: d.vendas, cpc: d.cpc })),
        }),
      });
      const j = (await r.json()) as { texto?: string; error?: string };
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setInsight(j.texto || 'Sem texto.');
    } catch (e: unknown) {
      setIaErro(e instanceof Error ? e.message : 'Falha na IA.');
    } finally {
      setIaLoading(false);
    }
  };

  const down = recorte.total >= 8 && recorte.pct < metaDia;

  return (
    <AdminLayout
      title="Hora a hora"
      subtitle="Visão gerencial ADM · reunião de intervalo · meta CPC ≥ 65% em todos os produtos"
    >
      <div className="card p-4 shadow-sm mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <Seg value={tab} onChange={setTab} options={[{ id: 'live', label: 'Realtime' }, { id: 'hist', label: 'Histórico' }]} />
          <Seg
            value={campanha}
            onChange={setCampanha}
            options={[
              { id: 'TODAS', label: 'Todas' },
              { id: 'PORTABILIDADE', label: 'Portabilidade' },
              { id: 'MIGRACAO', label: 'Migração Pré' },
            ]}
          />
          {tab === 'hist' && (
            <>
              <Calendar size={14} className="text-gray-400" />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field text-sm py-2 w-36" />
              <span className="text-xs text-gray-400">até</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field text-sm py-2 w-36" />
            </>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Gestor ou operador" className="input-field text-sm py-2 pl-8 w-52" />
          </div>
          {filtroOn && (
            <button type="button" onClick={limparFiltro} className="text-xs font-semibold text-red-600 flex items-center gap-1">
              <X size={12} /> Limpar filtros
            </button>
          )}
          {tab === 'live' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium ml-2">
              <span className={`w-2 h-2 rounded-full ${refreshing ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-400'}`} />
              Auto 30s · {lastRefresh.toLocaleTimeString('pt-BR')}
            </span>
          )}
          <button type="button" onClick={() => (tab === 'live' ? loadLive(true) : loadHist())} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3 ml-auto">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <button type="button" onClick={() => setHora('todas')} aria-label="Ver dia inteiro" aria-pressed={hora === 'todas'} className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${hora === 'todas' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            Dia
          </button>
          {HORAS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHora(h)}
              aria-label={`Filtrar hora ${h}`}
              aria-pressed={hora === h}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${hora === h ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {fetchError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{fetchError}</div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="card h-24 skeleton" />)}</div>
          <div className="card h-48 skeleton" />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{[1, 2].map((i) => <div key={i} className="card h-64 skeleton" />)}</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Kpi label={hora === 'todas' ? 'Tabuladas no dia' : `Tabuladas ${hora}h`} value={recorte.total} icon={Clock} />
            <Kpi
              label="CPC do intervalo"
              value={`${recorte.pct.toFixed(1)}%`}
              warn={down}
              icon={Target}
              sub={`meta dia ${metaDia}% · ${recorte.cpc}/${recorte.total}`}
            />
            <Kpi
              label="vs ontem"
              value={ontemRecorte.total ? `${(recorte.pct - ontemRecorte.pct).toFixed(1)} p.p.` : '—'}
              icon={TrendingDown}
              sub={ontemRecorte.total ? `ontem ${ontemRecorte.pct}% · vol ${ontemRecorte.total}` : 'sem D-1'}
            />
            <Kpi
              label="Ocupação"
              value={`${ocupacao.toFixed(0)}%`}
              icon={Gauge}
              sub={`cap. ${Math.round(capacidade)} · TMA ${fmtHms(tma)}`}
            />
            <Kpi
              label="Perda no intervalo"
              value={fmtPerda(perdaHora.vendas)}
              warn={perdaHora.vendas >= 0.5}
              icon={AlertCircle}
              sub={`${fmtPerda(perdaHora.chamadas)} cham. est.`}
            />
          </div>

          {/* ─── NOWCASTING DE VENDAS ─── */}
          <div className="card p-5 shadow-sm mb-6 border-l-4 border-amber-400">
            <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2"><BarChart2 size={14} className="text-amber-600" /> Nowcasting de Vendas (Qtd.)</h3>
            <p className="text-xs text-gray-400 mb-4">
              Meta mensal {metaVendasMes} un. · Meta dia {nowcast.metaDia} un. ({diaAtualEhSabado(dataRef) ? 'sábado ×0,5' : 'dia útil ×1,0'}) · {nowcast.metaHora} un./hora · Expediente {expedienteHoras}h
            </p>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
              <MiniKpi label="Vendas realizadas" value={nowcast.vendasTotal} />
              <MiniKpi label="Meta projetada agora" value={Math.round(nowcast.metaHora * nowcast.horasDecorridas * 10) / 10} sub={`${nowcast.horasDecorridas}h decorridas`} />
              <MiniKpi
                label="Gap acumulado"
                value={`${nowcast.gapAcum > 0 ? '+' : ''}${nowcast.gapAcum} un.`}
                warn={nowcast.gapAcum < 0}
                sub={`${nowcast.gapPct > 0 ? '+' : ''}${nowcast.gapPct}%`}
              />
              <MiniKpi
                label="Meta restante"
                value={`${nowcast.metaRestanteTotal} un.`}
                warn={nowcast.metaRestanteTotal > nowcast.metaDia * 0.6}
                sub={`${nowcast.horasRestantes}h restantes`}
              />
              <MiniKpi
                label="Ritmo necessário"
                value={`${nowcast.metaHoraRestante} un./h`}
                warn={nowcast.metaHoraRestante > nowcast.metaHora * 1.3}
                sub={`baseline ${nowcast.metaHora} un./h`}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Projeção hora a hora (acumulado)</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartNowcast} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="hora" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line dataKey="meta_acum" name="Meta acum." stroke="#dc2626" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                      <Bar dataKey="realizado" name="Vendas acum." fill="#34d399" radius={[4, 4, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Tabela hora a hora</p>
                <div className="overflow-x-auto max-h-52 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1">Hora</th>
                        <th className="text-right px-2 py-1">Meta acum.</th>
                        <th className="text-right px-2 py-1">Realizado</th>
                        <th className="text-right px-2 py-1">Gap</th>
                        <th className="text-right px-2 py-1">Gap%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nowcast.rows.map((r) => (
                        <tr key={r.hora} className={`border-t border-gray-50 ${r.gap < 0 ? 'bg-red-50/50' : r.gap > 0 ? 'bg-emerald-50/50' : ''}`}>
                          <td className="px-2 py-1 font-medium">{r.hora}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{r.metaAcum}</td>
                          <td className="px-2 py-1 text-right tabular-nums font-bold">{r.realizado}</td>
                          <td className={`px-2 py-1 text-right tabular-nums font-bold ${r.gap < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{r.gap > 0 ? '+' : ''}{r.gap}</td>
                          <td className={`px-2 py-1 text-right tabular-nums ${r.gap < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{r.gapPct > 0 ? '+' : ''}{r.gapPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Redistribuição de meta por supervisor */}
          {nowcast.supRows.length > 0 && (
            <div className="card shadow-sm overflow-hidden mb-6 border-l-4 border-amber-400">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><TrendingUp size={14} className="text-amber-600" /> Redistribuição de meta de vendas por supervisor</h3>
                <p className="text-xs text-gray-400">Meta restante para fechar o dia + gap · nova meta/hora para as {nowcast.horasRestantes}h restantes</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2">Supervisor</th>
                      <th className="text-right px-3 py-2">Vendido</th>
                      <th className="text-right px-3 py-2">Meta dia</th>
                      <th className="text-right px-3 py-2">Gap</th>
                      <th className="text-right px-3 py-2">Faltam</th>
                      <th className="text-right px-3 py-2">un./hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nowcast.supRows.map((s) => (
                      <tr key={s.supervisor} className={`border-t border-gray-50 ${s.gapSup < 0 ? 'bg-red-50/40' : ''}`}>
                        <td className="px-4 py-2 font-medium">{s.supervisor}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">{s.vendidoAteAgora}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.metaDiaSup}</td>
                        <td className={`px-3 py-2 text-right font-bold ${s.gapSup < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{s.gapSup > 0 ? '+' : ''}{s.gapSup}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.metaRestante}</td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums ${s.metaPorHoraRestante > nowcast.metaHora / (nowcast.supRows.length || 1) * 1.3 ? 'text-red-600' : 'text-teal-700'}`}>{s.metaPorHoraRestante}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card p-5 shadow-sm mb-6">
            <h3 className="text-sm font-bold text-gray-800 mb-1">CPC hora a hora · meta do dia {metaDia}%</h3>
            <p className="text-xs text-gray-400 mb-3">Linha da meta · barras de volume · filtros de data/campanha/gestor recalculam o gráfico</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartHora} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hora" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 100]} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="r" dataKey="total" name="Tabuladas" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="l" dataKey="pct_cpc" name="CPC%" stroke="#0f766e" strokeWidth={2} dot={false} />
                  <Line yAxisId="l" dataKey="meta" name="Meta" stroke="#dc2626" strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <div className="card shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Supervisores ofensores no intervalo</h3>
                <p className="text-xs text-gray-400">Pior CPC primeiro · meta individual ou meta do dia</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2">Supervisor</th>
                      <th className="text-right px-3 py-2">Tab.</th>
                      <th className="text-right px-3 py-2">CPC%</th>
                      <th className="text-right px-3 py-2">Meta</th>
                      <th className="text-right px-3 py-2">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingSup.map((s) => (
                      <tr key={s.supervisor} onClick={() => setSupDrill(supDrill === s.supervisor ? null : s.supervisor)} className={`border-t border-gray-50 cursor-pointer hover:bg-gray-50 ${s.pct_cpc < s.meta ? 'bg-red-50/40' : ''} ${supDrill === s.supervisor ? 'ring-2 ring-indigo-400' : ''}`}>
                        <td className="px-4 py-2 font-medium">{s.supervisor}</td>
                        <td className="px-3 py-2 text-right">{s.total}</td>
                        <td className={`px-3 py-2 text-right font-bold ${s.pct_cpc < s.meta ? 'text-red-600' : 'text-teal-700'}`}>{s.pct_cpc.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right">{s.meta}%</td>
                        <td className={`px-3 py-2 text-right ${s.gap < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{s.gap.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Tabulações · onde perdeu CPC</h3>
                <p className="text-xs text-gray-400">Volume · CPC% · TMA médio · n/CPC em cinza</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2">Tabulação</th>
                      <th className="text-right px-3 py-2">Vol.</th>
                      <th className="text-right px-3 py-2">CPC%</th>
                      <th className="text-right px-3 py-2">TMA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {motivosTop.map((m) => (
                      <tr key={`${m.hora}-${m.nome}-${m.campanha_op}`} className="border-t border-gray-50">
                        <td className="px-4 py-2 truncate max-w-[200px]">{m.nome}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.total}</td>
                        <td className={`px-3 py-2 text-right font-bold tabular-nums ${isTabNaoCpc(m.nome) ? 'text-gray-400' : m.pct_cpc < metaDia ? 'text-red-600' : 'text-teal-700'}`}>
                          {m.pct_cpc.toFixed(1)}%{isTabNaoCpc(m.nome) ? ' n/CPC' : ''}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-600">{m.tma_seg ? fmtHms(m.tma_seg) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Decomposição de perdas */}
          <div className="card p-5 shadow-sm mb-6">
            <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2"><AlertCircle size={14} /> Decomposição de perdas estimadas</h3>
            <p className="text-xs text-gray-400 mb-3">Tempo improdutivo × TMA → chamadas e vendas que a operação deixou de entregar</p>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 text-center">
              <MiniKpi label="Deslogue" value={fmtHms(perdas.tempo_deslogue_seg)} sub="seg improdutivos" />
              <MiniKpi label="Pausa excedente" value={fmtHms(perdas.tempo_pausa_excedente_seg)} sub={`pausa tot. ${fmtHms(pausa)}`} />
              <MiniKpi label="Tempo total perdido" value={fmtHms(perdas.tempo_total_seg)} warn={perdas.tempo_total_seg > 1800} />
              <MiniKpi label="TMA médio" value={fmtHms(perdas.tma_seg)} />
              <MiniKpi label="Cham. perdidas" value={fmtPerda(perdas.chamadas_perdidas)} warn={perdas.chamadas_perdidas >= 5} />
              <MiniKpi label="Vendas perdidas" value={fmtPerda(perdas.vendas_perdidas)} warn={perdas.vendas_perdidas >= 0.5} sub={`conv ${perdas.conversao_pct}%`} />
              <MiniKpi label="VB perdidas" value={fmtPerda(perdas.vb_perdidas)} warn={perdas.vb_perdidas >= 0.5} sub={`conv VB ${perdas.conversao_vb_pct}%`} />
            </div>
          </div>

          {/* Drill-down do supervisor */}
          {supDrill && (
            <div className="card p-5 shadow-sm mb-6 border-l-4 border-indigo-500">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-800">Drill-down: {supDrill}</h3>
                <button type="button" onClick={() => setSupDrill(null)} className="text-xs text-red-600 flex items-center gap-1"><X size={12} /> Fechar</button>
              </div>
              {(() => {
                const row = nowcast.supRows.find((s) => s.supervisor === supDrill);
                if (!row) return null;
                const gapLbl = `${row.gapSup > 0 ? '+' : ''}${row.gapSup}`;
                return (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <MiniKpi label="Vendido" value={row.vendidoAteAgora} sub="até agora" />
                    <MiniKpi label="Meta dia" value={row.metaDiaSup} sub="intervalo" />
                    <MiniKpi label="Gap" value={gapLbl} warn={row.gapSup < 0} />
                    <MiniKpi label="Faltam" value={row.metaRestante} sub="meta restante" />
                    <MiniKpi label="un./hora" value={row.metaPorHoraRestante} sub="ritmo p/ fechar" />
                  </div>
                );
              })()}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Operadores do supervisor</p>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-1.5">Operador</th>
                          <th className="text-right px-3 py-1.5">Tab.</th>
                          <th className="text-right px-3 py-1.5">CPC%</th>
                          <th className="text-right px-3 py-1.5">TMA</th>
                          <th className="text-left px-3 py-1.5">Motivo principal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operadores.filter((o) => o.supervisor === supDrill).slice(0, 20).map((o) => (
                          <tr key={`${o.login}-${o.hora}`} className="border-t border-gray-50">
                            <td className="px-3 py-1.5 truncate max-w-[140px]">{o.operador}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{o.total}</td>
                            <td className={`px-3 py-1.5 text-right font-bold ${o.pct_cpc < metaDia ? 'text-red-600' : 'text-teal-700'}`}>{o.pct_cpc.toFixed(1)}%</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{o.tma_seg ? fmtHms(o.tma_seg) : '—'}</td>
                            <td className="px-3 py-1.5 text-xs text-gray-500 truncate max-w-[140px]">{o.motivo ? `${o.motivo} (${o.motivo_n || 0})` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Top motivos do supervisor</p>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-1.5">Tabulação</th>
                          <th className="text-right px-3 py-1.5">Vol.</th>
                          <th className="text-right px-3 py-1.5">CPC%</th>
                          <th className="text-right px-3 py-1.5">TMA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {supMotivos.map((m) => (
                          <tr key={`${m.hora}-${m.nome}`} className="border-t border-gray-50">
                            <td className="px-3 py-1.5 truncate max-w-[160px]">{m.nome}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{m.total}</td>
                            <td className={`px-3 py-1.5 text-right font-bold ${isTabNaoCpc(m.nome) ? 'text-gray-400' : m.pct_cpc < metaDia ? 'text-red-600' : 'text-teal-700'}`}>
                              {m.pct_cpc.toFixed(1)}%{isTabNaoCpc(m.nome) ? ' n/CPC' : ''}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{m.tma_seg ? fmtHms(m.tma_seg) : '—'}</td>
                          </tr>
                        ))}
                        {supMotivos.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-center text-gray-400 text-xs">Sem dados hora_sup_motivo no payload</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Operadores ofensores do intervalo */}
          <div className="card shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Operadores ofensores · {opViewDia && hora !== 'todas' ? 'dia todo' : hora === 'todas' ? 'dia' : `${hora}h`}</h3>
                <p className="text-xs text-gray-400">Pior CPC primeiro · motivo principal · TMA individual{supDrill ? ` · filtrado por ${supDrill}` : ''}</p>
              </div>
              {hora !== 'todas' && (
                <Seg
                  value={opViewDia ? 'dia' : 'hora'}
                  onChange={(v) => setOpViewDia(v === 'dia')}
                  options={[{ id: 'hora', label: `${hora}h` }, { id: 'dia', label: 'Dia todo' }]}
                />
              )}
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">Operador</th>
                    <th className="text-left px-3 py-2">Supervisor</th>
                    <th className="text-right px-3 py-2">Tab.</th>
                    <th className="text-right px-3 py-2">CPC%</th>
                    <th className="text-right px-3 py-2">TMA</th>
                    <th className="text-left px-3 py-2">Motivo principal</th>
                    <th className="text-right px-3 py-2">Mot.%</th>
                  </tr>
                </thead>
                <tbody>
                  {operadores.slice(0, 30).map((o) => (
                    <tr key={`${o.login}-${o.hora}-${o.campanha_op}`} className={`border-t border-gray-50 ${o.total >= 5 && o.pct_cpc < metaDia ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-2 font-medium truncate max-w-[160px]">{o.operador}</td>
                      <td className="px-3 py-2 text-gray-500 truncate max-w-[120px]">{o.supervisor}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{o.total}</td>
                      <td className={`px-3 py-2 text-right font-bold ${o.total >= 5 && o.pct_cpc < metaDia ? 'text-red-600' : 'text-teal-700'}`}>{o.pct_cpc.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{o.tma_seg ? fmtHms(o.tma_seg) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[160px]">{o.motivo || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{o.motivo_pct ? `${o.motivo_pct}%` : ''}</td>
                    </tr>
                  ))}
                  {operadores.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center">
                        <Users size={28} className="mx-auto mb-2 text-gray-300" />
                        <p className="text-sm text-gray-400">Sem dados de operadores para o intervalo selecionado</p>
                        <p className="text-xs text-gray-300 mt-1">
                          {tab === 'live'
                            ? "No Realtime, o payload pode ainda não ter gerado `hora_operador` para este recorte. Tente 'Dia' ou aguarde o próximo auto-refresh."
                            : 'Ajuste o filtro de hora ou campanha'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <div className="card p-5 shadow-sm">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Target size={14} /> Metas CPC (desdobramento)</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <label className="text-xs text-gray-500">
                  Meta mês %
                  <input type="number" min={1} max={100} step={0.1} value={metaMes} onChange={(e) => setMetaMes(Number(e.target.value))} className="input-field mt-1 w-full text-sm" />
                </label>
                <label className="text-xs text-gray-500">
                  Meta dia %
                  <input type="number" min={1} max={100} step={0.1} value={metaDia} onChange={(e) => setMetaDia(Number(e.target.value))} className="input-field mt-1 w-full text-sm" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <label className="text-xs text-gray-500">
                  Meta vendas/mês (un.)
                  <input type="number" min={1} step={100} value={metaVendasMes} onChange={(e) => setMetaVendasMes(Number(e.target.value))} className="input-field mt-1 w-full text-sm" />
                </label>
                <label className="text-xs text-gray-500">
                  Expediente (horas)
                  <input type="number" min={4} max={14} step={1} value={expedienteHoras} onChange={(e) => setExpedienteHoras(Number(e.target.value))} className="input-field mt-1 w-full text-sm" />
                </label>
              </div>
              <p className="text-[11px] text-gray-400 mb-2">Piso de produto {CPC_META}%. Supervisor herda a meta do dia se vazio.</p>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {rankingSup.map((s) => (
                  <div key={s.supervisor} className="flex items-center gap-2">
                    <Users size={12} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-700 flex-1 truncate">{s.supervisor}</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={0.1}
                      value={metasSup[s.supervisor] ?? metaDia}
                      onChange={(e) => setMetaSup(s.supervisor, Number(e.target.value))}
                      className="input-field text-xs py-1 w-20"
                      aria-label={`Meta ${s.supervisor}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Sparkles size={14} /> Insight IA · Diagnóstico + Coaching + Padrões</h3>
                  <p className="text-xs text-gray-400">gpt-4o-mini · diagnóstico, nowcasting, coaching operadores, padrões, resumo executivo</p>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={pedirInsight} disabled={iaLoading} className="btn-secondary text-xs py-2 px-3">
                    {iaLoading ? 'Gerando…' : 'Gerar plano completo'}
                  </button>
                </div>
              </div>
              {iaErro && <p className="text-sm text-red-600 mb-2">{iaErro}</p>}
              {insight ? (
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{insight}</pre>
              ) : (
                <p className="text-sm text-gray-400">Gera diagnóstico, ofensores, coaching por operador, padrões da operação, nowcasting e resumo executivo para copiar.</p>
              )}
            </div>
          </div>
          {/* ─── #1 Alert toggle + #10 Copiar ─── */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button type="button" onClick={() => setAlertaAtivo(!alertaAtivo)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border ${alertaAtivo ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
              {alertaAtivo ? <Bell size={13} /> : <BellOff size={13} />}
              {alertaAtivo ? 'Alertas ativos' : 'Alertas desligados'}
            </button>
            <button type="button" onClick={copiarRelatorio} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100">
              <Clipboard size={13} />
              {copied ? 'Copiado!' : 'Copiar relatório'}
            </button>
          </div>

          {/* ─── #4 Forecast + #3 Gauge + #8 Jornada + #14 Monte Carlo ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {forecast && (
              <>
                <div className="card p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase text-gray-400 flex items-center gap-1"><TrendingUp size={12} /> Forecast otimista</p>
                  <p className={`text-2xl font-black ${forecast.otimista >= forecast.meta ? 'text-emerald-700' : 'text-gray-900'}`}>{forecast.otimista}</p>
                  <p className="text-[11px] text-gray-500">meta {forecast.meta} · melhor ritmo</p>
                </div>
                <div className="card p-4 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase text-gray-400 flex items-center gap-1"><Target size={12} /> Forecast realista</p>
                  <p className={`text-2xl font-black ${forecast.realista >= forecast.meta ? 'text-emerald-700' : 'text-red-600'}`}>{forecast.realista}</p>
                  <p className="text-[11px] text-gray-500">meta {forecast.meta} · últimas 2h</p>
                </div>
              </>
            )}
            <div className="card p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase text-gray-400 flex items-center gap-1"><Gauge size={12} /> Conversão</p>
              <p className={`text-2xl font-black ${conversao >= 5 ? 'text-emerald-700' : conversao >= 2 ? 'text-amber-600' : 'text-red-600'}`}>{conversao}%</p>
              <p className="text-[11px] text-gray-500">sucesso / tabuladas</p>
            </div>
            {tab === 'live' && (
              <div className={`card p-4 shadow-sm ${jornadaAlerts.atrasados > 0 ? 'border-red-200 bg-red-50' : ''}`}>
                <p className="text-[10px] font-semibold uppercase text-gray-400 flex items-center gap-1"><AlertCircle size={12} /> Jornadas</p>
                <p className="text-2xl font-black text-gray-900">{jornadaAlerts.atrasados + jornadaAlerts.emRisco}</p>
                <p className="text-[11px] text-gray-500">{jornadaAlerts.atrasados} atrasados · {jornadaAlerts.emRisco} em risco · ~{jornadaAlerts.perdaEstimada} vendas</p>
              </div>
            )}
          </div>

          {monteCarlo && (
            <div className={`card p-4 shadow-sm mb-6 flex items-center gap-4 ${monteCarlo.probabilidade >= 60 ? 'border-emerald-200' : 'border-red-200'}`}>
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white font-black text-lg ${monteCarlo.probabilidade >= 60 ? 'bg-emerald-500' : monteCarlo.probabilidade >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}>
                {monteCarlo.probabilidade}%
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">Previsão Monte Carlo — meta mensal {metaVendasMes} un.</p>
                <p className="text-xs text-gray-500">{monteCarlo.probabilidade}% de chance de bater · média {monteCarlo.mediaDia} un./dia · {monteCarlo.diasRestantes} dias restantes · acum. {monteCarlo.acumMes}</p>
              </div>
            </div>
          )}

          {/* ─── #5 Leaderboard ─── */}
          {leaderboard.length > 0 && (
            <div className="card shadow-sm overflow-hidden mb-6 border-l-4 border-emerald-400">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Award size={14} className="text-emerald-600" /> Top Vendedores do Dia</h3>
                <p className="text-xs text-gray-400">Ranking por vendas realizadas · atualiza em tempo real</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
                {leaderboard.slice(0, 8).map((op, i) => (
                  <div key={op.operador} className={`px-4 py-3 border-b border-r border-gray-50 ${i < 3 ? 'bg-emerald-50/30' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-white' : i === 2 ? 'bg-amber-700 text-white' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-800 truncate">{op.operador}</p>
                        <p className="text-[10px] text-gray-400 truncate">{op.supervisor}</p>
                      </div>
                    </div>
                    <p className="text-lg font-black text-emerald-700 mt-1">{op.vendas} <span className="text-xs font-normal text-gray-400">vendas</span></p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── #6 Funil ─── */}
          <div className="card p-5 shadow-sm mb-6">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Filter size={14} /> Funil de conversão</h3>
            <div className="flex flex-wrap items-end gap-1">
              {funnel.map((f, i) => {
                const maxH = 120;
                const h = funnel[0].valor > 0 ? Math.max(20, (f.valor / funnel[0].valor) * maxH) : 20;
                const colors = ['bg-blue-500', 'bg-teal-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500'];
                return (
                  <div key={f.etapa} className="flex flex-col items-center flex-1 min-w-[60px]">
                    <span className="text-xs font-bold text-gray-700 mb-1">{f.valor}</span>
                    <div className={`w-full rounded-t-lg ${colors[i]}`} style={{ height: h }} />
                    <span className="text-[10px] text-gray-500 mt-1">{f.etapa}</span>
                    <span className="text-[10px] font-semibold text-gray-400">{f.pct}%</span>
                    {i > 0 && <span className="text-[9px] text-red-500">-{Math.round(funnel[i - 1].pct - f.pct)}pp</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── #2 Heatmap Supervisor × Hora ─── */}
          {heatmapData.supervisors.length > 0 && (
            <div className="card p-5 shadow-sm mb-6">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><BarChart2 size={14} /> Heatmap: Vendas Supervisor × Hora</h3>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr>
                      <th className="text-left px-2 py-1 text-gray-500">Supervisor</th>
                      {HORAS.map((h) => <th key={h} className="text-center px-1 py-1 text-gray-400 w-10">{h}h</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapData.supervisors.map((sup) => (
                      <tr key={sup} className="border-t border-gray-50">
                        <td className="px-2 py-1 font-medium truncate max-w-[120px]">{sup}</td>
                        {HORAS.map((h) => {
                          const v = heatmapData.acc[`${sup}|${h}`] || 0;
                          const intensity = Math.min(1, v / (nowcast.metaHora / (heatmapData.supervisors.length || 1) || 1));
                          const bg = v === 0 ? 'bg-gray-50' : intensity >= 0.8 ? 'bg-emerald-500 text-white' : intensity >= 0.5 ? 'bg-emerald-300' : intensity >= 0.2 ? 'bg-amber-200' : 'bg-red-200';
                          return <td key={h} className={`text-center px-1 py-1 rounded font-bold ${bg}`}>{v || ''}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── #9 Comparativo semanal ─── */}
          {weekData.length >= 2 && (
            <div className="card p-5 shadow-sm mb-6">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><TrendingUp size={14} /> Tendência últimos dias</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={weekData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis yAxisId="v" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis yAxisId="c" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 100]} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar yAxisId="v" dataKey="vendas" name="Vendas" fill="#34d399" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="c" dataKey="cpc" name="CPC%" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ─── #11 CPC por campanha ─── */}
          {campanha === 'TODAS' && (cpcPorCamp.port.total > 0 || cpcPorCamp.mig.total > 0) && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className={`card p-4 shadow-sm ${cpcPorCamp.port.pct < CPC_META && cpcPorCamp.port.total >= 8 ? 'border-red-200 bg-red-50' : ''}`}>
                <p className="text-[10px] font-semibold uppercase text-gray-400">Portabilidade</p>
                <p className="text-2xl font-black">{cpcPorCamp.port.pct}% CPC</p>
                <p className="text-xs text-gray-500">{cpcPorCamp.port.vendas} vendas · {cpcPorCamp.port.total} tab.</p>
              </div>
              <div className={`card p-4 shadow-sm ${cpcPorCamp.mig.pct < CPC_META && cpcPorCamp.mig.total >= 8 ? 'border-red-200 bg-red-50' : ''}`}>
                <p className="text-[10px] font-semibold uppercase text-gray-400">Migração Pré</p>
                <p className="text-2xl font-black">{cpcPorCamp.mig.pct}% CPC</p>
                <p className="text-xs text-gray-500">{cpcPorCamp.mig.vendas} vendas · {cpcPorCamp.mig.total} tab.</p>
              </div>
            </div>
          )}

          {/* ─── #12 Scatter TMA × Conversão ─── */}
          {scatterTma.length >= 3 && (
            <div className="card p-5 shadow-sm mb-6">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><Zap size={14} /> Correlação TMA × Conversão</h3>
              <p className="text-xs text-gray-400 mb-2">Cada ponto é um operador · TMA em segundos · Conversão % (sucesso/tabuladas)</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="tma" name="TMA (s)" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis dataKey="conv" name="Conv %" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v: number, name: string) => [name === 'TMA (s)' ? `${v}s` : `${v}%`, name]} />
                    <Scatter name="Operadores" data={scatterTma} fill="#0f766e" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

function MiniKpi({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${warn ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
      <p className="text-[10px] font-semibold uppercase text-gray-400">{label}</p>
      <p className={`text-lg font-black ${warn ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500">{sub}</p>}
    </div>
  );
}

function Kpi({
  label, value, sub, warn, icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  warn?: boolean;
  icon: typeof Clock;
}) {
  return (
    <div className={`card p-4 shadow-sm ${warn ? 'border-red-200 bg-red-50' : ''}`}>
      <p className="text-[10px] font-semibold uppercase text-gray-400 flex items-center gap-1"><Icon size={12} /> {label}</p>
      <p className={`text-2xl font-black ${warn ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Seg<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex rounded-xl bg-gray-100 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${value === o.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
