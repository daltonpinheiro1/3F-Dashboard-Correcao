import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Award,
  Calendar,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  FileDown,
  Flame,
  Package,
  Presentation,
  Radio,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
  Truck,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminLayout } from '../components/AdminLayout';
import { StaleDataBanner } from '../components/StaleDataBanner';
import { RrAcoesCiclo } from '../components/rr/RrAcoesCiclo';
import { RrBriefingView } from '../components/rr/RrBriefingView';
import { RrExceptionBoard } from '../components/rr/RrExceptionBoard';
import { RrFrasePodio } from '../components/rr/RrFrasePodio';
import { RrFunilStrip } from '../components/rr/RrFunilStrip';
import { RrGapOportunidades } from '../components/rr/RrGapOportunidades';
import { RrGrossDrill } from '../components/rr/RrGrossDrill';
import { RrPonteGap } from '../components/rr/RrPonteGap';
import { RrScorecard } from '../components/rr/RrScorecard';
import { RrSparkline } from '../components/rr/RrSparkline';
import { RrWarRoom } from '../components/rr/RrWarRoom';
import { ChipBar, KpiCard } from '../components/ui';
import { useEvaLive } from '../hooks/useEvaLive';
import { dataRefEva, horaBrt, isAbortError } from '../lib/brt';
import { dashboardSessionHeaders } from '../lib/dashboardSession';
import {
  fetchEvaPeriodo,
  isCampanhaOpValida,
  matchCampanhaComercial,
  resolveDiscagens,
  type CampanhaOp,
  type EvaPayload,
} from '../lib/evaDash';
import { fetchEvaPeriodoPaginas } from '../lib/evaPagesHistorical';
import { buildForecastDia, buildMonteCarloDia, vendasPorHoraFromSerie } from '../lib/horaPageData';
import { calcularMetaAprovadas } from '../lib/metasAprovadas';
import { buildAck, SLA_MIN, type RrAck } from '../lib/rrAcks';
import { fetchRrAcks, postRrAck } from '../lib/rrAcksApi';
import { acoesDoRecorte, acoesPendentesAnteriores } from '../lib/rrAcoes';
import { normalizarBriefingRr } from '../lib/rrBriefing';
import { fraseDaCasa, podioBanco } from '../lib/rrCultura';
import { cpcEvaSerie, type RrComparativo } from '../lib/rrComparativos';
import { fetchRrComparativos } from '../lib/rrComparativosFetch';
import { resolveDialCpcRr } from '../lib/rrDial';
import { buildRrExceptions } from '../lib/rrExceptions';
import { buildRrSnapshot, labelGapRitmo } from '../lib/rrExecutivo';
import { buildRrFunilDia } from '../lib/rrFunil';
import {
  RR_HORIZONTE_OPTIONS,
  isRrHorizonte,
  janelaRrHorizonte,
  labelRrHorizonte,
  type RrHorizonte,
} from '../lib/rrHorizonte';
import { decomporGapRr } from '../lib/rrOportunidades';
import { buildRrPeriodo } from '../lib/rrPeriodo';
import { buildRrPonte } from '../lib/rrPonte';
import { kpiFooter } from '../lib/rrKpiCatalog';
import { gerarPdfRr } from '../lib/rrPdf';
import { reconcileDetalhe, reconcileGrossEvaSms } from '../lib/rrReconcile';
import {
  RR_VISTA_OPTIONS,
  isRrVista,
  mostraRrBloco,
  produtividadeRr,
  tilesMensais,
  type RrVista,
} from '../lib/rrVista';
import {
  agregarCrivoEva,
  emptyRr360,
  fetchRr360,
  rr360PortAplicavel,
  type Rr360Bloco,
} from '../lib/rr360';
import { useFiltroEvaStore } from '../store/filtroStore';
import { useMetaCpcStore } from '../store/metaCpcStore';
import { useAuthStore } from '../store/authStore';

function n(v: number) {
  return v.toLocaleString('pt-BR');
}

function KpiSkeleton({ count }: { count: number }) {
  const cols = count <= 2 ? 'lg:grid-cols-2' : count === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4';
  return (
    <div className={`grid gap-2 sm:grid-cols-2 ${cols}`} role="status" aria-label="Carregando 360°">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card h-28 skeleton" aria-hidden />
      ))}
    </div>
  );
}

const RR_HORIZONTE_CHIPS = RR_HORIZONTE_OPTIONS.map((o) => ({
  id: o.id,
  label: o.label,
  icon:
    o.id === 'realtime'
      ? Zap
      : o.id === 'semanal'
        ? Calendar
        : o.id === 'quinzenal' || o.id === 'mensal'
          ? CalendarDays
          : CalendarRange,
}));

const RR_VISTA_CHIPS = RR_VISTA_OPTIONS.map((o) => ({ id: o.id, label: o.label }));

const RR_CAMPANHA_CHIPS = [
  { id: 'TODAS', label: 'Todas' },
  { id: 'PORTABILIDADE', label: 'Port', icon: Truck },
  { id: 'MIGRACAO', label: 'Mig', icon: Package },
  { id: 'ACAO_BKO', label: 'BKO', icon: Users },
  { id: 'CONTROLE_CONTROLE', label: 'Ctrl', icon: Radio },
  { id: 'ALGAR', label: 'Algar', icon: Wifi },
];

export function RrPage() {
  const campanha = useFiltroEvaStore((s) => s.campanha) as CampanhaOp;
  const setCampanha = useFiltroEvaStore((s) => s.setCampanha);
  const loc = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const kiosk = loc.pathname === '/rr/tv';
  const userEmail = useAuthStore((s) => s.userEmail);
  const userName = useAuthStore((s) => s.userName);
  const userRole = useAuthStore((s) => s.userRole);
  const metaPort = useMetaCpcStore((s) => s.metaVendasMesPort);
  const metaMig = useMetaCpcStore((s) => s.metaVendasMesMig);
  const metaBko = useMetaCpcStore((s) => s.metaVendasMesBko);
  const expPort = useMetaCpcStore((s) => s.expedienteHorasPort);
  const expMig = useMetaCpcStore((s) => s.expedienteHorasMig);
  const expBko = useMetaCpcStore((s) => s.expedienteHorasBko);

  const { data, isLoading, refreshing, fetchError, lastUpdate, loadLive, stale, ageMs } = useEvaLive({
    pollMs: 30_000,
    enablePoll: true,
  });

  const [horizonte, setHorizonte] = useState<RrHorizonte>('realtime');
  const [vista, setVista] = useState<RrVista>('tudo');
  const [periodoHist, setPeriodoHist] = useState<EvaPayload[]>([]);
  const [periodoInfo, setPeriodoInfo] = useState({
    loading: false,
    truncado: false,
    from: '',
    to: '',
    faltando: 0,
    pedidoN: 0,
  });

  const [apresentacao, setApresentacao] = useState(false);
  const [rr360, setRr360] = useState<Rr360Bloco | null>(null);
  const [rr360Loading, setRr360Loading] = useState(false);
  const [cmp, setCmp] = useState<RrComparativo | null>(null);
  const [briefing, setBriefing] = useState('');
  const [briefingErro, setBriefingErro] = useState('');
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [monthHist, setMonthHist] = useState<EvaPayload[]>([]);
  const [monthMissing, setMonthMissing] = useState(0);
  const [acks, setAcks] = useState<RrAck[]>([]);
  const [drill, setDrill] = useState<'gross' | 'erro' | null>(null);
  const gen360 = useRef(0);
  const abort360 = useRef<AbortController | null>(null);
  const autoBriefKey = useRef('');

  useEffect(() => {
    const c = (searchParams.get('campanha') || '').toUpperCase();
    if (isCampanhaOpValida(c)) {
      setCampanha(c);
    }
    const h = (searchParams.get('horizonte') || '').toLowerCase();
    if (isRrHorizonte(h)) setHorizonte(h);
    const v = (searchParams.get('vista') || '').toLowerCase();
    if (isRrVista(v)) setVista(v);
  }, [searchParams, setCampanha]);

  const applyHorizonte = useCallback(
    (id: string) => {
      if (!isRrHorizonte(id)) return;
      setHorizonte(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id === 'realtime') next.delete('horizonte');
          else next.set('horizonte', id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const applyVista = useCallback(
    (id: string) => {
      if (!isRrVista(id)) return;
      setVista(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id === 'tudo') next.delete('vista');
          else next.set('vista', id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (!apresentacao) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setApresentacao(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apresentacao]);

  const horaAtual = horaBrt();
  const dataRefIso = dataRefEva(data);
  const mes = dataRefIso.slice(0, 7);
  const portAplicavel = rr360PortAplicavel(campanha);

  useEffect(() => {
    if (!data?.data) return;
    const ac = new AbortController();
    void fetchEvaPeriodo(`${data.data.slice(0, 7)}-01`, data.data, ac.signal)
      .then(({ dias, faltando }) => {
        setMonthHist(dias);
        setMonthMissing(
          faltando.filter(
            (iso) => iso !== data.data && new Date(`${iso}T12:00:00`).getDay() !== 0,
          ).length,
        );
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setMonthHist([]);
          setMonthMissing(0);
        }
      });
    return () => ac.abort();
  }, [data?.data]);

  const janelaH = useMemo(() => janelaRrHorizonte(dataRefIso, horizonte), [dataRefIso, horizonte]);

  useEffect(() => {
    if (!dataRefIso || horizonte === 'realtime') {
      setPeriodoHist([]);
      setPeriodoInfo({ loading: false, truncado: false, from: '', to: '', faltando: 0, pedidoN: 0 });
      return;
    }
    const ac = new AbortController();
    setPeriodoInfo((p) => ({ ...p, loading: true, from: janelaH.from, to: janelaH.to }));
    void fetchEvaPeriodoPaginas(janelaH.from, janelaH.to, ac.signal, { max: janelaH.maxDias })
      .then((r) => {
        setPeriodoHist(r.dias);
        setPeriodoInfo({
          loading: false,
          truncado: r.truncado,
          from: r.recorteFrom || janelaH.from,
          to: r.recorteTo || janelaH.to,
          faltando: r.faltando.length,
          pedidoN: r.pedidoN,
        });
      })
      .catch((e) => {
        if (isAbortError(e) || (e instanceof DOMException && e.name === 'AbortError')) return;
        setPeriodoHist([]);
        setPeriodoInfo({ loading: false, truncado: false, from: janelaH.from, to: janelaH.to, faltando: 0, pedidoN: 0 });
      });
    return () => ac.abort();
  }, [dataRefIso, horizonte, janelaH.from, janelaH.to, janelaH.maxDias]);

  const jornadaFiltrada = useMemo(
    () => (data?.jornada || []).filter((j) => matchCampanhaComercial(j, campanha)),
    [data, campanha],
  );

  const load360 = useCallback(
    async (force: boolean) => {
      if (!data) return;
      const my = ++gen360.current;
      abort360.current?.abort();
      const ac = new AbortController();
      abort360.current = ac;
      setRr360Loading(true);
      try {
        const bloco = await fetchRr360({
          dataRef: dataRefIso,
          mes,
          eva: data,
          jornadaFiltrada,
          campanha,
          signal: ac.signal,
          force,
        });
        if (my !== gen360.current || ac.signal.aborted) return;
        setRr360(bloco);
      } catch (e) {
        if (my !== gen360.current || isAbortError(e)) return;
        setRr360({
          ...emptyRr360(mes, dataRefIso),
          aplicavel: portAplicavel,
          erros: [e instanceof Error ? e.message : String(e)],
        });
      } finally {
        if (my === gen360.current) setRr360Loading(false);
      }
    },
    [data, dataRefIso, mes, jornadaFiltrada, campanha, portAplicavel],
  );

  // Recorte (data/campanha): aborta fetch anterior. Poll EVA não entra aqui — só crivo abaixo.
  const recorteKey = `${dataRefIso}|${mes}|${campanha}|${data ? '1' : '0'}`;
  useEffect(() => {
    if (!data) return;
    setRr360(null);
    void load360(false);
    return () => abort360.current?.abort();
    // load360 captura jornada do recorte; reexecutar a cada poll re-paginaria.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorteKey]);

  useEffect(() => {
    if (!data) return;
    setRr360((prev) => {
      if (!prev) return prev;
      const crivo = agregarCrivoEva(jornadaFiltrada, data.kpis_chamadas ?? null, campanha);
      return { ...prev, ...crivo };
    });
  }, [jornadaFiltrada, campanha, data]);

  const metaVendasMesStore =
    campanha === 'MIGRACAO'
      ? metaMig
      : campanha === 'PORTABILIDADE'
        ? metaPort
        : campanha === 'ACAO_BKO'
          ? metaBko
          : campanha === 'CONTROLE_CONTROLE'
            ? 0
            : campanha === 'ALGAR'
              ? 0
            : metaPort + metaMig;
  // Bug fix: para "TODAS", usar a média ponderada dos expedientes em vez de Math.max.
  // Math.max inflava artificialmente o expediente de "Todas" (ex.: Port 8h, Mig 6h → 8h
  // para ambas), fazendo metaDia e ritmo ficarem incorretos para Migração.
  const expedienteStore =
    campanha === 'MIGRACAO'
      ? expMig
      : campanha === 'PORTABILIDADE'
        ? expPort
        : campanha === 'ACAO_BKO'
          ? expBko
          : campanha === 'CONTROLE_CONTROLE'
            ? expPort
            : campanha === 'ALGAR'
              ? expPort
            : Math.round((expPort + expMig) / 2);

  const metaVendasMes = metaVendasMesStore;
  const expediente = expedienteStore;
  const metaAprovadas = useMemo(() => {
    if (!data) return null;
    return calcularMetaAprovadas({
      payloads: [...monthHist.filter((p) => p.data !== data.data), data],
      campanha,
      metaMensal: metaVendasMes,
      dataRef: dataRefIso,
      expedienteHoras: expediente,
      horaAtual,
      diaEmAberto: true,
    });
  }, [data, monthHist, campanha, metaVendasMes, dataRefIso, expediente, horaAtual]);

  const snap = useMemo(() => {
    if (!data) return null;
    return buildRrSnapshot({
      dataRef: dataRefIso,
      campanha,
      horaAtual,
      serie: data.serie_hora || [],
      horaSupervisor: data.hora_supervisor || [],
      jornada: jornadaFiltrada,
      ativos: data.ativas || [],
      metaVendasMes,
      expedienteHoras: expediente,
    });
  }, [data, campanha, metaVendasMes, expediente, dataRefIso, horaAtual, jornadaFiltrada]);

  const payloadsPeriodo = useMemo(() => {
    const by = new Map<string, EvaPayload>();
    for (const p of periodoHist) {
      const d = (p.data || '').slice(0, 10);
      if (d) by.set(d, p);
    }
    if (data?.data) by.set(data.data.slice(0, 10), data);
    return [...by.values()];
  }, [periodoHist, data]);

  const periodoSnap = useMemo(() => {
    if (horizonte === 'realtime') return null;
    return buildRrPeriodo({
      payloads: payloadsPeriodo,
      campanha,
      metaMensal: metaVendasMes,
      from: periodoInfo.from || janelaH.from,
      to: periodoInfo.to || janelaH.to,
      truncado: periodoInfo.truncado,
      pedidoDias: periodoInfo.pedidoN || janelaH.pedidoDias,
    });
  }, [horizonte, payloadsPeriodo, campanha, metaVendasMes, periodoInfo, janelaH]);

  const isLive = horizonte === 'realtime';
  const heroSups = useMemo(
    () => (isLive ? snap?.supervisores || [] : periodoSnap?.supervisores || []),
    [isLive, snap, periodoSnap],
  );
  const heroVendas = isLive ? snap?.vendas ?? 0 : periodoSnap?.vendas ?? 0;
  const heroMeta = isLive ? snap?.metaDia ?? 0 : periodoSnap?.meta ?? 0;
  const heroGap = isLive ? snap?.gap ?? 0 : periodoSnap?.gap ?? 0;
  const heroPct = isLive ? snap?.pctMetaDia ?? 0 : periodoSnap?.pctMeta ?? 0;
  const heroCpc = isLive ? snap?.pctCpcGeral ?? 0 : periodoSnap?.cpcPct ?? 0;
  const heroGapLabel = labelGapRitmo(heroGap);
  const janelaKpi = isLive ? 'Live' : labelRrHorizonte(horizonte);

  const gapIntel = useMemo(
    () =>
      decomporGapRr(heroSups, {
        ofensoresCriticos: isLive ? snap?.ofensoresCriticos : 0,
        ofensoresAltos: isLive ? snap?.ofensoresAltos : 0,
      }),
    [heroSups, isLive, snap?.ofensoresCriticos, snap?.ofensoresAltos],
  );

  const payloadsPonte = useMemo(
    () => (isLive ? (data ? [data] : []) : payloadsPeriodo),
    [isLive, data, payloadsPeriodo],
  );

  const ponte = useMemo(
    () =>
      buildRrPonte({
        campanha,
        payloads: payloadsPonte,
        metaPort,
        metaMig,
        from: isLive ? dataRefIso : periodoSnap?.from || janelaH.from,
        to: isLive ? dataRefIso : periodoSnap?.to || janelaH.to,
        supervisores: heroSups,
      }),
    [campanha, payloadsPonte, metaPort, metaMig, isLive, dataRefIso, periodoSnap, janelaH, heroSups],
  );

  const prod = useMemo(() => {
    const horas = isLive ? Math.max(0.5, expediente - (snap?.horasRestantes ?? expediente)) : 0;
    return produtividadeRr({
      vendas: heroVendas,
      logados: snap?.logados ?? 0,
      horasTrabalhadas: horas,
    });
  }, [isLive, expediente, snap, heroVendas]);

  const mesTiles = useMemo(
    () => (horizonte === 'semestral' && periodoSnap ? tilesMensais(periodoSnap.pontos) : []),
    [horizonte, periodoSnap],
  );

  const ver = (bloco: Exclude<RrVista, 'tudo'>) => mostraRrBloco(vista, bloco);

  const frase = useMemo(
    () =>
      fraseDaCasa({
        gap: heroGap,
        pctMeta: heroPct,
        mix: ponte.mix,
        ofensores: isLive
          ? (snap?.ofensoresCriticos ?? 0) + (snap?.ofensoresAltos ?? 0)
          : 0,
      }),
    [heroGap, heroPct, ponte.mix, isLive, snap?.ofensoresCriticos, snap?.ofensoresAltos],
  );
  const cultura = useMemo(() => podioBanco(heroSups), [heroSups]);

  const serieF = useMemo(
    () => (data?.serie_hora || []).filter((r) => matchCampanhaComercial(r, campanha)),
    [data, campanha],
  );

  const forecast = useMemo(() => {
    if (!snap) return null;
    return buildForecastDia(serieF, snap.vendas, snap.horasRestantes, snap.metaDia);
  }, [serieF, snap]);

  const mc = useMemo(() => {
    if (!forecast) return null;
    return buildMonteCarloDia(forecast, vendasPorHoraFromSerie(serieF));
  }, [forecast, serieF]);

  const dialCpc = useMemo(() => {
    if (!data) return { dialed: 0, cpc: 0, semFatia: true };
    const disc = resolveDiscagens(data);
    return resolveDialCpcRr({
      campanha,
      porCampanha: disc.por_campanha,
      jornadaCpc: jornadaFiltrada.reduce((s, j) => s + (j.cpc || 0), 0),
    });
  }, [data, campanha, jornadaFiltrada]);

  const funil = useMemo(
    () =>
      buildRrFunilDia({
        dialed: dialCpc.dialed,
        cpc: dialCpc.cpc || jornadaFiltrada.reduce((s, j) => s + (j.cpc || 0), 0),
        sucessoEva: snap?.vendas ?? 0,
        aprovadas: rr360?.aprovadas ?? 0,
        gross: portAplicavel && rr360 ? rr360.vendasBrutas : null,
        entregues: portAplicavel && rr360 ? rr360.entregues : null,
        portadoTim: portAplicavel && rr360 ? rr360.funilSucessoTim : null,
      }),
    [dialCpc, snap, rr360, portAplicavel, jornadaFiltrada],
  );

  const reconcile = useMemo(() => {
    if (!portAplicavel || !snap || !rr360) return null;
    return reconcileGrossEvaSms(snap.vendas, rr360.vendasBrutas);
  }, [portAplicavel, snap, rr360]);

  const exceptions = useMemo(
    () =>
      buildRrExceptions({
        taxaErroPct: rr360?.taxaErroPct ?? 0,
        emTransito: rr360?.emTransito ?? 0,
        funilUniverso: rr360?.funilUniverso ?? 0,
        gap: snap?.gap ?? 0,
        ofensoresCriticos: snap?.ofensoresCriticos ?? 0,
        stale,
        reconcileAlerta: Boolean(reconcile?.alerta),
        reconcileDetalhe: reconcile ? reconcileDetalhe(reconcile) : undefined,
        aplicavel360: portAplicavel,
      }),
    [rr360, snap, stale, reconcile, portAplicavel],
  );

  useEffect(() => {
    if (!dataRefIso) return;
    let cancelled = false;
    void fetchRrAcks(dataRefIso, campanha).then((rows) => {
      if (!cancelled) setAcks(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [dataRefIso, campanha]);

  const assumirAlerta = useCallback(
    (item: { id: string; nivel: 'critico' | 'alto' }) => {
      const ack = buildAck({
        alertId: item.id,
        dataRef: dataRefIso,
        campanha,
        ownerEmail: userEmail || 'admin',
        ownerName: userName || userEmail || 'Admin',
        slaMin: SLA_MIN[item.nivel],
      });
      setAcks((prev) => [...prev.filter((a) => a.alertId !== ack.alertId), ack]);
      void postRrAck(ack);
    },
    [dataRefIso, campanha, userEmail, userName],
  );

  useEffect(() => {
    if (!snap) return;
    let cancelled = false;
    void fetchRrComparativos({
      dataRef: dataRefIso,
      campanha,
      hoje: {
        dia: dataRefIso,
        vendas: snap.vendas,
        cpcPct: cpcEvaSerie(serieF, campanha),
      },
    }).then((c) => {
      if (!cancelled) setCmp(c);
    });
    return () => {
      cancelled = true;
    };
  }, [dataRefIso, campanha, snap, serieF]);

  const refreshAll = useCallback(async () => {
    await loadLive(false);
    await load360(true);
  }, [loadLive, load360]);

  const gerarBriefing = useCallback(async () => {
    if (!snap) return;
    setBriefingLoading(true);
    setBriefingErro('');
    try {
      const r = await fetch('/api/rr-insight', {
        method: 'POST',
        headers: dashboardSessionHeaders(),
        body: JSON.stringify({
          dataRef: dataRefIso,
          campanha,
          horizonte,
          janela: {
            from: isLive ? dataRefIso : periodoSnap?.from || janelaH.from,
            to: isLive ? dataRefIso : periodoSnap?.to || janelaH.to,
            truncado: periodoSnap?.truncado || false,
            diasComDados: isLive ? 1 : periodoSnap?.diasComDados || 0,
          },
          vendasEva: heroVendas,
          metaDia: heroMeta,
          pctMeta: heroPct,
          gap: heroGap,
          gapPct: heroMeta ? Math.round((heroGap / heroMeta) * 1000) / 10 : 0,
          cpc: heroCpc,
          logados: isLive ? snap.logados : null,
          ofensoresCriticos: isLive ? snap.ofensoresCriticos : 0,
          gross: isLive && rr360?.aplicavel ? rr360.vendasBrutas : null,
          taxaErro: isLive && rr360?.aplicavel ? rr360.taxaErroPct : null,
          tim: isLive && rr360?.aplicavel ? rr360.funilSucessoTim : null,
          forecast: isLive ? forecast : null,
          monteCarlo: isLive ? mc : null,
          comparativo: isLive && cmp ? { vsD1: cmp.vsD1Pct, vsD7: cmp.vsD7Pct, mtd: cmp.mtdVendas } : null,
          exceptions: isLive ? exceptions.map((e) => e.titulo) : [],
          reconcile: isLive ? reconcile : null,
          fontesGap: gapIntel.fontes,
          oportunidades: gapIntel.oportunidades,
          mix: ponte.mix.map((f) => ({
            label: f.label,
            vendas: f.vendas,
            meta: Math.round(f.meta),
            gap: f.gap,
          })),
          acoesAbertas: acoesPendentesAnteriores(campanha, dataRefIso).map((a) => `${a.titulo} (${a.owner})`),
          forecastRealista: isLive ? forecast?.realista ?? null : null,
          probMeta: isLive ? mc?.probabilidade ?? null : null,
          topSup: heroSups.slice(0, 5).map((s) => ({
            supervisor: s.supervisor,
            vendas: s.vendas,
            pctMeta: s.pctMeta,
            gap: s.gap,
          })),
        }),
      });
      const body = (await r.json()) as { texto?: string; error?: string };
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setBriefing(normalizarBriefingRr(body.texto || ''));
    } catch (e) {
      setBriefingErro(e instanceof Error ? e.message : String(e));
    } finally {
      setBriefingLoading(false);
    }
  }, [
    snap,
    dataRefIso,
    campanha,
    horizonte,
    isLive,
    periodoSnap,
    janelaH,
    heroVendas,
    heroMeta,
    heroPct,
    heroGap,
    heroCpc,
    heroSups,
    gapIntel,
    ponte,
    rr360,
    forecast,
    mc,
    cmp,
    exceptions,
    reconcile,
  ]);

  useEffect(() => {
    if (kiosk || userRole !== 'admin' || !snap) return;
    if (!isLive && (periodoInfo.loading || !periodoSnap)) return;
    const key = `${dataRefIso}|${campanha}|${horizonte}`;
    if (autoBriefKey.current === key) return;
    autoBriefKey.current = key;
    setBriefing('');
    setBriefingErro('');
    void gerarBriefing();
  }, [
    kiosk,
    userRole,
    snap,
    isLive,
    periodoInfo.loading,
    periodoSnap,
    dataRefIso,
    campanha,
    horizonte,
    gerarBriefing,
  ]);

  const exportPdf = useCallback(async () => {
    if (!snap) return;
    setPdfBusy(true);
    try {
      const blob = await gerarPdfRr({
        dataRef: dataRefIso,
        campanha,
        snap,
        rr360,
        funil,
        cmp,
        exceptions,
        forecast,
        mc,
        reconcile,
        briefing,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RR-${dataRefIso}-${campanha}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfBusy(false);
    }
  }, [snap, dataRefIso, campanha, rr360, funil, cmp, exceptions, forecast, mc, reconcile, briefing]);

  const chartData = useMemo(
    () =>
      heroSups.slice(0, 10).map((s) => ({
        nome: s.supervisor.length > 14 ? `${s.supervisor.slice(0, 12)}…` : s.supervisor,
        vendas: s.vendas,
        meta: Math.round(s.metaDia),
        pct: s.pctMeta,
      })),
    [heroSups],
  );

  const toggleApresentacao = useCallback(() => {
    setApresentacao((v) => !v);
  }, []);

  const show360Skeleton = portAplicavel && rr360 == null && (rr360Loading || Boolean(data));

  const body = (
    <>
      {!apresentacao && (
        <div className="mb-4 flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ChipBar
              ariaLabel="Horizonte RR"
              variant="brand"
              active={horizonte}
              onChange={applyHorizonte}
              chips={RR_HORIZONTE_CHIPS}
            />
            <ChipBar
              ariaLabel="Campanha RR"
              active={campanha}
              onChange={(v) => setCampanha(v as CampanhaOp)}
              chips={RR_CAMPANHA_CHIPS}
            />
            <ChipBar ariaLabel="Visão RR" active={vista} onChange={applyVista} chips={RR_VISTA_CHIPS} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={refreshing || rr360Loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing || rr360Loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={toggleApresentacao}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Presentation size={14} />
              War room TV
            </button>
            <button
              type="button"
              onClick={() => void gerarBriefing()}
              disabled={briefingLoading || !snap}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
            >
              <Sparkles size={14} className={briefingLoading ? 'animate-pulse' : ''} />
              {briefingLoading ? 'Gerando IA…' : 'Atualizar briefing IA'}
            </button>
            <button
              type="button"
              onClick={() => void exportPdf()}
              disabled={pdfBusy || !snap}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <FileDown size={14} />
              PDF comitê
            </button>
            <span className="text-xs text-gray-400">
              {lastUpdate.toLocaleTimeString('pt-BR')}
              {snap ? ` · ${snap.dataRef}` : ''} · {labelRrHorizonte(horizonte)} · BRT
            </span>
          </div>
          {!isLive && (
            <p className="text-[11px] text-slate-500">
              {periodoInfo.loading
                ? `Carregando ${labelRrHorizonte(horizonte).toLowerCase()}…`
                : `${periodoInfo.from || janelaH.from} → ${periodoInfo.to || janelaH.to} · ${periodoSnap?.diasComDados ?? 0} dia(s) com dados`}
              {periodoInfo.truncado ? ' · teto 90 dias (semestral não baixa o semestre inteiro)' : ''}
              {periodoInfo.faltando > 0 ? ` · ${periodoInfo.faltando} snapshot(s) ausente(s)` : ''}
            </p>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        <span className="font-bold uppercase tracking-wide text-slate-400">Glossário</span>
        <span>
          <strong className="text-slate-800">Gross</strong> = OS+ICCID (Port)
        </span>
        <span>
          <strong className="text-slate-800">EVA</strong> = sucesso tabulado
        </span>
        <span>
          <strong className="text-slate-800">TIM</strong> = Portado+FP (mês)
        </span>
        {campanha === 'TODAS' && (
          <span className="text-slate-500">Todas = Port+Mig · BKO à parte</span>
        )}
      </div>

      <StaleDataBanner stale={stale} ageMs={ageMs} updatedAt={data?.updated_at} />

      {fetchError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {fetchError}
        </div>
      )}

      {rr360?.erros?.length ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800" role="status">
          <span className="mr-2 inline-flex rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase">
            Parcial
          </span>
          360° incompleto: {rr360.erros.join(' · ')}
        </div>
      ) : null}

      {!isLive && (
        <p className="mb-3 text-[11px] text-slate-500">
          Gross, funil TIM e ofensores abaixo continuam do dia ao vivo — a janela altera meta, EVA, gap e oportunidades.
        </p>
      )}

      {ver('qualidade') && <RrExceptionBoard items={exceptions} acks={acks} onAck={assumirAlerta} />}

      {ver('resultado') && isLive && cmp && (
        <section className="mb-4 grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Hoje EVA</p>
            <p className="text-2xl font-black tabular-nums">{n(cmp.hoje.vendas)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">vs D−1</p>
            <p className="text-2xl font-black tabular-nums">
              {cmp.d1 ? n(cmp.d1.vendas) : '—'}{' '}
              <span className="text-sm font-semibold text-slate-500">
                {cmp.vsD1Pct != null ? `${cmp.vsD1Pct > 0 ? '+' : ''}${cmp.vsD1Pct}%` : ''}
              </span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">vs D−7</p>
            <p className="text-2xl font-black tabular-nums">
              {cmp.d7 ? n(cmp.d7.vendas) : '—'}{' '}
              <span className="text-sm font-semibold text-slate-500">
                {cmp.vsD7Pct != null ? `${cmp.vsD7Pct > 0 ? '+' : ''}${cmp.vsD7Pct}%` : ''}
              </span>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">MTD EVA</p>
            <p className="text-2xl font-black tabular-nums">{n(cmp.mtdVendas)}</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">7 dias</p>
            <RrSparkline values={cmp.spark.map((p) => p.vendas)} labels={cmp.spark.map((p) => p.dia.slice(5))} />
          </div>
        </section>
      )}

      {ver('resultado') && !isLive && periodoSnap && (
        <section className="mb-4 grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Janela EVA</p>
            <p className="text-2xl font-black tabular-nums">{n(periodoSnap.vendas)}</p>
            <p className="text-[11px] text-slate-500">
              Meta {n(periodoSnap.meta)} · {periodoSnap.diasComDados}d
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Gap da janela</p>
            <p className={`text-2xl font-black tabular-nums ${periodoSnap.gap < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {periodoSnap.gap > 0 ? '+' : ''}
              {n(periodoSnap.gap)}
            </p>
            <p className="text-[11px] text-slate-500">{periodoSnap.pctMeta}% da meta</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">CPC da janela</p>
            <p className="text-2xl font-black tabular-nums">{periodoSnap.cpcPct}%</p>
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-bold uppercase text-slate-400">Série da janela</p>
            <RrSparkline
              values={periodoSnap.pontos.map((p) => p.vendas)}
              labels={periodoSnap.pontos.map((p) => p.dia.slice(5))}
            />
          </div>
        </section>
      )}

      {ver('resultado') && isLive && (forecast || mc) && (
        <section className="mb-4 grid gap-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-[10px] font-bold uppercase text-amber-800">Forecast realista</p>
            <p className="text-2xl font-black tabular-nums">{forecast ? n(forecast.realista) : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-amber-800">Otimista / pessimista</p>
            <p className="text-lg font-black tabular-nums">
              {forecast ? `${n(forecast.otimista)} / ${n(forecast.pessimista)}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-amber-800">Monte Carlo P50</p>
            <p className="text-2xl font-black tabular-nums">{mc ? n(mc.projecaoP50) : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-amber-800">P(atingir meta)</p>
            <p className="text-2xl font-black tabular-nums">{mc ? `${mc.probabilidade}%` : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-amber-800">P10 – P90</p>
            <p className="text-lg font-black tabular-nums">
              {mc ? `${n(mc.projecaoP10)} – ${n(mc.projecaoP90)}` : '—'}
            </p>
          </div>
        </section>
      )}

      {ver('qualidade') && (
        <>
      {reconcile && portAplicavel && (
        <div
          className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${
            reconcile.alerta ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          Reconcile Gross EVA ↔ SMS: {reconcileDetalhe(reconcile)}
          {rr360?.fonteGross === 'admin' ? ' · Gross via API admin' : ''}
        </div>
      )}

      <RrFunilStrip etapas={funil} />
      {dialCpc.semFatia ? (
        <p className="mb-4 text-[11px] text-slate-500">
          Discagem sem fatia por_campanha neste recorte — KPI global não entra (evitar BKO em Todas).
        </p>
      ) : null}

      {/* Dia — Gross Port */}
      <section className="mb-4 rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/80 to-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-sky-950">Dia · Gross Port</p>
            <p className="text-[11px] text-sky-800/70">
              OS+ICCID · qualidade · portados do dia {dataRefIso} (BRT)
              {rr360?.erros?.length ? (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                  parcial
                </span>
              ) : null}
            </p>
          </div>
          {rr360Loading && <span className="text-[11px] text-sky-600">Atualizando 360°…</span>}
        </div>
        {!portAplicavel ? (
          <p className="text-sm text-slate-600">
            Gross, erro e portados do dia são universo Port (sms_eficiencia / correção). Com recorte{' '}
            {campanha === 'MIGRACAO'
              ? 'Migração'
              : campanha === 'CONTROLE_CONTROLE'
                ? 'Controle Controle'
                : campanha === 'ALGAR'
                  ? 'Algar'
                : 'BKO'}{' '}
            o 360° não mistura números de outra campanha —
            use Port ou Todas.
          </p>
        ) : show360Skeleton ? (
          <KpiSkeleton count={4} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              janela="Dia"
              label="Vendas brutas (Gross)"
              value={n(rr360?.vendasBrutas ?? 0)}
              icon={Package}
              onClick={() => setDrill('gross')}
              footer={<span>{kpiFooter('gross_dia')} · clique para propostas</span>}
            />
            <KpiCard
              janela="Dia"
              label="Taxa de erro"
              value={`${rr360?.taxaErroPct ?? 0}%`}
              icon={AlertTriangle}
              warn={(rr360?.taxaErroPct ?? 0) >= 8}
              critical={(rr360?.taxaErroPct ?? 0) >= 15}
              onClick={() => setDrill('erro')}
              footer={
                <span>
                  {n(rr360?.comErro ?? 0)} de {n(rr360?.propostas ?? 0)} · {kpiFooter('erro_dia')}
                </span>
              }
            />
            <KpiCard
              janela="Dia"
              label="Portados (Gross dia)"
              value={n(rr360?.portadosConsolidado ?? 0)}
              icon={TrendingUp}
              footer={
                <span title="SMS consolidado: bilhete ou OS Concluído sem ticket. ≠ Disparos Portado e ≠ Portados hoje.">
                  {rr360?.pctPortadosGross ?? 0}% do Gross · {kpiFooter('portados_gross_dia')} · SMS consolidado
                </span>
              }
            />
            <KpiCard
              janela="Hoje BRT"
              label="Portados hoje (bilhete)"
              value={n(rr360?.portadosHoje ?? 0)}
              icon={Target}
              footer={
                <span title="Só bilhete (isPortadoComBilhete). ≠ consolidado SMS e ≠ card Portado de Disparos.">
                  {kpiFooter('portados_hoje_brt')} · só bilhete
                </span>
              }
            />
          </div>
        )}
      </section>

      {/* Mês — TIM / logística */}
      <section className="mb-6 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-4 shadow-sm">
        <div className="mb-3">
          <p className="text-sm font-bold text-indigo-950">Mês · TIM e logística</p>
          <p className="text-[11px] text-indigo-800/70">
            Cohort {mes} · entregues e sucesso TIM (Portado+FP) — não comparar com Gross do dia
          </p>
        </div>
        {!portAplicavel ? (
          <p className="text-sm text-slate-600">Funil TIM/logística é Port-centric. Recorte Mig/BKO não aplica.</p>
        ) : show360Skeleton ? (
          <KpiSkeleton count={3} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              janela="Mês"
              label="Entregues"
              value={n(rr360?.entregues ?? 0)}
              icon={Truck}
              footer={
                <span>
                  chip {n(rr360?.entreguesComChip ?? 0)} · sem {n(rr360?.entreguesSemChip ?? 0)} · trânsito{' '}
                  {n(rr360?.emTransito ?? 0)} · {kpiFooter('entregues_mes')}
                </span>
              }
            />
            <KpiCard
              janela="Mês"
              label="Sucesso TIM (P+FP)"
              value={n(rr360?.funilSucessoTim ?? 0)}
              icon={Target}
              footer={
                <span>
                  P {n(rr360?.funilPortados ?? 0)} + FP {n(rr360?.funilFalhaParcial ?? 0)} ·{' '}
                  {rr360?.taxaSucessoTimPct ?? 0}% do universo {n(rr360?.funilUniverso ?? 0)}
                </span>
              }
            />
            <KpiCard
              janela="Dia EVA"
              label="Tx aprovadas (crivo)"
              value={`${rr360?.taxaAprovadasPct ?? 0}%`}
              icon={CheckCircle2}
              footer={
                <span>
                  {n(rr360?.aprovadas ?? 0)}/{n(rr360?.sucessoEva ?? 0)}
                  {rr360?.isizeCruzamento ? ' · iSize Port' : ' · EVA recorte'}
                </span>
              }
            />
          </div>
        )}
      </section>
        </>
      )}

      {isLoading && !snap ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-28 skeleton" />
          ))}
        </div>
      ) : snap ? (
        <>
          <RrFrasePodio frase={frase} podio={cultura.podio} banco={cultura.banco} />
          {ver('resultado') && (
            <>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {isLive ? 'Live EVA · meta e ofensores' : `${labelRrHorizonte(horizonte)} · EVA da janela`}
            {campanha === 'TODAS' ? ' · Port+Mig' : ''}
          </p>
          {isLive && metaAprovadas && (
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                janela="Mês"
                label="Aprovadas MTD"
                value={n(metaAprovadas.aprovadasMes)}
                icon={CheckCircle2}
                footer={<span>Meta {n(metaAprovadas.metaMensal)} · {monthMissing} snapshot(s) ausente(s)</span>}
              />
              <KpiCard
                janela="Mês"
                label="Atingimento aprovadas"
                value={`${metaAprovadas.atingimentoPct}%`}
                icon={Target}
                warn={metaAprovadas.atingimentoPct < 80}
                footer={<span>Faltam {n(metaAprovadas.necessidadeMensal)}</span>}
              />
              <KpiCard
                janela="Necessidade"
                label="Aprovadas por dia"
                value={n(metaAprovadas.necessidadePorDia)}
                icon={TrendingUp}
                footer={<span>Meta-base {n(metaAprovadas.metaBaseDia)}</span>}
              />
              <KpiCard
                janela="Necessidade"
                label="Aprovadas por hora"
                value={n(metaAprovadas.necessidadePorHora)}
                icon={Target}
                footer={<span>{n(metaAprovadas.aprovadasDia)} aprovadas hoje</span>}
              />
            </div>
          )}
          <div className="mb-6 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              janela={janelaKpi}
              label="Sucessos EVA"
              value={n(heroVendas)}
              icon={TrendingUp}
              footer={
                <span>
                  Referência {n(heroMeta)} · {kpiFooter('eva_sucesso')}
                </span>
              }
            />
            <KpiCard
              janela={janelaKpi}
              label={isLive ? '% da meta do dia' : '% da meta da janela'}
              value={`${heroPct}%`}
              icon={Target}
              warn={heroPct < 80}
              critical={heroPct < 60}
              footer={
                <span>
                  {heroGapLabel.texto} ({heroMeta ? Math.round((heroGap / heroMeta) * 1000) / 10 : 0}%)
                </span>
              }
            />
            {isLive ? (
              <KpiCard
                janela="Live"
                label="Ritmo residual"
                value={n(snap.metaHoraRestante)}
                icon={Target}
                footer={
                  <span>
                    Faltam {n(snap.metaRestante)} · {snap.horasRestantes}h
                  </span>
                }
              />
            ) : (
              <KpiCard
                janela={janelaKpi}
                label="Gap da janela"
                value={`${heroGap > 0 ? '+' : ''}${n(heroGap)}`}
                icon={Target}
                warn={heroGap < 0}
                footer={<span>Vendas {n(heroVendas)} vs meta {n(heroMeta)}</span>}
              />
            )}
            <KpiCard janela={janelaKpi} label="CPC geral" value={`${heroCpc}%`} icon={Users} />
            {isLive ? (
              <KpiCard janela="Live" label="Logados" value={n(snap.logados)} icon={Users} footer={<span>{kpiFooter('eva_logados')}</span>} />
            ) : (
              <KpiCard
                janela={janelaKpi}
                label="Dias com dados"
                value={n(periodoSnap?.diasComDados ?? 0)}
                icon={CalendarDays}
                footer={<span>Pedido {n(periodoSnap?.pedidoDias ?? janelaH.pedidoDias)}</span>}
              />
            )}
            <KpiCard
              janela={isLive ? 'Live' : janelaKpi}
              label="Ofensores"
              value={n(snap.ofensoresCriticos + snap.ofensoresAltos)}
              icon={AlertTriangle}
              warn={snap.ofensoresAltos > 0}
              critical={snap.ofensoresCriticos > 0}
              footer={
                <span>
                  {snap.ofensoresCriticos} críticos · {snap.ofensoresAltos} altos
                  {isLive ? '' : ' · do dia live'}
                </span>
              }
            />
          </div>
            </>
          )}

          {ver('resultado') && mesTiles.length > 0 && (
            <section className="mb-6 min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-bold text-gray-800">Semestral · tiles mensais</p>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {mesTiles.map((t) => (
                  <div key={t.mes} className="rounded-lg border border-slate-100 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase text-slate-400">{t.mes}</p>
                    <p className="text-lg font-black tabular-nums">{n(t.vendas)}</p>
                    <p className="text-[11px] text-slate-500">{t.dias}d com dados</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {ver('drivers') && <RrPonteGap ponte={ponte} />}
          {ver('drivers') && (
            <RrGapOportunidades fontes={gapIntel.fontes} oportunidades={gapIntel.oportunidades} gap={heroGap} />
          )}
          {ver('drivers') && (
            <RrScorecard
              lag={[
                { label: 'EVA da janela', valor: n(heroVendas), warn: heroGap < 0 },
                { label: '% meta', valor: `${heroPct}%`, warn: heroPct < 80 },
                { label: 'Gap', valor: `${heroGap > 0 ? '+' : ''}${n(heroGap)}`, warn: heroGap < 0 },
                ...(portAplicavel && rr360
                  ? [{ label: 'Gross do dia', valor: n(rr360.vendasBrutas) }]
                  : []),
              ]}
              lead={[
                { label: 'CPC', valor: `${heroCpc}%`, warn: heroCpc < 50 },
                { label: 'Logados', valor: n(snap.logados) },
                {
                  label: 'Ofensores',
                  valor: n(snap.ofensoresCriticos + snap.ofensoresAltos),
                  warn: snap.ofensoresCriticos > 0,
                },
                {
                  label: 'Erro cadastral',
                  valor: portAplicavel && rr360 ? `${rr360.taxaErroPct}%` : '—',
                  warn: (rr360?.taxaErroPct ?? 0) >= 8,
                },
              ]}
            />
          )}

          {ver('capacidade') && (
            <div className="mb-6 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard janela={janelaKpi} label="Logados" value={n(snap.logados)} icon={Users} footer={<span>{kpiFooter('eva_logados')}</span>} />
              <KpiCard
                janela={janelaKpi}
                label="Sucesso / login"
                value={n(prod.porLogin)}
                icon={Target}
                footer={<span>EVA da janela ÷ logados do dia</span>}
              />
              <KpiCard
                janela={isLive ? 'Live' : janelaKpi}
                label="Sucesso / hora-login"
                value={isLive ? n(prod.porHoraLogin) : '—'}
                icon={TrendingUp}
                footer={<span>Só realtime (horas já trabalhadas)</span>}
              />
              <KpiCard
                janela="Live"
                label="Horas restantes"
                value={n(snap.horasRestantes)}
                icon={CalendarDays}
                footer={<span>Ritmo residual {n(snap.metaHoraRestante)}/h</span>}
              />
            </div>
          )}

          {ver('resultado') && (
          <div className={`mb-6 grid min-w-0 gap-4 ${apresentacao ? 'lg:grid-cols-1' : 'lg:grid-cols-5'}`}>
            <div className={`card min-w-0 p-4 shadow-sm ${apresentacao ? '' : 'lg:col-span-3'}`}>
              <p className="mb-1 text-sm font-bold text-gray-800">Resultado por supervisor</p>
              <p className="mb-3 text-xs text-gray-400">
                Vendas vs meta {isLive ? 'do dia' : 'da janela'} · ordenado por gap
              </p>
              <div className={`min-w-0 ${apresentacao ? 'h-80' : 'h-72'}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="nome"
                      interval={0}
                      angle={-32}
                      textAnchor="end"
                      height={56}
                      tick={{ fontSize: apresentacao ? 12 : 10, fill: '#64748b' }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="meta" name="Meta" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="vendas" name="Vendas" radius={[4, 4, 0, 0]}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={d.pct >= 100 ? '#059669' : d.pct >= 80 ? '#0ea5e9' : '#f59e0b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {!apresentacao && (
              <div className="card p-4 shadow-sm lg:col-span-2">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-800">
                  <Award size={16} className="text-amber-500" />
                  Destaques
                </p>
                <ul className="space-y-2">
                  {snap.destaques.slice(0, 8).map((d, i) => (
                    <li
                      key={`${d.tipo}-${d.titulo}-${i}`}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        d.tipo === 'melhor'
                          ? 'border-emerald-100 bg-emerald-50/60'
                          : d.tipo === 'pior'
                            ? 'border-amber-100 bg-amber-50/60'
                            : 'border-rose-100 bg-rose-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-gray-900">{d.titulo}</span>
                        {d.valor && (
                          <span className="text-xs font-bold uppercase tabular-nums text-gray-600">{d.valor}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{d.detalhe}</p>
                    </li>
                  ))}
                  {!snap.destaques.length && (
                    <li className="text-xs text-gray-400">Sem destaques no recorte.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          )}

          {!apresentacao && (
            <>
              {ver('resultado') && (
              <div className="card mb-6 min-w-0 overflow-hidden shadow-sm">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-bold text-gray-800">Alcance da meta · supervisores</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-2">Supervisor</th>
                        <th className="px-4 py-2 text-right">Vendas</th>
                        <th className="px-4 py-2 text-right">{isLive ? 'Meta dia' : 'Meta janela'}</th>
                        <th className="px-4 py-2 text-right">% meta</th>
                        <th className="px-4 py-2 text-right">{isLive ? 'Ritmo' : 'Gap'}</th>
                        <th className="px-4 py-2 text-right">CPC%</th>
                        {isLive ? <th className="px-4 py-2 text-right">Logados</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {heroSups.map((s) => {
                        const g = labelGapRitmo(s.gap);
                        const liveRow = isLive ? snap.supervisores.find((x) => x.supervisor === s.supervisor) : undefined;
                        return (
                          <tr key={s.supervisor} className="border-t border-slate-100">
                            <td className="px-4 py-2 font-medium text-gray-900">{s.supervisor}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{n(s.vendas)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-500">{n(Math.round(s.metaDia))}</td>
                            <td
                              className={`px-4 py-2 text-right font-semibold tabular-nums ${
                                s.pctMeta >= 100
                                  ? 'text-emerald-600'
                                  : s.pctMeta >= 80
                                    ? 'text-sky-600'
                                    : 'text-amber-600'
                              }`}
                            >
                              {s.pctMeta}%
                            </td>
                            <td
                              className={`px-4 py-2 text-right text-xs tabular-nums ${
                                g.acima ? 'text-emerald-700' : g.abaixo ? 'text-amber-700' : 'text-slate-500'
                              }`}
                            >
                              {isLive ? g.texto : `${s.gap > 0 ? '+' : ''}${n(s.gap)}`}
                            </td>
                            <td
                              className={`px-4 py-2 text-right tabular-nums ${s.alertaCpc ? 'font-bold text-rose-600' : ''}`}
                            >
                              {s.pctCpc}%
                            </td>
                            {isLive ? (
                              <td className="px-4 py-2 text-right tabular-nums">
                                {liveRow ? `${liveRow.logados}/${liveRow.operadores}` : '—'}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                      {!heroSups.length && (
                        <tr>
                          <td colSpan={isLive ? 7 : 6} className="px-4 py-8 text-center text-gray-400">
                            Sem dados de supervisor no recorte.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              {ver('qualidade') && (
              <div className="card p-4 shadow-sm">
                <p className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-800">
                  <Flame size={16} className="text-rose-500" />
                  Ofensores do dia
                </p>
                {!snap.ofensores.length ? (
                  <p className="text-sm text-gray-400">Nenhum ofensor crítico/alto no recorte.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {snap.ofensores.map((o) => (
                      <Link
                        key={o.login}
                        to="/hora"
                        className={`rounded-lg border px-3 py-2 ${
                          o.nivel === 'critico'
                            ? 'border-rose-200 bg-rose-50/70'
                            : o.nivel === 'alto'
                              ? 'border-amber-200 bg-amber-50/70'
                              : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900">{o.nome || o.login}</p>
                          <span className="text-[10px] font-bold uppercase text-gray-500">{o.nivel}</span>
                        </div>
                        <p className="text-xs text-gray-500">{o.supervisor}</p>
                        <p className="mt-1 text-xs text-gray-600">
                          {o.focos
                            .slice(0, 2)
                            .map((f) => f.titulo)
                            .join(' · ') || '—'}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              )}
            </>
          )}

          {ver('pauta') && (
            <>
              <div className="card mb-6 min-w-0 p-4 shadow-sm">
                <p className="mb-1 flex items-center gap-2 text-sm font-bold text-gray-800">
                  <Sparkles size={16} className="text-violet-600" />
                  Briefing executivo (IA)
                </p>
                <p className="mb-3 text-[11px] text-gray-400">
                  {labelRrHorizonte(horizonte)} · {campanha === 'TODAS' ? 'Port+Mig' : campanha} · markdown de comitê, nunca
                  JSON
                </p>
                {briefingLoading && <p className="text-sm text-violet-600">Gerando…</p>}
                {briefingErro && <p className="text-sm text-rose-600">{briefingErro}</p>}
                {briefing ? (
                  <RrBriefingView texto={briefing} />
                ) : !briefingLoading && !briefingErro ? (
                  <p className="text-sm text-slate-500">
                    {userRole === 'admin'
                      ? 'O briefing dispara sozinho neste recorte. Use o botão para gerar de novo.'
                      : 'Peça a um admin para gerar o briefing deste recorte.'}
                  </p>
                ) : null}
              </div>
              <RrAcoesCiclo
                dataRef={dataRefIso}
                campanha={campanha}
                horizonte={horizonte}
                ownerDefault={userName || userEmail || 'RR'}
                podeEditar={userRole === 'admin'}
              />
            </>
          )}
        </>
      ) : (
        <div className="card p-12 text-center text-gray-400">Sem dados EVA live.</div>
      )}
      {drill ? (
        <RrGrossDrill
          titulo={drill === 'gross' ? `Gross do dia ${dataRefIso}` : `Erros do dia ${dataRefIso}`}
          itens={drill === 'gross' ? rr360?.listaGross || [] : rr360?.listaErro || []}
          onClose={() => setDrill(null)}
        />
      ) : null}
    </>
  );

  const warRoomProps = snap
    ? {
        dataRef: dataRefIso,
        campanha,
        horizonte,
        isLive,
        snap,
        heroVendas,
        heroMeta,
        heroPct,
        heroGap,
        heroCpc,
        heroSups,
        ponte,
        fontes: gapIntel.fontes,
        oportunidades: gapIntel.oportunidades,
        acoesAbertas: [
          ...acoesPendentesAnteriores(campanha, dataRefIso),
          ...acoesDoRecorte(campanha, horizonte).filter((a) => a.status === 'aberta' && a.dataRef === dataRefIso),
        ].map((a) => ({ id: a.id, titulo: a.titulo, owner: a.owner, prazo: a.prazo })),
        rr360,
        funil,
        exceptions,
        forecast: isLive ? forecast : null,
        mc: isLive ? mc : null,
        cmp,
        briefing,
        frase,
        podio: cultura.podio,
        banco: cultura.banco,
      }
    : null;

  if (kiosk) {
    if (!warRoomProps) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-950 text-white" role="status">
          <p className="text-sm font-semibold">
            {fetchError && !isLoading ? fetchError : 'Carregando RR TV…'}
          </p>
        </div>
      );
    }
    return <RrWarRoom kiosk {...warRoomProps} onExit={() => undefined} />;
  }

  if (apresentacao && warRoomProps) {
    return <RrWarRoom {...warRoomProps} onExit={() => setApresentacao(false)} />;
  }

  return (
    <AdminLayout
      title="RR · Resultado Realizado"
      subtitle="Horizonte · visões · ponte do gap · ações · briefing em markdown"
    >
      {body}
    </AdminLayout>
  );
}
