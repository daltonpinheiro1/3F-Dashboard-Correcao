import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  BarChart2,
  Bell,
  BellOff,
  Clipboard,
  Filter,
  Gauge,
  Sparkles,
  Target,
  TrendingUp,
  Users,
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
  ReferenceLine,
} from 'recharts';
import { AdminLayout } from '../components/AdminLayout';
import { HoraCpcChart } from '../components/hora/HoraCpcChart';
import { HoraKpiGrid } from '../components/hora/HoraKpiGrid';
import { HoraNowcastPanel } from '../components/hora/HoraNowcastPanel';
import { HoraOfensoresSection } from '../components/hora/HoraOfensoresSection';
import { HoraToolbar } from '../components/hora/HoraToolbar';
import { horaBrt } from '../lib/brt';
import {
  HORAS,
  buildForecastDia,
  buildMonteCarloDia,
  buildNowcast,
  horaKey,
  mergeMotivo,
  mergeOps,
  mergeSerie,
  mergeSup,
  motivoSourceLabel,
  vendasPorHoraFromSerie,
} from '../lib/horaPageData';
import { resolveBkoRefs } from '../lib/metaBkoDinamica';
import { calcularMetaAprovadas } from '../lib/metasAprovadas';
import {
  calcularPerdas,
  dropFromDiscagens,
  dropPorLogin,
  type EvaChamada,
  fetchEvaDia,
  fetchEvaLive,
  fetchEvaPeriodo,
  fmtHms,
  fmtPerda,
  isTabNaoCpc,
  isizeGlobalAplicavel,
  matchCampanha,
  resolveDiscagens,
  resolveOpDrop,
  type EvaHoraMotivo,
  type EvaHoraOperador,
  type EvaPayload,
  type EvaSerieHora,
} from '../lib/evaDash';
import { jornadaUnicaPorLogin, preverSaida } from '../lib/ofensorOp';
import { filtroEvaAtivo, useFiltroEvaStore } from '../store/filtroStore';
import { metaDoSupervisor, useMetaCpcStore } from '../store/metaCpcStore';
import { useTableSortFields } from '../lib/tableSort';

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
  const metaVendasMesPort = useMetaCpcStore((s) => s.metaVendasMesPort);
  const metaVendasMesMig = useMetaCpcStore((s) => s.metaVendasMesMig);
  const metaVendasMesBko = useMetaCpcStore((s) => s.metaVendasMesBko);
  const setMetaVendasMesPort = useMetaCpcStore((s) => s.setMetaVendasMesPort);
  const setMetaVendasMesMig = useMetaCpcStore((s) => s.setMetaVendasMesMig);
  const setMetaVendasMesBko = useMetaCpcStore((s) => s.setMetaVendasMesBko);
  const expedienteHorasPort = useMetaCpcStore((s) => s.expedienteHorasPort);
  const expedienteHorasMig = useMetaCpcStore((s) => s.expedienteHorasMig);
  const expedienteHorasBko = useMetaCpcStore((s) => s.expedienteHorasBko);
  const setExpedienteHorasPort = useMetaCpcStore((s) => s.setExpedienteHorasPort);
  const setExpedienteHorasMig = useMetaCpcStore((s) => s.setExpedienteHorasMig);
  const setExpedienteHorasBko = useMetaCpcStore((s) => s.setExpedienteHorasBko);

  // Meta de vendas / expediente: Port & Mig usam store; BKO = comportamento médio (resolveBkoRefs).
  const metaVendasMesStore =
    campanha === 'PORTABILIDADE'
      ? metaVendasMesPort
      : campanha === 'MIGRACAO'
        ? metaVendasMesMig
        : campanha === 'ACAO_BKO'
          ? metaVendasMesBko
          : metaVendasMesPort + metaVendasMesMig + metaVendasMesBko;

  const expedienteHorasStore =
    campanha === 'PORTABILIDADE'
      ? expedienteHorasPort
      : campanha === 'MIGRACAO'
        ? expedienteHorasMig
        : campanha === 'ACAO_BKO'
          ? expedienteHorasBko
          : Math.max(expedienteHorasPort, expedienteHorasMig, expedienteHorasBko);

  const [data, setData] = useState<EvaPayload | null>(null);
  const [hist, setHist] = useState<EvaPayload[]>([]);
  const [monthHist, setMonthHist] = useState<EvaPayload[]>([]);
  const [monthMissing, setMonthMissing] = useState<string[]>([]);
  const [ontem, setOntem] = useState<EvaPayload | null>(null);
  const [ontemIso, setOntemIso] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [insight, setInsight] = useState('');
  const [iaErro, setIaErro] = useState('');
  const [iaLoading, setIaLoading] = useState(false);
  const [supDrill, setSupDrill] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [weekHist, setWeekHist] = useState<{ dia: string; vendas: number; cpc: number }[]>([]);
  const weekFetched = useRef('');
  const [refreshing, setRefreshing] = useState(false);
  const fetchGen = useRef(0);
  const ontemCacheKey = useRef('');

  const [hora, setHora] = useState(() => {
    const h = horaBrt();
    return HORAS.includes(h) ? h : 'todas';
  });

  useEffect(() => { setSupDrill(null); }, [tab, campanha, dateFrom, dateTo, hora]);

  const loadLive = useCallback(async (spin = true) => {
    const my = ++fetchGen.current;
    if (spin) setIsLoading(true);
    setFetchError(null);
    if (!spin) setRefreshing(true);
    try {
      const live = await fetchEvaLive();
      if (my !== fetchGen.current) return;
      setData(live);
      setLastRefresh(new Date());
      const d = live.data;
      if (!d) return;
      // Poll silencioso: não refetch D-1..D-3 se já temos comparativo do mesmo dia
      const cacheKey = d;
      if (!spin && ontemCacheKey.current === cacheKey) return;
      let prevPayload: EvaPayload | null = null;
      let prevIso = '';
      for (let back = 1; back <= 3; back++) {
        if (my !== fetchGen.current) return;
        const prev = new Date(`${d}T00:00:00`);
        prev.setDate(prev.getDate() - back);
        const y = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
        const p = await fetchEvaDia(y);
        if (p && ((p.serie_hora || []).length > 0 || Number(p.kpis_chamadas?.tabuladas || 0) > 0)) {
          prevPayload = p;
          prevIso = y;
          break;
        }
      }
      if (my !== fetchGen.current) return;
      ontemCacheKey.current = cacheKey;
      setOntem(prevPayload);
      setOntemIso(prevIso);
    } catch (e: unknown) {
      if (my !== fetchGen.current) return;
      setFetchError(e instanceof Error ? e.message : 'Falha no EVA.');
    } finally {
      if (my === fetchGen.current) {
        if (spin) setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadHist = useCallback(async () => {
    const my = ++fetchGen.current;
    setIsLoading(true);
    setFetchError(null);
    try {
      const { dias } = await fetchEvaPeriodo(dateFrom, dateFrom);
      if (my !== fetchGen.current) return;
      setHist(dias);
      setOntem(null);
      setOntemIso('');
      ontemCacheKey.current = '';
      setLastRefresh(new Date());
    } catch (e: unknown) {
      if (my !== fetchGen.current) return;
      setFetchError(e instanceof Error ? e.message : 'Falha no histórico.');
    } finally {
      if (my === fetchGen.current) setIsLoading(false);
    }
  }, [dateFrom]);

  useEffect(() => {
    if (tab === 'live') loadLive(true);
    else loadHist();
  }, [tab, loadLive, loadHist]);

  // A leitura hora a hora precisa representar um único fechamento diário.
  useEffect(() => {
    if (tab === 'hist' && dateFrom && dateTo !== dateFrom) setDateTo(dateFrom);
  }, [tab, dateFrom, dateTo, setDateTo]);

  const monthRef = tab === 'live' ? data?.data : dateFrom;
  useEffect(() => {
    if (!monthRef) return;
    const ac = new AbortController();
    const first = `${monthRef.slice(0, 7)}-01`;
    void fetchEvaPeriodo(first, monthRef, ac.signal)
      .then(({ dias, faltando }) => {
        setMonthHist(dias);
        setMonthMissing(
          faltando.filter(
            (iso) =>
              !(tab === 'live' && iso === monthRef) &&
              new Date(`${iso}T12:00:00`).getDay() !== 0,
          ),
        );
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setMonthHist([]);
          setMonthMissing([]);
        }
      });
    return () => ac.abort();
  }, [monthRef, tab]);

  useEffect(() => {
    if (tab !== 'live') return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadLive(false);
    };
    const id = setInterval(tick, 30_000);
    const onVis = () => {
      if (!document.hidden) loadLive(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
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

  const bkoRefs = useMemo(() => {
    if (campanha !== 'ACAO_BKO') return null;
    const dataRefIso = data?.data || new Date().toISOString().slice(0, 10);
    return resolveBkoRefs({
      serieBko: serie,
      weekHist,
      metaDiaStore: metaDia,
      dataRef: dataRefIso,
      horaAtual: hora,
    });
  }, [campanha, serie, weekHist, metaDia, data?.data, hora]);

  const metaVendasMes = metaVendasMesStore;
  const expedienteHoras =
    campanha === 'ACAO_BKO' && bkoRefs
      ? expedienteHorasBko
      : expedienteHorasStore;
  /** CPC de referência: BKO = 85% da média (alerta dinâmico); demais = meta do store */
  const metaDiaEff =
    campanha === 'ACAO_BKO' && bkoRefs ? bkoRefs.limiarAlertaCpc : metaDia;

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
  const [supFilter, setSupFilter] = useState('');
  const [motivoFilter, setMotivoFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  useEffect(() => {
    // Mantém a tabela coerente quando o recorte (hora/dia todo/campanha) muda.
    setSupFilter('');
    setMotivoFilter('');
    setSourceFilter('');
  }, [hora, opViewDia, tab, campanha]);

  const operadoresRaw = useMemo(() => {
    const rows = tab === 'live' ? data?.hora_operador || [] : mergeOps(hist);
    const filtrados = rows.filter((r) => matchCampanha(r, campanha));
    // Fallback: se o backend ainda não gerou `hora_operador` para o recorte,
    // usamos `jornada` (diária) para evitar a tabela vazia.
    if (tab === 'live' && filtrados.length === 0) {
      const baseAll = data?.jornada || [];
      let base = baseAll.filter((j) => matchCampanha(j, campanha));
      // Se o payload vier sem contrato de campanha completo, evitamos ficar 0 no fallback.
      if (base.length === 0) base = baseAll;
      const supMotivo: Record<string, { nome: string; total: number; pct_cpc: number }> = {};
      const supRows = (data?.hora_sup_motivo || []).filter((r) => matchCampanha(r, campanha) && (hora === 'todas' || horaKey(r.hora) === hora));
      for (const r of supRows) {
        const sup = r.supervisor || '—';
        if (!supMotivo[sup] || (r.total || 0) > supMotivo[sup].total) {
          supMotivo[sup] = { nome: r.nome, total: r.total, pct_cpc: r.pct_cpc };
        }
      }
      const acc: Record<string, any> = {};
      for (const j of base) {
        const login = j.login || '';
        const cop = j.campanha_op || '';
        const key = `${login}|${cop}`;
        if (!acc[key]) {
          const sup = j.supervisor_name || '—';
          const m = supMotivo[sup];
          acc[key] = {
            operador: j.user_name || login || '—',
            supervisor: sup,
            login,
            campanha_op: cop,
            total: 0,
            cpc: 0,
            sucesso: 0,
            tma_seg: 0,
            hora: hora === 'todas' ? '00' : hora,
            motivo: m?.nome || '',
            motivo_n: m?.total || 0,
            motivo_pct: m?.pct_cpc || 0,
          };
        }
        acc[key].total += j.tabuladas || 0;
        acc[key].cpc += j.cpc || 0;
        acc[key].sucesso += j.sucesso || 0;
        // TMA: tenta ponderar por chamadas; se não existir, mantém a última.
        if (typeof j.tma_seg === 'number') acc[key].tma_seg = j.tma_seg;
      }
      return Object.values(acc).map((r) => ({
        ...r,
        pct_cpc: r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0,
        motivo: r.motivo || '',
        motivo_n: r.motivo_n || 0,
        motivo_pct: r.motivo_pct || 0,
      }));
    }
    return filtrados;
  }, [tab, data, hist, campanha, hora]);
  const operadoresBaseCount = useMemo(() => {
    const rows = tab === 'live' ? data?.hora_operador || [] : mergeOps(hist);
    return rows.length;
  }, [tab, data, hist]);
  const jornadaBaseCount = useMemo(() => {
    if (tab !== 'live') return 0;
    return (data?.jornada || []).length;
  }, [tab, data]);

  const operadores = useMemo(() => {
    const filtroHora = opViewDia ? 'todas' : hora;
    const supAllRows = (tab === 'live' ? data?.hora_sup_motivo || [] : mergeMotivo(hist, 'hora_sup_motivo'))
      .filter((r) => matchCampanha(r, campanha));
    const motivoAllRows = (tab === 'live' ? data?.hora_motivo || [] : mergeMotivo(hist, 'hora_motivo'))
      .filter((r) => matchCampanha(r, campanha));

    const inHora = (h: string) => (filtroHora === 'todas' ? true : horaKey(h) === filtroHora);
    const supRowsIntervalo = supAllRows.filter((r) => inHora(r.hora));
    const motivoRowsIntervalo = motivoAllRows.filter((r) => inHora(r.hora));

    const pickPior = (rows: EvaHoraMotivo[]) => {
      if (!rows.length) return { nome: '', pct: 0, total: 0 };
      // Pior cenário = maior impacto negativo: volume alto + CPC% baixo.
      const sorted = [...rows].sort((a, b) => {
        const ia = ((100 - (a.pct_cpc || 0)) * (a.total || 0));
        const ib = ((100 - (b.pct_cpc || 0)) * (b.total || 0));
        if (ib !== ia) return ib - ia;
        return (b.total || 0) - (a.total || 0);
      });
      const w = sorted[0];
      return { nome: w?.nome || '', pct: w?.pct_cpc || 0, total: w?.total || 0 };
    };

    const supTop: Record<string, { nome: string; pct: number; total: number }> = {};
    const supBase = supRowsIntervalo.length ? supRowsIntervalo : supAllRows;
    const supGrouped: Record<string, EvaHoraMotivo[]> = {};
    for (const r of supBase) {
      const sup = r.supervisor || '—';
      if (!supGrouped[sup]) supGrouped[sup] = [];
      supGrouped[sup].push(r);
    }
    for (const [sup, rows] of Object.entries(supGrouped)) supTop[sup] = pickPior(rows);

    const globalTop = pickPior(motivoRowsIntervalo.length ? motivoRowsIntervalo : motivoAllRows);

    const chamadasSrc: EvaChamada[] = tab === 'live'
      ? data?.chamadas_recente || []
      : hist.flatMap((h) => h.chamadas_recente || []);
    const callHour = (c: EvaChamada) => {
      const t = (c.call_time || '').trim();
      if (t) return horaKey(t);
      const d = (c.call_date || '').trim();
      if (d.length >= 13 && d.includes('T')) return horaKey(d.slice(11, 13));
      return '';
    };
    const chamadasFiltradas = chamadasSrc.filter((c) => {
      if (!matchCampanha(c, campanha)) return false;
      if (filtroHora !== 'todas' && callHour(c) !== filtroHora) return false;
      return true;
    });

    type OpMotivo = { nome: string; pct: number; total: number };
    type OpMotivoAgg = { total: number; motivos: Record<string, number> };
    const opMotivoByLoginCamp: Record<string, OpMotivo> = {};
    const opMotivoByLogin: Record<string, OpMotivo> = {};
    const opAggCamp: Record<string, OpMotivoAgg> = {};
    const opAggLogin: Record<string, OpMotivoAgg> = {};

    for (const c of chamadasFiltradas) {
      const login = (c.login || '').trim().toLowerCase();
      if (!login) continue;
      const motivo = (c.classification_name || '').trim();
      if (!motivo) continue;
      const cop = (c.campanha_op || '').trim();
      const kCamp = `${login}|${cop}`;
      if (!opAggCamp[kCamp]) opAggCamp[kCamp] = { total: 0, motivos: {} };
      if (!opAggLogin[login]) opAggLogin[login] = { total: 0, motivos: {} };
      opAggCamp[kCamp].total += 1;
      opAggLogin[login].total += 1;
      opAggCamp[kCamp].motivos[motivo] = (opAggCamp[kCamp].motivos[motivo] || 0) + 1;
      opAggLogin[login].motivos[motivo] = (opAggLogin[login].motivos[motivo] || 0) + 1;
    }

    const pickPiorOperador = (agg?: OpMotivoAgg): OpMotivo | null => {
      if (!agg || agg.total <= 0) return null;
      const items = Object.entries(agg.motivos);
      if (!items.length) return null;
      const sorted = items.sort((a, b) => {
        const aOut = isTabNaoCpc(a[0]) ? 1 : 0;
        const bOut = isTabNaoCpc(b[0]) ? 1 : 0;
        if (bOut !== aOut) return bOut - aOut; // prioriza tabulação fora de CPC
        return b[1] - a[1];
      });
      const [nome, qtd] = sorted[0];
      return {
        nome,
        total: qtd,
        pct: Math.round((qtd / agg.total) * 1000) / 10,
      };
    };
    for (const [k, agg] of Object.entries(opAggCamp)) {
      const v = pickPiorOperador(agg);
      if (v) opMotivoByLoginCamp[k] = v;
    }
    for (const [k, agg] of Object.entries(opAggLogin)) {
      const v = pickPiorOperador(agg);
      if (v) opMotivoByLogin[k] = v;
    }

    const enrichMotivo = (r: EvaHoraOperador): EvaHoraOperador => {
      const mAtual = (r.motivo || '').trim();
      const pctAtual = Number(r.motivo_pct || 0);
      const kCamp = `${String(r.login || '').trim().toLowerCase()}|${String(r.campanha_op || '').trim()}`;
      const kLogin = String(r.login || '').trim().toLowerCase();
      const opM = opMotivoByLoginCamp[kCamp] || opMotivoByLogin[kLogin];
      if (mAtual && mAtual !== '—') {
        if (pctAtual > 0) return { ...r, motivo_source: 'operador_payload' };
        if (opM) return { ...r, motivo_pct: opM.pct, motivo_n: opM.total, motivo_source: 'operador_estimado' };
        return { ...r, motivo_source: 'operador_payload' };
      }
      if (opM) return { ...r, motivo: opM.nome, motivo_pct: opM.pct, motivo_n: opM.total, motivo_source: 'operador_estimado' };
      const sup = r.supervisor || '—';
      const supM = supTop[sup];
      if (supM?.nome) {
        const pct = pctAtual > 0 ? pctAtual : (supM.pct || 0);
        const qtd = Number(r.motivo_n || 0) > 0 ? Number(r.motivo_n || 0) : (supM.total || 0);
        return { ...r, motivo: supM.nome, motivo_pct: pct, motivo_n: qtd, motivo_source: 'supervisor_fallback' };
      }
      if (globalTop.nome) {
        const pct = pctAtual > 0 ? pctAtual : (globalTop.pct || 0);
        const qtd = Number(r.motivo_n || 0) > 0 ? Number(r.motivo_n || 0) : (globalTop.total || 0);
        return { ...r, motivo: globalTop.nome, motivo_pct: pct, motivo_n: qtd, motivo_source: 'global_fallback' };
      }
      return { ...r, motivo_source: 'indisponivel' };
    };

    const addImpact = (r: EvaHoraOperador): EvaHoraOperador & { impacto_perda: number } => ({
      ...r,
      impacto_perda: Math.round((r.total || 0) * (100 - (r.pct_cpc || 0)) * 10) / 10,
    });

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
        .map(enrichMotivo)
        .map(addImpact)
        .sort((a, b) => a.pct_cpc - b.pct_cpc);
    }
    return operadoresRaw
      .filter((r) => {
        if (filtroHora !== 'todas' && horaKey(r.hora) !== filtroHora) return false;
        if (supDrill && r.supervisor !== supDrill) return false;
        if (q) return `${r.operador} ${r.login} ${r.supervisor}`.toLowerCase().includes(q);
        return true;
      })
      .map(enrichMotivo)
      .map(addImpact)
      .sort((a, b) => a.pct_cpc - b.pct_cpc);
  }, [operadoresRaw, hora, opViewDia, q, supDrill, tab, data, hist, campanha]);

  const supOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of operadores) if (o.supervisor) set.add(o.supervisor);
    return [...set].sort();
  }, [operadores]);

  const motivoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of operadores) {
      const m = (o.motivo || '').trim();
      if (m && m !== '—') set.add(m);
    }
    return [...set].sort();
  }, [operadores]);

  const operadoresFiltrados = useMemo(() => {
    return operadores.filter((o) => {
      if (supFilter && o.supervisor !== supFilter) return false;
      if (motivoFilter && (o.motivo || '') !== motivoFilter) return false;
      if (sourceFilter && (o.motivo_source || 'indisponivel') !== sourceFilter) return false;
      return true;
    });
  }, [operadores, supFilter, motivoFilter, sourceFilter]);

  const motivoSourceSummary = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const o of operadoresFiltrados) {
      const k = o.motivo_source || 'indisponivel';
      acc[k] = (acc[k] || 0) + 1;
    }
    return acc;
  }, [operadoresFiltrados]);

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
    for (const h of HORAS) acc[h] = { hora: `${h}h`, total: 0, cpc: 0, meta: metaDiaEff };
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
  }, [serie, metaDiaEff]);

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

  /** Volumes dialer do intervalo (Discadas / Alo) — alinhado à visão Discagens. */
  const discIntervalo = useMemo(() => {
    const payloads = tab === 'live' ? (data ? [data] : []) : hist;
    let dialed = 0;
    let contact = 0;
    let tabuladas = 0;
    let cpc = 0;
    let sucesso = 0;
    for (const p of payloads) {
      const d = resolveDiscagens(p);
      for (const r of d.serie_hora || []) {
        if (!matchCampanha(r, campanha)) continue;
        if (hora !== 'todas' && horaKey(r.hora || '') !== hora) continue;
        dialed += r.dialed || 0;
        contact += r.contact || 0;
        tabuladas += r.tabuladas || 0;
        cpc += r.cpc || 0;
        sucesso += r.sucesso || 0;
      }
    }
    const locPct = dialed ? Math.round((1000 * contact) / dialed) / 10 : 0;
    const tabPct = dialed ? Math.round((1000 * tabuladas) / dialed) / 10 : 0;
    const receptivo = campanha === 'PORTABILIDADE' && dialed > 0 && locPct >= 90;
    return { dialed, contact, tabuladas, cpc, sucesso, locPct, tabPct, receptivo };
  }, [tab, data, hist, campanha, hora]);

  const { tma, pausa, capacidade, ocupacao, perdas, perdaHora } = useMemo(() => {
    const _tmaPond = jornada.reduce((s, j) => s + (j.tma_seg || 0) * (j.chamadas || 0), 0);
    const _attN = jornada.reduce((s, j) => s + (j.chamadas || 0), 0);
    const _tma = _attN ? _tmaPond / _attN : 0;
    const _logado = jornada.reduce((s, j) => s + (j.logged_time || 0), 0);
    const _pausa = jornada.reduce((s, j) => s + (j.pausa_seg || 0), 0);
    const _perdido = jornada.reduce((s, j) => s + (j.tempo_perdido_seg || 0), 0);
    const _capacidade = _tma > 0 ? _logado / _tma : 0;
    const _ocupacao = _capacidade > 0 ? Math.round((1000 * _attN) / _capacidade) / 10 : 0;
    const _perdas = calcularPerdas({
      tempoDeslogueSeg: _perdido,
      pausaSeg: _pausa,
      logadoSeg: _logado,
      tmaSeg: _tma,
      tabuladas: recorte.total,
      sucesso: recorte.sucesso,
      vb: jornada.reduce((s, j) => s + (j.vb || 0), 0),
    });
    const _totalDia = serie.reduce((s, r) => s + (r.total || 0), 0);
    const _pesoHora = recorte.total && _totalDia
      ? recorte.total / _totalDia
      : hora === 'todas' ? 1 : 0;
    return {
      tma: _tma, pausa: _pausa,
      capacidade: _capacidade, ocupacao: _ocupacao, perdas: _perdas,
      perdaHora: {
        chamadas: Math.round(_perdas.chamadas_perdidas * _pesoHora * 10) / 10,
        vendas: Math.round(_perdas.vendas_perdidas * _pesoHora * 10) / 10,
      },
    };
  }, [jornada, recorte, serie, hora]);

  const dropMaps = useMemo(() => {
    const payloads = tab === 'live' ? (data ? [data] : []) : hist;
    // DROP% do dia (Agente Desligou); filtro de hora só afeta tab_hora.
    const disc = dropFromDiscagens(payloads, campanha, null);
    const ofens = dropPorLogin(
      payloads.flatMap((p) => (p?.ofensores_tab || []).filter((r) => matchCampanha(r, campanha))),
    );
    const tabDrop = dropFromDiscagens(
      payloads,
      campanha,
      opViewDia || hora === 'todas' ? null : hora,
    ).byTab;
    return { disc, ofens, tabDrop };
  }, [tab, data, hist, campanha, hora, opViewDia]);

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
        const meta = metaDoSupervisor(metasSup, r.supervisor, metaDiaEff);
        const dKey = String(r.supervisor || '')
          .trim()
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const d = dropMaps.disc.bySup[dKey] || { drop: 0, tabs: 0, rate: 0 };
        return {
          ...r,
          pct_cpc: pct,
          meta,
          gap: Math.round((pct - meta) * 10) / 10,
          _drop: d.drop,
          _drop_rate: d.rate,
        };
      })
      .sort((a, b) => a.pct_cpc - b.pct_cpc);
  }, [sups, metasSup, metaDiaEff, dropMaps]);

  const motivosTop = useMemo(
    () =>
      [...motivos]
        .sort((a, b) => {
          const aOut = isTabNaoCpc(a.nome) ? 0 : 1;
          const bOut = isTabNaoCpc(b.nome) ? 0 : 1;
          if (a.pct_cpc !== b.pct_cpc) return a.pct_cpc - b.pct_cpc;
          return b.total - a.total || aOut - bOut;
        })
        .slice(0, 12)
        .map((m) => {
          const k = String(m.nome || '')
            .trim()
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
          const d = dropMaps.tabDrop[k] || { drop: 0, tabs: 0, rate: 0 };
          return { ...m, _drop: d.drop, _drop_rate: d.rate };
        }),
    [motivos, dropMaps],
  );

  const dataRef = tab === 'live'
    ? (data?.data || new Date().toISOString().slice(0, 10))
    : (dateFrom || hist[0]?.data || new Date().toISOString().slice(0, 10));
  const payloadRecorte = tab === 'live' ? data : hist[0];
  const vendasHoraRecorte = useMemo(() => {
    const produtos = new Set(['PORTABILIDADE', 'MIGRACAO', 'ACAO_BKO']);
    return (payloadRecorte?.vendas_hora || []).filter((r) =>
      campanha === 'TODAS' ? produtos.has(r.campanha_op) : matchCampanha(r, campanha),
    );
  }, [payloadRecorte, campanha]);
  const ritmoEmAprovadas = vendasHoraRecorte.length > 0;
  const serieRitmo = useMemo<EvaSerieHora[]>(
    () => ritmoEmAprovadas
      ? vendasHoraRecorte.map((r) => ({
          hora: horaKey(r.hora),
          campanha_op: r.campanha_op,
          total: r.vb,
          sucesso: r.aprovadas,
          vb: r.vb,
          aprovadas: r.aprovadas,
          vendas_fonte: r.fonte,
        }))
      : serie,
    [ritmoEmAprovadas, vendasHoraRecorte, serie],
  );
  const supsAllHours = useMemo(() => {
    const rows = tab === 'live' ? data?.hora_supervisor || [] : mergeSup(hist);
    return rows.filter((r) => matchCampanha(r, campanha));
  }, [tab, data, hist, campanha]);
  const supervisorWeights = useMemo(() => {
    const bySup = new Map<string, Set<string>>();
    for (const row of jornada) {
      const sup = row.supervisor_name || 'Sem supervisor';
      const login = row.login || String(row.id_user);
      if (!bySup.has(sup)) bySup.set(sup, new Set());
      bySup.get(sup)!.add(login);
    }
    return Object.fromEntries([...bySup].map(([sup, logins]) => [sup, logins.size]));
  }, [jornada]);
  const horaCalculo = tab === 'hist' && hora === 'todas' ? '21' : hora;
  const nowcast = useMemo(
    () => buildNowcast(
      serieRitmo,
      ritmoEmAprovadas ? [] : supsAllHours,
      metaVendasMes,
      expedienteHoras,
      dataRef,
      horaCalculo,
      supervisorWeights,
    ),
    [serieRitmo, ritmoEmAprovadas, supsAllHours, metaVendasMes, expedienteHoras, dataRef, horaCalculo, supervisorWeights],
  );
  const metaAprovadas = useMemo(() => {
    const payloads = tab === 'live' && data
      ? [...monthHist.filter((p) => p.data !== data.data), data]
      : monthHist;
    return calcularMetaAprovadas({
      payloads,
      campanha,
      metaMensal: metaVendasMes,
      dataRef,
      expedienteHoras,
      horaAtual: horaCalculo,
      diaEmAberto: tab === 'live',
    });
  }, [tab, data, monthHist, campanha, metaVendasMes, dataRef, expedienteHoras, horaCalculo]);

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
  const prevGap = useRef<number | null>(null);
  useEffect(() => {
    if (!alertaAtivo || tab !== 'live' || isLoading) return;
    const GAP_THRESHOLD = -(nowcast.metaHora * 0.5);
    if (prevGap.current !== null && nowcast.gapAcum < GAP_THRESHOLD && prevGap.current >= GAP_THRESHOLD) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 520;
        gain.gain.value = 0.3;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
        osc.onended = () => ctx.close();
      } catch {}
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
  const forecast = useMemo(
    () => buildForecastDia(serieRitmo, nowcast.vendasTotal, nowcast.horasRestantes, nowcast.metaDia),
    [serieRitmo, nowcast.vendasTotal, nowcast.horasRestantes, nowcast.metaDia],
  );

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

  // ── #6 Funil por tabulação (cruzamento iSize quando disponível) ──
  const isizeCruz = payloadRecorte?.kpis_chamadas?.isize_cruzamento;
  const isizeTotal = Number(payloadRecorte?.kpis_chamadas?.isize_total || 0);
  const isizeAceitas = Number(payloadRecorte?.kpis_chamadas?.isize_aceitas || 0);
  // (iSize canceladas não é usada diretamente no funnel atual)
  const funnel = useMemo(() => {
    const tab_total = recorte.total;
    const cpc_total = recorte.cpc;
    const sucesso_eva = recorte.sucesso;
    const vb_jornada = jornada.reduce((s, j) => s + (j.vb || 0), 0);
    const aprov_jornada = jornada.reduce((s, j) => s + (j.aprovadas || 0), 0);

    const usarIsize = isizeGlobalAplicavel(campanha) && Boolean(isizeCruz) && isizeTotal > 0;
    const sucFinal = usarIsize ? isizeTotal : sucesso_eva;
    const vbFinal = usarIsize ? isizeTotal : vb_jornada;
    const aprovFinal = usarIsize && isizeAceitas > 0 ? isizeAceitas : aprov_jornada;
    const tagIsize = usarIsize ? ' (iSize)' : '';

    return [
      { etapa: 'Tabuladas', valor: tab_total, pct: 100 },
      { etapa: 'CPC', valor: cpc_total, pct: tab_total ? Math.round((cpc_total / tab_total) * 1000) / 10 : 0 },
      { etapa: 'Sucesso' + tagIsize, valor: sucFinal, pct: tab_total ? Math.round((sucFinal / tab_total) * 1000) / 10 : 0 },
      { etapa: 'VB' + tagIsize, valor: vbFinal, pct: tab_total ? Math.round((vbFinal / tab_total) * 1000) / 10 : 0 },
      { etapa: 'Aprovadas' + tagIsize, valor: aprovFinal, pct: tab_total ? Math.round((aprovFinal / tab_total) * 1000) / 10 : 0 },
    ];
  }, [recorte, jornada, isizeCruz, isizeTotal, isizeAceitas, campanha]);

  // ── % Crivo (aprovação sobre sucesso) ──
  const crivoPct = useMemo(() => {
    // Quando o usuário filtra por uma hora específica, os KPIs "por intervalo"
    // precisam usar valores interval-based (jornada vb/aprovadas).
    if (hora !== 'todas') {
      const vbJornada = jornada.reduce((s, j) => s + (j.vb || 0), 0);
      const aprovJornada = jornada.reduce((s, j) => s + (j.aprovadas || 0), 0);
      return vbJornada > 0 ? Math.round((aprovJornada / vbJornada) * 1000) / 10 : 0;
    }

    // Quando é "dia todo", usamos o consolidado diário do iSize (via funil).
    const sucStep = funnel.find((f) => f.etapa.startsWith('Sucesso'));
    const aprovStep = funnel.find((f) => f.etapa.startsWith('Aprovadas'));
    const sucVal = sucStep?.valor || 0;
    const aprovVal = aprovStep?.valor || 0;
    return sucVal > 0 ? Math.round((aprovVal / sucVal) * 1000) / 10 : 0;
  }, [funnel, hora, jornada]);

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
  useEffect(() => {
    if (tab !== 'live' || !data?.data) return;
    const fetchingDate = data.data;
    const cacheKey = `${fetchingDate}|${campanha}`;
    if (weekFetched.current === cacheKey) return;
    let cancelled = false;
    const today = new Date(`${data.data}T12:00:00`);
    const promises: Promise<{ dia: string; vendas: number; cpc: number } | null>[] = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      promises.push(
        fetchEvaDia(iso).then((p) => {
          if (!p) return null;
          const serieFiltrada = (p.serie_hora || []).filter((r) => matchCampanha(r, campanha));
          const v = serieFiltrada.reduce((s, r) => s + (r.sucesso || 0), 0);
          const t = serieFiltrada.reduce((s, r) => s + (r.total || 0), 0);
          const c = serieFiltrada.reduce((s, r) => s + (r.cpc || 0), 0);
          return { dia: iso.slice(5), vendas: v, cpc: t ? Math.round((c / t) * 1000) / 10 : 0 };
        }),
      );
    }
    Promise.all(promises).then((results) => {
      if (cancelled) return;
      weekFetched.current = cacheKey;
      setWeekHist((results.filter(Boolean) as { dia: string; vendas: number; cpc: number }[]).sort((a, b) => a.dia.localeCompare(b.dia)));
    });
    return () => { cancelled = true; };
  }, [tab, data?.data, campanha]);
  const weekData = useMemo(() => {
    const out = [...weekHist];
    if (data?.data) out.push({ dia: data.data.slice(5) + ' (hoje)', vendas: nowcast.vendasTotal, cpc: recorte.pct });
    return out;
  }, [weekHist, data?.data, nowcast.vendasTotal, recorte.pct]);

  // ── #11 Meta por campanha ──
  const cpcPorCamp = useMemo(() => {
    const port = serie.filter((r) => r.campanha_op === 'PORTABILIDADE');
    const mig = serie.filter((r) => r.campanha_op === 'MIGRACAO');
    const bko = serie.filter((r) => r.campanha_op === 'ACAO_BKO');
    const calc = (rows: EvaSerieHora[]) => {
      const t = rows.reduce((s, r) => s + (r.total || 0), 0);
      const c = rows.reduce((s, r) => s + (r.cpc || 0), 0);
      const v = rows.reduce((s, r) => s + (r.sucesso || 0), 0);
      return { total: t, cpc: c, vendas: v, pct: t ? Math.round((c / t) * 1000) / 10 : 0 };
    };
    return { port: calc(port), mig: calc(mig), bko: calc(bko) };
  }, [serie]);

  // ── #12 Correlação TMA × Conversão ──
  const scatterTma = useMemo(() => {
    const ops = tab === 'live' ? data?.hora_operador || [] : mergeOps(hist);
    const acc: Record<string, { tma_w: number; tma_n: number; conv: number; total: number; nome: string; login: string }> = {};
    for (const o of ops) {
      if (!matchCampanha(o, campanha) || !o.tma_seg || o.total < 3) continue;
      if (hora !== 'todas' && horaKey(o.hora) !== hora) continue;
      if (!acc[o.login]) acc[o.login] = { tma_w: 0, tma_n: 0, conv: 0, total: 0, nome: o.operador, login: o.login };
      acc[o.login].tma_w += o.tma_seg * o.total;
      acc[o.login].tma_n += o.total;
      acc[o.login].total += o.total;
      acc[o.login].conv += o.sucesso || 0;
    }
    return Object.values(acc)
      .filter((a) => a.total >= 5)
      .map((a) => ({
        tma: a.tma_n ? Math.round(a.tma_w / a.tma_n) : 0,
        conv: a.total ? Math.round((a.conv / a.total) * 1000) / 10 : 0,
        total: a.total,
        nome: a.nome,
        login: a.login,
      }))
      .sort((a, b) => a.tma - b.tma);
  }, [tab, data, hist, campanha, hora]);

  const scatterLeitura = useMemo(() => {
    if (scatterTma.length < 3) return null;
    const tmas = scatterTma.map((d) => d.tma).slice().sort((a, b) => a - b);
    const convs = scatterTma.map((d) => d.conv).slice().sort((a, b) => a - b);
    const mid = (arr: number[]) => {
      const i = Math.floor(arr.length / 2);
      return arr.length % 2 ? arr[i] : Math.round(((arr[i - 1] + arr[i]) / 2) * 10) / 10;
    };
    const medTma = mid(tmas);
    const medConv = mid(convs);
    const quad = { eficiente: 0, longoBom: 0, curto: 0, risco: 0, rapido: 0 };
    for (const d of scatterTma) {
      const baixoTma = d.tma <= medTma;
      const altaConv = d.conv >= medConv && d.conv > 0;
      if (baixoTma && altaConv) quad.eficiente += 1;
      else if (!baixoTma && altaConv) quad.longoBom += 1;
      else if (baixoTma && !altaConv) quad.rapido += 1;
      else quad.risco += 1;
    }
    const comVenda = scatterTma.filter((d) => d.conv > 0).sort((a, b) => b.conv - a.conv || a.tma - b.tma);
    const zerados = scatterTma.filter((d) => d.conv === 0).sort((a, b) => b.tma - a.tma);
    return { medTma, medConv, quad, comVenda: comVenda.slice(0, 5), zeradosLongos: zerados.slice(0, 5), n: scatterTma.length, nZero: zerados.length };
  }, [scatterTma]);

  // ── #14 Monte Carlo sobre forecast do dia ──
  const monteCarlo = useMemo(() => {
    if (tab !== 'live' || !forecast) return null;
    return buildMonteCarloDia(forecast, vendasPorHoraFromSerie(serieRitmo));
  }, [tab, forecast, serieRitmo]);

  // ── #10 Copiar relatório ──
  const copiarRelatorio = () => {
    const lines = [
      `📊 RELATÓRIO HORA A HORA — ${dataRef}`,
      `Campanha: ${campanha} | Horário: ${hora === 'todas' ? 'Dia' : hora + 'h'}`,
      '',
      `▸ CPC: ${recorte.pct.toFixed(1)}% (ref ${metaDiaEff}%${campanha === 'ACAO_BKO' && bkoRefs ? ` · média BKO ${bkoRefs.metaCpc}%` : ''}) | ${recorte.cpc}/${recorte.total} tab.`,
      `▸ Vendas: ${nowcast.vendasTotal} un. | Meta dia: ${nowcast.metaDia} | Gap: ${nowcast.gapAcum}`,
      `▸ Crivo (% aprovadas/sucesso): ${crivoPct}%`,
      `▸ Fontes motivo (tabela atual): Op ${motivoSourceSummary.operador_payload || 0} · Est ${motivoSourceSummary.operador_estimado || 0} · Sup ${motivoSourceSummary.supervisor_fallback || 0} · Global ${motivoSourceSummary.global_fallback || 0}`,
      `▸ Ritmo necessário: ${nowcast.metaHoraRestante} un./h (${nowcast.horasRestantes}h restantes)`,
      `▸ Ocupação: ${ocupacao.toFixed(0)}% | TMA: ${fmtHms(tma)}`,
      `▸ Perdas: ${fmtPerda(perdas.vendas_perdidas)} vendas | ${fmtPerda(perdas.chamadas_perdidas)} chamadas`,
      '',
      '🏆 SUPERVISORES:',
      ...rankingSup.slice(0, 5).map((s) => `  ${s.supervisor}: CPC ${s.pct_cpc.toFixed(1)}% | ${s.sucesso} vendas | gap ${s.gap.toFixed(1)} p.p.`),
      '',
      forecast ? `📈 FORECAST: Otimista ${forecast.otimista} | Realista ${forecast.realista} | Pessimista ${forecast.pessimista} (meta ${forecast.meta})` : '',
      monteCarlo
        ? `🎲 MONTE CARLO (dia): ${monteCarlo.probabilidade}% de bater meta ${monteCarlo.meta} un. · projeção média ${monteCarlo.projecaoMedia} (P50 ${monteCarlo.projecaoP50}) · forecast realista ${monteCarlo.forecastRealista}`
        : '',
      '',
      insight ? `🤖 INSIGHT IA:\n${insight}` : '',
    ].filter(Boolean);
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const [copied, setCopied] = useState(false);
  const [csvOk, setCsvOk] = useState(false);

  const exportarOfensoresCsv = () => {
    const header = ['data', 'campanha', 'recorte', 'operador', 'login', 'supervisor', 'quantidade', 'cpc_pct', 'drop_pct', 'tma', 'motivo_principal', 'motivo_pct', 'fonte_motivo', 'impacto_perda'];
    const recorteTxt = opViewDia && hora !== 'todas' ? 'dia_todo' : (hora === 'todas' ? 'dia' : `${hora}h`);
    const rows = operadoresFiltrados.map((o: any) => {
      const d = resolveOpDrop(o.login, o.operador, dropMaps.disc, dropMaps.ofens);
      return [
        dataRef,
        campanha,
        recorteTxt,
        o.operador || '',
        o.login || '',
        o.supervisor || '',
        o.total || 0,
        Number(o.pct_cpc || 0).toFixed(1),
        Number(d.rate || 0).toFixed(1),
        o.tma_seg ? fmtHms(o.tma_seg) : '',
        o.motivo || '',
        o.motivo ? Number(o.motivo_pct || 0).toFixed(1) : '',
        motivoSourceLabel(o.motivo_source),
        Number(o.impacto_perda || 0).toFixed(1),
      ];
    });
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ofensores_${dataRef}_${campanha}_${recorteTxt}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setCsvOk(true);
    setTimeout(() => setCsvOk(false), 1800);
  };

  const pedirInsight = async () => {
    setIaLoading(true);
    setIaErro('');
    setInsight('');
    try {
      const { dashboardSessionHeaders } = await import('../lib/dashboardSession');
      const r = await fetch('/api/hora-insight', {
        method: 'POST',
        headers: dashboardSessionHeaders(),
        body: JSON.stringify({
          recorte: hora === 'todas' ? 'dia' : `${hora}h`,
          campanha,
          meta_mes: metaMes,
          meta_dia: metaDiaEff,
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
          monte_carlo: monteCarlo
            ? {
                probabilidade_pct: monteCarlo.probabilidade,
                meta_dia: monteCarlo.meta,
                projecao_media: monteCarlo.projecaoMedia,
                projecao_p50: monteCarlo.projecaoP50,
                forecast_realista: monteCarlo.forecastRealista,
              }
            : null,
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

  const down = recorte.total >= 8 && recorte.pct < metaDiaEff;

  const {
    sorted: ncRowsSorted,
    sortKey: ncKey,
    sortDir: ncDir,
    toggleSort: toggleNc,
  } = useTableSortFields(nowcast.rows, 'hora', 'asc');

  const {
    sorted: ncSupSorted,
    sortKey: ncSupKey,
    sortDir: ncSupDir,
    toggleSort: toggleNcSup,
  } = useTableSortFields(nowcast.supRows, 'gapSup', 'asc');

  const {
    sorted: rkSupSorted,
    sortKey: rkSupKey,
    sortDir: rkSupDir,
    toggleSort: toggleRkSup,
  } = useTableSortFields(rankingSup, 'pct_cpc', 'asc');

  const {
    sorted: motivosSorted,
    sortKey: motKey,
    sortDir: motDir,
    toggleSort: toggleMot,
  } = useTableSortFields(motivosTop, 'total', 'desc');

  const drillOpRows = useMemo(
    () =>
      operadores
        .filter((o) => o.supervisor === supDrill)
        .slice(0, 20)
        .map((o) => {
          const d = resolveOpDrop(o.login, o.operador, dropMaps.disc, dropMaps.ofens);
          return {
            ...o,
            _motivo_label: o.motivo ? `${o.motivo} (${o.motivo_n || 0})` : '—',
            _tma_seg: o.tma_seg || 0,
            _drop: d.drop,
            _drop_rate: d.rate,
          };
        }),
    [operadores, supDrill, dropMaps],
  );
  const {
    sorted: drillOpSorted,
    sortKey: drillOpKey,
    sortDir: drillOpDir,
    toggleSort: toggleDrillOp,
  } = useTableSortFields(drillOpRows, 'pct_cpc', 'asc');

  const {
    sorted: drillMotSorted,
    sortKey: drillMotKey,
    sortDir: drillMotDir,
    toggleSort: toggleDrillMot,
  } = useTableSortFields(supMotivos, 'total', 'desc');

  const ofensorRows = useMemo(
    () =>
      operadoresFiltrados.slice(0, 30).map((o) => {
        const d = resolveOpDrop(o.login, o.operador, dropMaps.disc, dropMaps.ofens);
        return {
          ...o,
          _impacto: Number((o as { impacto_perda?: number }).impacto_perda || 0),
          _tma_seg: o.tma_seg || 0,
          _motivo_pct: Number(o.motivo_pct || 0),
          _fonte: o.motivo_source || 'indisponivel',
          _drop: d.drop,
          _drop_rate: d.rate,
        };
      }),
    [operadoresFiltrados, dropMaps],
  );
  const {
    sorted: ofensorSorted,
    sortKey: ofKey,
    sortDir: ofDir,
    toggleSort: toggleOf,
  } = useTableSortFields(ofensorRows, 'pct_cpc', 'asc');

  return (
    <AdminLayout
      title="Hora a hora"
      subtitle="Visão gerencial ADM · reunião de intervalo · meta CPC ≥ 65% em todos os produtos"
    >
      <HoraToolbar
        tab={tab}
        setTab={setTab}
        campanha={campanha}
        setCampanha={setCampanha}
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        search={search}
        setSearch={setSearch}
        filtroOn={filtroOn}
        limparFiltro={limparFiltro}
        hora={hora}
        setHora={setHora}
        refreshing={refreshing}
        lastRefresh={lastRefresh}
        onRefresh={() => (tab === 'live' ? loadLive(true) : loadHist())}
      />

      {fetchError && (
        <div
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="polite"
        >
          {fetchError}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="card h-24 skeleton" />)}</div>
          <div className="card h-48 skeleton" />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{[1, 2].map((i) => <div key={i} className="card h-64 skeleton" />)}</div>
        </div>
      ) : (
        <>
          <HoraKpiGrid
            hora={hora}
            discIntervalo={discIntervalo}
            recorte={recorte}
            ontemRecorte={ontemRecorte}
            ontemIso={ontemIso}
            dataIso={dataRef}
            metaDia={metaDiaEff}
            down={down}
            ocupacao={ocupacao}
            capacidade={capacidade}
            tma={tma}
            perdaHora={perdaHora}
          />

          {campanha === 'ACAO_BKO' && bkoRefs && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
              BKO com meta própria de aprovadas · ref. CPC {bkoRefs.limiarAlertaCpc}% (85% da média {bkoRefs.metaCpc}% · {bkoRefs.metaCpcFonte})
            </div>
          )}

          <HoraNowcastPanel
            metaVendasMes={metaVendasMes}
            expedienteHoras={expedienteHoras}
            dataRef={dataRef}
            metaAprovadas={metaAprovadas}
            monthMissing={monthMissing.length}
            historico={tab === 'hist'}
            ritmoEmAprovadas={ritmoEmAprovadas}
            nowcast={nowcast}
            chartNowcast={chartNowcast}
            ncRowsSorted={ncRowsSorted as typeof nowcast.rows}
            ncKey={ncKey}
            ncDir={ncDir}
            toggleNc={toggleNc}
            ncSupSorted={ncSupSorted as typeof nowcast.supRows}
            ncSupKey={ncSupKey}
            ncSupDir={ncSupDir}
            toggleNcSup={toggleNcSup}
          />

          <HoraCpcChart metaDia={metaDiaEff} chartHora={chartHora} />

          <HoraOfensoresSection
            metaDia={metaDiaEff}
            tab={tab}
            hora={hora}
            pausa={pausa}
            perdas={perdas}
            rankingSupSorted={rkSupSorted as typeof rankingSup}
            rkSupKey={rkSupKey}
            rkSupDir={rkSupDir}
            toggleRkSup={toggleRkSup}
            motivosSorted={motivosSorted as typeof motivosTop}
            motKey={motKey}
            motDir={motDir}
            toggleMot={toggleMot}
            supDrill={supDrill}
            setSupDrill={setSupDrill}
            nowcastSupRows={nowcast.supRows}
            drillOpSorted={drillOpSorted as typeof drillOpRows}
            drillOpKey={drillOpKey}
            drillOpDir={drillOpDir}
            toggleDrillOp={toggleDrillOp}
            drillMotSorted={drillMotSorted as typeof supMotivos}
            drillMotKey={drillMotKey}
            drillMotDir={drillMotDir}
            toggleDrillMot={toggleDrillMot}
            supMotivosLen={supMotivos.length}
            opViewDia={opViewDia}
            setOpViewDia={setOpViewDia}
            motivoSourceSummary={motivoSourceSummary}
            supFilter={supFilter}
            setSupFilter={setSupFilter}
            motivoFilter={motivoFilter}
            setMotivoFilter={setMotivoFilter}
            sourceFilter={sourceFilter}
            setSourceFilter={setSourceFilter}
            supOptions={supOptions}
            motivoOptions={motivoOptions}
            ofensorSorted={ofensorSorted as typeof ofensorRows}
            ofKey={ofKey}
            ofDir={ofDir}
            toggleOf={toggleOf}
            operadoresFiltradosLen={operadoresFiltrados.length}
            operadoresLen={operadores.length}
            operadoresBaseCount={operadoresBaseCount}
            jornadaBaseCount={jornadaBaseCount}
            operadoresRawLen={operadoresRaw.length}
          />

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
                  Meta aprovadas/mês (un.)
                  <div className="mt-2 flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Portabilidade</p>
                      <input
                        type="number"
                        min={1}
                        step={100}
                        value={metaVendasMesPort}
                        onChange={(e) => setMetaVendasMesPort(Number(e.target.value))}
                        className="input-field w-full text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Migração</p>
                      <input
                        type="number"
                        min={1}
                        step={100}
                        value={metaVendasMesMig}
                        onChange={(e) => setMetaVendasMesMig(Number(e.target.value))}
                        className="input-field w-full text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Ação BKO</p>
                      <input
                        type="number"
                        min={1}
                        step={100}
                        value={metaVendasMesBko}
                        onChange={(e) => setMetaVendasMesBko(Number(e.target.value))}
                        className="input-field w-full text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    Total para filtro: <span className="font-semibold text-gray-700">{metaVendasMes} un.</span>
                  </p>
                </label>
                <label className="text-xs text-gray-500">
                  Expediente (horas)
                  <div className="mt-2 flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Portabilidade</p>
                      <input
                        type="number"
                        min={4}
                        max={13}
                        step={1}
                        value={expedienteHorasPort}
                        onChange={(e) => setExpedienteHorasPort(Number(e.target.value))}
                        className="input-field w-full text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Migração</p>
                      <input
                        type="number"
                        min={4}
                        max={13}
                        step={1}
                        value={expedienteHorasMig}
                        onChange={(e) => setExpedienteHorasMig(Number(e.target.value))}
                        className="input-field w-full text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold uppercase text-gray-400 mb-1">Ação BKO</p>
                      <input
                        type="number"
                        min={4}
                        max={13}
                        step={1}
                        value={expedienteHorasBko}
                        onChange={(e) => setExpedienteHorasBko(Number(e.target.value))}
                        className="input-field w-full text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">
                    Total para filtro: <span className="font-semibold text-gray-700">{expedienteHoras}h</span>
                  </p>
                </label>
              </div>
              <p className="text-[11px] text-gray-400 mb-2">Piso de produto {metaDia}%. Supervisor herda a meta do dia se vazio.</p>
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
            <button type="button" onClick={exportarOfensoresCsv} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100">
              <Clipboard size={13} />
              {csvOk ? 'CSV gerado!' : 'Exportar ofensores CSV'}
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
            <div className="card p-4 shadow-sm">
              <p className="text-[10px] font-semibold uppercase text-gray-400 flex items-center gap-1">
                <Target size={12} /> Crivo (% aprov./sucesso)
              </p>
              <p className={`text-2xl font-black ${crivoPct >= 50 ? 'text-emerald-700' : crivoPct >= 20 ? 'text-amber-600' : 'text-red-600'}`}>{crivoPct}%</p>
              <p className="text-[11px] text-gray-500">{isizeCruz ? 'iSize (Portabilidade)' : 'EVA (fallback)'}</p>
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
                <p className="text-sm font-bold text-gray-800">Monte Carlo — forecast do dia (meta {monteCarlo.meta} un.)</p>
                <p className="text-xs text-gray-500">
                  {monteCarlo.probabilidade}% de chance de bater a meta · projeção média {monteCarlo.projecaoMedia} un.
                  (P10 {monteCarlo.projecaoP10} · P50 {monteCarlo.projecaoP50} · P90 {monteCarlo.projecaoP90})
                  · forecast realista {monteCarlo.forecastRealista} · {monteCarlo.horasRestantes}h restantes · {monteCarlo.vendasAtual} vendidas
                </p>
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
          {campanha === 'TODAS' &&
            (cpcPorCamp.port.total > 0 || cpcPorCamp.mig.total > 0 || cpcPorCamp.bko.total > 0) && (
            <div className={`grid gap-4 mb-6 ${cpcPorCamp.bko.total > 0 ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2'}`}>
              <div className={`card p-4 shadow-sm ${cpcPorCamp.port.pct < metaDia && cpcPorCamp.port.total >= 8 ? 'border-red-200 bg-red-50' : ''}`}>
                <p className="text-[10px] font-semibold uppercase text-gray-400">Portabilidade</p>
                <p className="text-2xl font-black">{cpcPorCamp.port.pct}% CPC</p>
                <p className="text-xs text-gray-500">{cpcPorCamp.port.vendas} vendas · {cpcPorCamp.port.total} tab.</p>
              </div>
              <div className={`card p-4 shadow-sm ${cpcPorCamp.mig.pct < metaDia && cpcPorCamp.mig.total >= 8 ? 'border-red-200 bg-red-50' : ''}`}>
                <p className="text-[10px] font-semibold uppercase text-gray-400">Migração Pré</p>
                <p className="text-2xl font-black">{cpcPorCamp.mig.pct}% CPC</p>
                <p className="text-xs text-gray-500">{cpcPorCamp.mig.vendas} vendas · {cpcPorCamp.mig.total} tab.</p>
              </div>
              {cpcPorCamp.bko.total > 0 && (
                <div className={`card p-4 shadow-sm ${cpcPorCamp.bko.pct < metaDia && cpcPorCamp.bko.total >= 8 ? 'border-red-200 bg-red-50' : ''}`}>
                  <p className="text-[10px] font-semibold uppercase text-gray-400">Ação BKO</p>
                  <p className="text-2xl font-black">{cpcPorCamp.bko.pct}% CPC</p>
                  <p className="text-xs text-gray-500">
                    {cpcPorCamp.bko.vendas} vendas · {cpcPorCamp.bko.total} tab. · ref. média do recorte (sem meta fixa)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ─── #12 TMA × Conversão (leitura por quadrantes) ─── */}
          {scatterTma.length >= 3 && scatterLeitura && (
            <div className="card p-5 shadow-sm mb-6">
              <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
                <Zap size={14} /> TMA × Conversão · leitura gerencial
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                Eixo X = TMA (s) · Y = conversão (sucesso÷tab) · bolha = volume.
                Linhas = mediana ({scatterLeitura.medTma}s · {scatterLeitura.medConv}%).
                {scatterLeitura.nZero > 0 ? ` · ${scatterLeitura.nZero}/${scatterLeitura.n} sem sucesso no recorte.` : ''}
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-emerald-700">Eficiente</p>
                  <p className="text-lg font-black text-emerald-800">{scatterLeitura.quad.eficiente}</p>
                  <p className="text-[10px] text-emerald-600">TMA↓ Conv↑</p>
                </div>
                <div className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-sky-700">Longo bom</p>
                  <p className="text-lg font-black text-sky-800">{scatterLeitura.quad.longoBom}</p>
                  <p className="text-[10px] text-sky-600">TMA↑ Conv↑</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-amber-700">Rápido sem venda</p>
                  <p className="text-lg font-black text-amber-800">{scatterLeitura.quad.rapido}</p>
                  <p className="text-[10px] text-amber-600">TMA↓ Conv↓</p>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-red-700">Risco</p>
                  <p className="text-lg font-black text-red-800">{scatterLeitura.quad.risco}</p>
                  <p className="text-[10px] text-red-600">TMA↑ Conv↓</p>
                </div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        type="number"
                        dataKey="tma"
                        name="TMA"
                        unit="s"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        domain={['dataMin - 5', 'dataMax + 5']}
                        label={{ value: 'TMA (s)', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#94a3b8' }}
                      />
                      <YAxis
                        type="number"
                        dataKey="conv"
                        name="Conv"
                        unit="%"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        domain={[0, 'auto']}
                        label={{ value: 'Conv %', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
                      />
                      <ReferenceLine x={scatterLeitura.medTma} stroke="#94a3b8" strokeDasharray="4 4" />
                      <ReferenceLine y={scatterLeitura.medConv} stroke="#94a3b8" strokeDasharray="4 4" />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as { nome: string; tma: number; conv: number; total: number };
                          return (
                            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                              <div className="font-semibold text-gray-800 mb-1">{d.nome}</div>
                              <div>TMA: <strong>{d.tma}s</strong></div>
                              <div>Conv: <strong>{d.conv}%</strong></div>
                              <div>Tabuladas: <strong>{d.total}</strong></div>
                            </div>
                          );
                        }}
                      />
                      <Scatter
                        name="Operadores"
                        data={scatterTma}
                        shape={(props: { cx?: number; cy?: number; payload?: { tma: number; conv: number; total: number } }) => {
                          const { cx = 0, cy = 0, payload } = props;
                          if (!payload) return <g />;
                          const r = Math.max(4, Math.min(14, 3 + Math.sqrt(payload.total)));
                          const baixoTma = payload.tma <= scatterLeitura.medTma;
                          const altaConv = payload.conv >= scatterLeitura.medConv && payload.conv > 0;
                          let fill = '#ef4444';
                          if (baixoTma && altaConv) fill = '#059669';
                          else if (!baixoTma && altaConv) fill = '#0284c7';
                          else if (baixoTma && !altaConv) fill = '#d97706';
                          return <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.85} stroke="#fff" strokeWidth={1} />;
                        }}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 text-xs">
                  <div>
                    <p className="font-semibold text-gray-700 mb-1">Melhor conversão</p>
                    {scatterLeitura.comVenda.length === 0 ? (
                      <p className="text-gray-400">Ninguém com sucesso no recorte.</p>
                    ) : (
                      <ul className="space-y-1">
                        {scatterLeitura.comVenda.map((o) => (
                          <li key={o.login} className="flex justify-between gap-2 tabular-nums">
                            <span className="truncate text-gray-700">{o.nome}</span>
                            <span className="shrink-0 text-emerald-700 font-semibold">{o.conv}% · {o.tma}s</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {scatterLeitura.zeradosLongos.length > 0 && (
                    <div>
                      <p className="font-semibold text-gray-700 mb-1">Zerados com TMA mais alto</p>
                      <ul className="space-y-1">
                        {scatterLeitura.zeradosLongos.map((o) => (
                          <li key={o.login} className="flex justify-between gap-2 tabular-nums">
                            <span className="truncate text-gray-700">{o.nome}</span>
                            <span className="shrink-0 text-red-600 font-semibold">0% · {o.tma}s · {o.total} tab</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
                    Verde = eficiente · azul = conversão com TMA alto · âmbar = rápido sem venda · vermelho = risco (lento e sem conversão).
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
