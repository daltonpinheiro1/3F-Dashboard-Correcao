import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  Clock,
  Headphones,
  PauseCircle,
  RefreshCw,
  Search,
  Target,
  TrendingDown,
  Users,
  X,
} from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { SegControl, LIVE_HIST_OPTIONS } from '../components/ui';
import { OperadorFicha } from '../components/OperadorFicha';
import { OperacaoPulse } from '../components/operacao/OperacaoPulse';
import { OperacaoHeatmap } from '../components/operacao/OperacaoHeatmap';
import { OperacaoTrilha } from '../components/operacao/OperacaoTrilha';
import {
  PAUSA_META_PCT,
  calcularPerdas,
  consolidarSupervisores,
  dropFromDiscagens,
  dropPorLogin,
  dropRate,
  fetchEvaLive,
  fmtDur,
  fmtHms,
  fmtHora,
  fmtPerda,
  matchCampanha,
  resolveOpDrop,
  resolveSupDrop,
  somarPausas,
  CAMPANHA_FILTRO_OPTIONS,
  type CampanhaOp,
  type EvaAtivo,
  type EvaPayload,
} from '../lib/evaDash';
import {
  listarOfensores,
  ajustarDeslogueOperacional,
  buildUltimaAtividadePorLogin,
  diaJornadaOp,
  jornadaUnicaPorLogin,
  tempoDeslogueEfetivo,
  type FocoId,
} from '../lib/ofensorOp';
import { dataBrtIso, dataRefEva, horaBrt, shiftIsoDay } from '../lib/brt';
import { evaStaleMin } from '../lib/inteligenciaSnapshot';
import {
  OPERACAO_KA_SOM,
  OPERACAO_STALE_MIN,
  alertaFromLive,
  buildHeatmapOperacao,
  eixoTrilha7d,
  kaDoPiso,
  metaCasaOperacao,
  metaSupervisorOp,
  payloadHeatmapDia,
  trilhaOfensor,
  whatIfPiso,
} from '../lib/operacaoVisoes';
import { useTableSortFields } from '../lib/tableSort';
import { SortTh } from '../components/SortTh';
import { filtroEvaAtivo, useFiltroEvaStore } from '../store/filtroStore';
import { useMetaCpcStore } from '../store/metaCpcStore';
import { useOperacaoAlertaStore } from '../store/operacaoAlertaStore';
import { aplicarUsuariosUnicosPorDia, fetchEvaPeriodoPaginas } from '../lib/evaPagesHistorical';

const ESTADO: Record<string, { label: string; cls: string }> = {
  disponivel: { label: 'Disponível', cls: 'bg-emerald-50 text-emerald-700' },
  atendimento: { label: 'Em atendimento', cls: 'bg-blue-50 text-blue-700' },
  pausa: { label: 'Em pausa', cls: 'bg-amber-50 text-amber-800' },
  instavel: { label: 'Keep-alive atrasado', cls: 'bg-red-50 text-red-700' },
};

export function OperacaoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [data, setData] = useState<EvaPayload | null>(null);
  const [hist, setHist] = useState<EvaPayload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [histFaltando, setHistFaltando] = useState<string[]>([]);
  const [histTruncado, setHistTruncado] = useState<{ from: string; to: string; pedidoN: number } | null>(null);
  const [opLogin, setOpLogin] = useState<string | null>(() => searchParams.get('login'));
  const [vista, setVista] = useState<'piso' | 'ofensores'>('ofensores');
  const [focoFiltro, setFocoFiltro] = useState<'todos' | FocoId>('todos');
  const [trilhaHist, setTrilhaHist] = useState<EvaPayload[]>([]);
  const fetchGen = useRef(0);
  const alertaPrev = useRef({ ka: 0, staleMin: 0 });
  const metaDia = useMetaCpcStore((s) => s.metaDia);
  const metasSup = useMetaCpcStore((s) => s.metasSup);
  const publishAlerta = useOperacaoAlertaStore((s) => s.publish);
  const muted = useOperacaoAlertaStore((s) => s.muted);
  const setMuted = useOperacaoAlertaStore((s) => s.setMuted);

  const loadLive = useCallback(async (spin = true) => {
    const my = ++fetchGen.current;
    if (spin) setIsLoading(true);
    setRefreshing(true);
    setFetchError(null);
    try {
      const live = await fetchEvaLive();
      if (my !== fetchGen.current) return;
      setData(live);
      setLastUpdate(new Date());
    } catch (e: any) {
      if (my !== fetchGen.current) return;
      setFetchError(e?.message || 'Não foi possível ler o EVA.');
    } finally {
      if (my === fetchGen.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadHist = useCallback(async () => {
    const my = ++fetchGen.current;
    setIsLoading(true);
    setRefreshing(true);
    setFetchError(null);
    try {
      const { dias, faltando, truncado, recorteFrom, recorteTo, pedidoN } = await fetchEvaPeriodoPaginas(dateFrom, dateTo);
      if (my !== fetchGen.current) return;
      setHist(dias);
      setHistFaltando(faltando);
      setHistTruncado(truncado ? { from: recorteFrom, to: recorteTo, pedidoN } : null);
      setLastUpdate(new Date());
    } catch (e: any) {
      if (my !== fetchGen.current) return;
      setFetchError(e?.message || 'Falha no histórico.');
    } finally {
      if (my === fetchGen.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (tab === 'live') loadLive(true);
    else loadHist();
  }, [tab, loadLive, loadHist]);

  useEffect(() => {
    if (tab !== 'live') return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadLive(false);
    };
    const id = setInterval(tick, 20_000);
    const onVis = () => {
      if (!document.hidden) loadLive(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [tab, loadLive]);

  useEffect(() => {
    if (tab !== 'live') return;
    let cancel = false;
    const hoje = dataBrtIso();
    void fetchEvaPeriodoPaginas(shiftIsoDay(hoje, -6), shiftIsoDay(hoje, -1)).then(({ dias }) => {
      if (!cancel) setTrilhaHist(dias);
    });
    return () => {
      cancel = true;
    };
  }, [tab]);

  // Deep link: /operacao?login=<login>
  useEffect(() => {
    const fromUrl = searchParams.get('login');
    setOpLogin((prev) => (fromUrl === prev ? prev : fromUrl));
  }, [searchParams]);

  const openFicha = useCallback(
    (login: string | null | undefined) => {
      if (!login) return;
      setOpLogin(login);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('login', login);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const closeFicha = useCallback(() => {
    setOpLogin(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('login');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const q = search.trim().toLowerCase();
  const jornadaBase = useMemo(
    () => (tab === 'live' ? data?.jornada || [] : hist.flatMap((h) => h.jornada || [])),
    [tab, data?.jornada, hist],
  );
  const ativasBase = useMemo(
    () => (tab === 'live' ? data?.ativas || [] : []).filter((a) => matchCampanha(a, campanha)),
    [tab, data?.ativas, campanha],
  );
  const chamadasRecEarly = useMemo(
    () =>
      (tab === 'live' ? data?.chamadas_recente || [] : hist.flatMap((h) => h.chamadas_recente || []))
        .filter((chamada) => matchCampanha(chamada, campanha)),
    [tab, data?.chamadas_recente, hist, campanha],
  );
  const ultimaAtividadePorLogin = useMemo(
    () => buildUltimaAtividadePorLogin(chamadasRecEarly),
    [chamadasRecEarly],
  );
  const ativosByLogin = useMemo(() => {
    const m = new Map<string, EvaAtivo>();
    for (const a of ativasBase) {
      const k = (a.login || String(a.id_user)).trim();
      if (k) m.set(k, a);
    }
    return m;
  }, [ativasBase]);
  const jornadaFiltrada = useMemo(() => {
    return jornadaBase.filter((j) => {
      if (!matchCampanha(j, campanha)) return false;
      if (!q) return true;
      return `${j.user_name} ${j.login} ${j.supervisor_name}`.toLowerCase().includes(q);
    });
  }, [jornadaBase, campanha, q]);
  const jornada = useMemo(() => {
    const liveDia = tab === 'live' ? dataRefEva(data) : '';
    return jornadaUnicaPorLogin(jornadaFiltrada).map((j) => {
      const login = (j.login || String(j.id_user)).trim();
      const ativo = ativosByLogin.get(login);
      return ajustarDeslogueOperacional(j, {
        ultimaAtividadeMs: ultimaAtividadePorLogin.get(login),
        estadoAtivo: ativo?.estado,
        diaIso: tab === 'live' ? liveDia || diaJornadaOp(j) : diaJornadaOp(j),
      });
    });
  }, [jornadaFiltrada, ativosByLogin, ultimaAtividadePorLogin, tab, data]);

  const ativas = useMemo(() => {
    return ativasBase.filter((a) => {
      if (!q) return true;
      return `${a.user_name} ${a.login} ${a.supervisor_name}`.toLowerCase().includes(q);
    });
  }, [ativasBase, q]);

  const supervisores = useMemo(() => {
    const consolidados = consolidarSupervisores(
        jornada,
        tab === 'live'
          ? ativas
          : // hist: "logados" = quem trabalhou no período (não piso ao vivo)
            jornada.map((j) => ({ login: j.login, id_user: j.id_user }) as EvaAtivo),
      );
    return tab === 'hist'
      ? aplicarUsuariosUnicosPorDia(consolidados, jornada)
      : consolidados;
  }, [jornada, ativas, tab]);
  const pausasTipo = useMemo(() => somarPausas(jornada), [jornada]);

  const logado = jornada.reduce((s, j) => s + (j.logged_time || 0), 0);
  const pausaSeg = jornada.reduce((s, j) => s + (j.pausa_seg || 0), 0);
  const pausaQtd = jornada.reduce((s, j) => s + (j.pausa_qtd || 0), 0);
  const perdido = jornada.reduce((s, j) => s + tempoDeslogueEfetivo(j), 0);
  const relogins = jornada.reduce((s, j) => s + (j.relogins || 0), 0);
  const kaAbertos =
    tab === 'live'
      ? ativas.filter((a) => a.estado === 'instavel').length
      : jornada.reduce((s, j) => s + (j.keep_alive_abertos || 0), 0);
  const desconexoes = jornada.reduce(
    (s, j) => s + (j.desconexoes || (j.relogins || 0) + (j.keep_alive_abertos || 0)),
    0,
  );
  const instancias = jornada.reduce((s, j) => s + (j.instancias || 0), 0);
  const pctPausa = logado ? Math.round((10000 * pausaSeg) / logado) / 100 : 0;
  const tmaPond = jornada.reduce((s, j) => s + (j.tma_seg || 0) * (j.chamadas || 0), 0);
  const chamadasN = jornada.reduce((s, j) => s + (j.chamadas || 0), 0);
  const tma = chamadasN ? tmaPond / chamadasN : 0;
  const tabuladas = jornada.reduce((s, j) => s + (j.tabuladas || 0), 0);
  const sucesso = jornada.reduce((s, j) => s + (j.sucesso || 0), 0);
  const vbN = jornada.reduce((s, j) => s + (j.vb || 0), 0);
  const perdas = calcularPerdas({
    tempoDeslogueSeg: perdido,
    pausaSeg,
    logadoSeg: logado,
    tmaSeg: tma,
    tabuladas,
    sucesso,
    vb: vbN,
  });
  const chamadasRec = chamadasRecEarly;
  const ofensoresTabRaw = tab === 'live' ? data?.ofensores_tab || [] : hist.flatMap((h) => h.ofensores_tab || []);
  const ofensoresTab = useMemo(() => {
    return ofensoresTabRaw.filter((r) => {
      if (!matchCampanha(r, campanha)) return false;
      if (!q) return true;
      return `${r.operador} ${r.login} ${r.supervisor} ${r.nome}`.toLowerCase().includes(q);
    });
  }, [ofensoresTabRaw, campanha, q]);
  const payloadsEva = useMemo(
    () => (tab === 'live' ? (data ? [data] : []) : hist),
    [tab, data, hist],
  );
  const dropMapsPeriodo = useMemo(
    () => ({
      disc: dropFromDiscagens(payloadsEva, campanha),
      ofens: dropPorLogin(ofensoresTab),
    }),
    [payloadsEva, campanha, ofensoresTab],
  );
  const dropMapsPorDia = useMemo(() => {
    const m = new Map<string, typeof dropMapsPeriodo>();
    for (const p of payloadsEva) {
      if (!p) continue;
      m.set(dataRefEva(p), {
        disc: dropFromDiscagens([p], campanha),
        ofens: dropPorLogin((p.ofensores_tab || []).filter((r) => matchCampanha(r, campanha))),
      });
    }
    return m;
  }, [payloadsEva, campanha]);
  const dropDoOperador = useCallback(
    (login?: string | null, nome?: string | null, dia?: string) => {
      const maps = (dia && dropMapsPorDia.get(dia)) || dropMapsPeriodo;
      return resolveOpDrop(login || undefined, nome || undefined, maps.disc, maps.ofens);
    },
    [dropMapsPorDia, dropMapsPeriodo],
  );
  const dropTotal = useMemo(() => {
    const seen = new Set<string>();
    let drop = 0;
    let tabs = 0;
    for (const j of jornada) {
      const key = (j.login || j.user_name || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const d = resolveOpDrop(j.login || undefined, j.user_name || undefined, dropMapsPeriodo.disc, dropMapsPeriodo.ofens);
      drop += d.drop;
      tabs += d.tabs;
    }
    if (!tabs) {
      for (const v of Object.values(dropMapsPeriodo.disc.byLogin)) {
        drop += v.drop;
        tabs += v.tabs;
      }
    }
    return { drop, tabs, rate: dropRate(drop, tabs) };
  }, [jornada, dropMapsPeriodo]);
  const cpcN = jornada.reduce((s, j) => s + (j.cpc || 0), 0);
  const cpcPct = tabuladas ? Math.round((1000 * cpcN) / tabuladas) / 10 : 0;
  const weekPayloads = tab === 'live' ? trilhaHist : hist;
  const metaCasa = useMemo(
    () =>
      metaCasaOperacao({
        campanha,
        metaDiaStore: metaDia,
        payloads: payloadsEva,
        weekPayloads,
        dataRef: dataRefEva(data) || (tab === 'hist' ? dateTo : dataBrtIso()),
      }),
    [campanha, metaDia, payloadsEva, weekPayloads, data, tab, dateTo],
  );
  const metaCpcDe = useCallback(
    (supervisor: string) => metaSupervisorOp(metasSup, supervisor, metaCasa),
    [metasSup, metaCasa],
  );
  const ofensoresAll = useMemo(
    () => listarOfensores(jornada, { metaCpcDe }),
    [jornada, metaCpcDe],
  );
  const ofensores = useMemo(() => {
    if (focoFiltro === 'todos') return ofensoresAll;
    return ofensoresAll.filter((o) => o.focos.some((f) => f.id === focoFiltro));
  }, [ofensoresAll, focoFiltro]);
  const cpcMeta = metaCasa;
  const staleMin = tab === 'live' ? evaStaleMin(data?.updated_at) : undefined;
  const whatIf = useMemo(
    () =>
      whatIfPiso({
        ka: tab === 'live' ? kaDoPiso(ativasBase, campanha) : kaAbertos,
        tmaSeg: tma,
        logadoSeg: logado,
        chamadas: chamadasN,
      }),
    [tab, ativasBase, campanha, kaAbertos, tma, logado, chamadasN],
  );
  const heatmapPayload = payloadHeatmapDia(tab, data, hist);
  const heatmap = useMemo(
    () =>
      buildHeatmapOperacao({
        payload: heatmapPayload,
        campanha,
        jornadaAtraso: heatmapPayload
          ? (heatmapPayload.jornada || []).filter((j) => matchCampanha(j, campanha))
          : jornada,
        metasSup,
        metaCasa,
        horaAtual: tab === 'live' ? horaBrt() : undefined,
      }),
    [heatmapPayload, campanha, jornada, metasSup, metaCasa, tab],
  );
  const eixoTrilha = useMemo(() => {
    if (tab === 'live') return eixoTrilha7d(dataRefEva(data) || dataBrtIso());
    const dias = [...new Set(hist.map((p) => dataRefEva(p)))].sort();
    return dias.slice(-7);
  }, [tab, data, hist]);
  const payloadsTrilha = useMemo(
    () => (tab === 'live' ? [...trilhaHist, ...(data ? [data] : [])] : hist),
    [tab, trilhaHist, data, hist],
  );
  const trilhas = useMemo(() => {
    const m = new Map<string, ReturnType<typeof trilhaOfensor>>();
    for (const o of ofensores) {
      m.set(o.login, trilhaOfensor(payloadsTrilha, o.login, campanha, eixoTrilha));
    }
    return m;
  }, [ofensores, payloadsTrilha, campanha, eixoTrilha]);

  useEffect(() => {
    if (tab !== 'live' || !data) return;
    const next = alertaFromLive(data);
    publishAlerta(next.ka, next.staleMin);
    const prev = alertaPrev.current;
    const cruzouKa = next.ka >= OPERACAO_KA_SOM && prev.ka < OPERACAO_KA_SOM;
    const cruzouStale =
      (next.staleMin ?? 0) >= OPERACAO_STALE_MIN && prev.staleMin < OPERACAO_STALE_MIN;
    if (!muted && !document.hidden && (cruzouKa || cruzouStale)) beepOperacao();
    alertaPrev.current = { ka: next.ka, staleMin: next.staleMin ?? 0 };
  }, [tab, data, muted, publishAlerta]);
  const pisoMix = useMemo(
    () => ({
      instavel: ativas.filter((a) => a.estado === 'instavel').length,
      pausa: ativas.filter((a) => a.estado === 'pausa').length,
      disponivel: ativas.filter((a) => a.estado === 'disponivel').length,
      atendimento: ativas.filter((a) => a.estado === 'atendimento').length,
      total: ativas.length,
    }),
    [ativas],
  );
  const focoCounts = useMemo(() => {
    const acc: Record<FocoId, number> = { atraso: 0, deslogue: 0, pausa: 0, cpc: 0, logado: 0 };
    for (const o of ofensoresAll) {
      for (const f of o.focos) acc[f.id] += 1;
    }
    return acc;
  }, [ofensoresAll]);
  const intervencao = useMemo(
    () =>
      ofensoresAll.slice(0, 3).map((o) => ({
        login: o.login,
        nome: o.nome,
        supervisor: o.supervisor,
        nivel: o.nivel,
        titulo: o.focos[0]?.titulo || 'Ofensor',
      })),
    [ofensoresAll],
  );

  const pisoRows = useMemo(
    () =>
      ativas.map((a) => ({
        ...a,
        _deslogs: (a.relogins || 0) + (a.keep_alive_abertos || 0) || (a.desconexoes || 0),
        _logins: a.instancias || 1,
      })),
    [ativas],
  );
  const {
    sorted: pisoSorted,
    sortKey: pisoKey,
    sortDir: pisoDir,
    toggleSort: togglePiso,
  } = useTableSortFields(pisoRows, 'user_name');

  const jornadaRows = useMemo(
    () =>
      jornada.map((j) => {
        const d = dropDoOperador(j.login, j.user_name, diaJornadaOp(j));
        return {
          ...j,
          _ka: j.keep_alive_abertos || 0,
          _drop: d.drop,
          _drop_rate: d.rate,
        };
      }),
    [jornada, dropDoOperador],
  );

  const supervisoresComDrop = useMemo(() => {
    const bySupOfens: Record<string, { drop: number; tabs: number }> = {};
    for (const r of ofensoresTab) {
      const sup = r.supervisor || 'Sem supervisor';
      if (!bySupOfens[sup]) bySupOfens[sup] = { drop: 0, tabs: 0 };
      bySupOfens[sup].tabs += r.total || 0;
      if (typeof r.drop_agente === 'number') bySupOfens[sup].drop += Math.max(0, r.drop_agente);
    }
    return supervisores.map((s) => {
      const d = resolveSupDrop(s.supervisor, dropMapsPeriodo.disc);
      const fb = bySupOfens[s.supervisor] || { drop: 0, tabs: 0 };
      const use = d.tabs > 0 ? d : { ...fb, rate: dropRate(fb.drop, fb.tabs || s.tabuladas) };
      const meta = metaCpcDe(s.supervisor);
      const gap = Math.round((s.pct_cpc - meta) * 10) / 10;
      return {
        ...s,
        _drop: use.drop,
        _drop_rate: use.rate,
        _meta: meta,
        _gap: gap,
        alerta_cpc: s.tabuladas >= 8 && s.pct_cpc < meta,
      };
    });
  }, [supervisores, ofensoresTab, dropMapsPeriodo, metaCpcDe]);
  const supersRisco = useMemo(() => {
    const by = new Map<string, number>();
    for (const o of ofensoresAll) {
      by.set(o.supervisor, (by.get(o.supervisor) || 0) + 1);
    }
    return [...by.entries()]
      .map(([supervisor, n]) => {
        const row = supervisoresComDrop.find((s) => s.supervisor === supervisor);
        return {
          supervisor,
          ofensores: n,
          dropRate: row?._drop_rate || 0,
          cpcPct: row?.pct_cpc || 0,
          meta: row?._meta || metaCasa,
          gap: row?._gap ?? 0,
        };
      })
      .sort((a, b) => a.gap - b.gap || b.ofensores - a.ofensores)
      .slice(0, 4);
  }, [ofensoresAll, supervisoresComDrop, metaCasa]);
  const {
    sorted: jornadaSorted,
    sortKey: jorKey,
    sortDir: jorDir,
    toggleSort: toggleJor,
  } = useTableSortFields(jornadaRows, 'user_name');

  const {
    sorted: supSorted,
    sortKey: supKey,
    sortDir: supDir,
    toggleSort: toggleSup,
  } = useTableSortFields(supervisoresComDrop, 'tabuladas', 'desc');

  return (
    <AdminLayout title="Operação" subtitle="Pulse · ofensores · ficha no clique · manhã 09:00 / tarde 15:00 BRT">
      <Toolbar
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
        lastUpdate={lastUpdate}
        refreshing={refreshing}
        filtroOn={filtroOn}
        onLimpar={() => {
          limparFiltro();
          closeFicha();
          setVista('ofensores');
          setFocoFiltro('todos');
        }}
        onRefresh={() => (tab === 'live' ? loadLive(false) : loadHist())}
      />

      {fetchError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex gap-3" role="alert">
          <AlertCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{fetchError}</p>
        </div>
      )}

      {tab === 'hist' && histTruncado && (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          Período pedido tinha {histTruncado.pedidoN} dias — Operação lê no máximo 31 (mais recentes:{' '}
          {histTruncado.from} → {histTruncado.to}).
        </div>
      )}

      {tab === 'hist' && histFaltando.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Histórico gerencial ainda sem {histFaltando.length} dia(s) no período (ex.: {histFaltando.slice(0, 3).join(', ')}
          {histFaltando.length > 3 ? '…' : ''}). Snapshots vêm do sync do próprio dia; D-1 ausente é refeito na madrugada via EVA reports.
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6 h-28 skeleton" />
          ))}
        </div>
      ) : (
        <>
          <OperacaoPulse
            tab={tab}
            staleMin={staleMin}
            cpcPct={cpcPct}
            cpcMeta={cpcMeta}
            tabuladas={tabuladas}
            dropRate={dropTotal.rate}
            dropTabs={dropTotal.tabs}
            piso={pisoMix}
            focoCounts={focoCounts}
            intervencao={intervencao}
            supersRisco={supersRisco}
            whatIf={whatIf}
            muted={muted}
            onToggleMute={() => setMuted(!muted)}
            onOpenFicha={openFicha}
            onVista={setVista}
            onFoco={setFocoFiltro}
          />
          <OperacaoHeatmap mapa={heatmap} tab={tab} />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <Kpi label={tab === 'live' ? 'Logados agora' : 'Operadores-dia no período'} value={tab === 'live' ? ativas.length : jornada.length} icon={Users} color="text-blue-600" bg="bg-blue-50" />
            <Kpi label="Em pausa" value={tab === 'live' ? ativas.filter((a) => a.estado === 'pausa').length : '—'} icon={PauseCircle} color="text-amber-600" bg="bg-amber-50" />
            <Kpi label="TMA" value={fmtHms(tma)} icon={Clock} color="text-indigo-600" bg="bg-indigo-50" sub={`${chamadasN} atendimentos`} />
            <Kpi
              label="CPC operacional"
              value={tabuladas ? `${cpcPct.toFixed(1)}%` : '—'}
              icon={Target}
              color={tabuladas >= 8 && cpcPct < cpcMeta ? 'text-red-600' : 'text-teal-700'}
              bg={tabuladas >= 8 && cpcPct < cpcMeta ? 'bg-red-50' : 'bg-teal-50'}
              sub={`meta ${cpcMeta}% · ${cpcN}/${tabuladas} humanas`}
              onClick={() => {
                setVista('ofensores');
                setFocoFiltro('cpc');
              }}
            />
            <Kpi
              label="% pausa / logado"
              value={`${pctPausa.toFixed(2)}%`}
              icon={Headphones}
              color={pctPausa > PAUSA_META_PCT ? 'text-red-600' : 'text-emerald-600'}
              bg={pctPausa > PAUSA_META_PCT ? 'bg-red-50' : 'bg-emerald-50'}
              sub={`meta ${PAUSA_META_PCT}% · clique: ofensores pausa+`}
              onClick={() => {
                setVista('ofensores');
                setFocoFiltro('pausa');
              }}
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-7 gap-4 mb-6">
            <Mini label="Instâncias de login" value={instancias} />
            <Mini
              label={tab === 'live' ? 'Keep-alive atrasado' : 'KA abertos (soma dias)'}
              value={kaAbertos}
              warn={kaAbertos > 5}
              onClick={() => {
                if (tab === 'live') setVista('piso');
                else {
                  setVista('ofensores');
                  setFocoFiltro('deslogue');
                }
              }}
            />
            <Mini
              label="Relogins (fechados)"
              value={relogins}
              warn={relogins > 20}
              onClick={() => {
                setVista('ofensores');
                setFocoFiltro('deslogue');
              }}
            />
            <Mini
              label="Desconexões (total)"
              value={desconexoes || relogins + kaAbertos}
              warn={(desconexoes || relogins + kaAbertos) > 15}
              onClick={() => {
                setVista('ofensores');
                setFocoFiltro('deslogue');
              }}
            />
            <Mini label="Tempo perdido (deslogs)" value={fmtDur(perdido)} warn={perdido > 1800} />
            <Mini
              label="DROP agente%"
              value={dropTotal.tabs ? `${dropTotal.rate.toFixed(1)}%` : '—'}
              warn={dropTotal.rate >= 25}
              title="Culpa do agente (EVA Agente Desligou). Queda / desligou sem ouvir sem esse bit = evento, não DROP."
            />
            <Mini
              label="Pausas"
              value={`${pausaQtd} · média ${fmtDur(pausaQtd ? pausaSeg / pausaQtd : 0)}`}
            />
          </div>

          <div className="card p-5 shadow-sm mb-6 border border-rose-100 bg-gradient-to-r from-rose-50/80 to-white">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <TrendingDown size={18} className="text-rose-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Perda convertida em vendas</h2>
                <p className="text-xs text-gray-500">
                  (deslogue 15s–12min + pausa acima de {PAUSA_META_PCT}%) ÷ TMA × conversão (sucesso ÷ tabulações humanas)
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Mini label="Tempo deslogue" value={fmtDur(perdas.tempo_deslogue_seg)} warn={perdas.tempo_deslogue_seg > 1800} />
              <Mini label="Pausa excedente" value={fmtDur(perdas.tempo_pausa_excedente_seg)} warn={perdas.tempo_pausa_excedente_seg > 600} />
              <Mini label="Chamadas perdidas" value={fmtPerda(perdas.chamadas_perdidas)} warn={perdas.chamadas_perdidas >= 20} />
              <Mini label="Conversão" value={`${perdas.conversao_pct.toFixed(1)}%`} />
              <Mini label="Vendas perdidas (est.)" value={fmtPerda(perdas.vendas_perdidas)} warn={perdas.vendas_perdidas >= 1} />
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              Recorte atual: {tabuladas} tab. humanas · TMA {fmtHms(tma)} · VB perdidas est. {fmtPerda(perdas.vb_perdidas)}
              {campanha !== 'TODAS' ? ' · filtro de campanha aplicado' : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <SegControl
              value={vista}
              onChange={setVista}
              ariaLabel="Visão operação"
              options={[
                { id: 'ofensores', label: `Ofensores (${ofensores.length})`, icon: TrendingDown },
                { id: 'piso', label: 'Piso e jornada', icon: Clock },
              ]}
            />
            {vista === 'ofensores' && (
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['todos', 'Todos'],
                    ['atraso', 'Atraso 09h/15h'],
                    ['deslogue', 'Deslogs'],
                    ['pausa', 'Pausa+'],
                    ['cpc', 'CPC'],
                    ['logado', 'Jornada'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFocoFiltro(id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                      focoFiltro === id ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {vista === 'ofensores' && (
            <div className="mb-6">
              <div className="flex items-end justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Quadro de ofensores</h2>
                  <p className="text-xs text-gray-400">
                    Pior primeiro · clique no nome para a ficha completa (atraso, deslogs, pausa, CPC)
                  </p>
                </div>
                <p className="text-[11px] text-gray-400">{ofensores.length} no recorte</p>
              </div>
              {ofensores.length === 0 ? (
                <div className="card p-6 text-sm text-emerald-700">Nenhum ofensor neste filtro.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {ofensores.map((o) => {
                    const d = dropDoOperador(o.login, o.nome, o.piorDia);
                    return (
                    <button
                      key={o.login}
                      type="button"
                      onClick={() => openFicha(o.login)}
                      className={`text-left card p-4 shadow-sm border-l-4 hover:shadow-md transition-shadow ${
                        o.nivel === 'critico'
                          ? 'border-l-red-600 bg-red-50/60'
                          : o.nivel === 'alto'
                            ? 'border-l-orange-400 bg-orange-50/40'
                            : 'border-l-amber-300 bg-amber-50/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-gray-900 leading-tight">{o.nome}</p>
                          <p className="text-[11px] text-gray-500">
                            {o.supervisor} · {o.campanha}
                            {o.piorDia ? ` · pior dia ${o.piorDia.slice(8, 10)}/${o.piorDia.slice(5, 7)}` : ''}
                            {(o.diasOfensor || 0) > 1 ? ` · ${o.diasOfensor} dias ofensor` : ''}
                          </p>
                        </div>
                        <span
                          className={`badge ${
                            o.nivel === 'critico'
                              ? 'bg-red-600 text-white'
                              : o.nivel === 'alto'
                                ? 'bg-orange-500 text-white'
                                : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {o.nivel}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-gray-800 mt-2">{o.focos[0]?.titulo}</p>
                      <p className="text-[11px] text-gray-600">{o.focos[0]?.detalhe}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {o.focos.slice(0, 4).map((f) => (
                          <span key={f.id} className="badge bg-white/80 text-gray-700 border border-gray-200">
                            {f.id === 'atraso' ? 'Atraso' : f.id === 'deslogue' ? 'Deslog' : f.id === 'pausa' ? 'Pausa+' : f.id === 'cpc' ? 'CPC' : 'Jornada'}
                          </span>
                        ))}
                        {d.drop > 0 && (
                          <span className={`badge border ${d.rate >= 25 ? 'bg-red-600 text-white border-red-700' : 'bg-white/80 text-red-700 border-red-200'}`}>
                            DROP agente {d.rate.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <OperacaoTrilha pontos={trilhas.get(o.login) || []} meta={metaCpcDe(o.supervisor)} />
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {vista === 'piso' && (
          <>
          <div className="card shadow-sm mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Consolidado por supervisor</h2>
              <p className="text-xs text-gray-400">
                CPC operacional (cpc/tabs) · meta do supervisor (store Hora) · BKO = limiar dinâmico · pausa vs {PAUSA_META_PCT}%
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <SortTh label="Supervisor" col="supervisor" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="left" className="px-4" />
                    <SortTh label="Ops" col="operadores" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label={tab === 'live' ? 'Logados' : 'No período'} col="logados" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="Tab." col="tabuladas" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="CPC" col="cpc" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="CPC%" col="pct_cpc" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="Meta" col="_meta" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="Gap" col="_gap" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="DROP%" col="_drop_rate" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="TMA" col="tma_seg" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="% pausa" col="pct_pausa" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="Relogins" col="relogins" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="Perda" col="tempo_perdido_seg" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="Pausa+" col="pausa_excedente_seg" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                    <SortTh label="Vendas perdidas" col="vendas_perdidas" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {supSorted.map((row) => {
                    const s = row as (typeof supervisoresComDrop)[number];
                    return (
                    <tr key={s.supervisor} className="border-t border-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-800">{s.supervisor}</td>
                      <td className="px-3 py-2 text-right">{s.operadores}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">{s.logados}</td>
                      <td className="px-3 py-2 text-right">{s.tabuladas}</td>
                      <td className="px-3 py-2 text-right">{s.cpc}</td>
                      <td className={`px-3 py-2 text-right font-bold ${s.alerta_cpc ? 'text-red-600' : 'text-teal-700'}`}>
                        {s.pct_cpc.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">{(s._meta || cpcMeta).toFixed(0)}%</td>
                      <td className={`px-3 py-2 text-right font-semibold ${(s._gap || 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {(s._gap || 0) >= 0 ? '+' : ''}{(s._gap || 0).toFixed(1)}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${(s._drop_rate || 0) >= 25 ? 'text-red-600' : 'text-gray-700'}`}>
                        {(s._drop_rate || 0).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtHms(s.tma_seg)}</td>
                      <td className={`px-3 py-2 text-right ${s.pct_pausa > PAUSA_META_PCT ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                        {s.pct_pausa.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right">{s.relogins}</td>
                      <td className="px-3 py-2 text-right text-amber-700">{fmtDur(s.tempo_perdido_seg)}</td>
                      <td className="px-3 py-2 text-right text-rose-700">{fmtDur(s.pausa_excedente_seg)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-rose-700">{fmtPerda(s.vendas_perdidas)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {pausasTipo.map((p) => (
              <div key={p.tipo} className="card p-4 shadow-sm">
                <p className="text-xs text-gray-400 font-semibold uppercase">{p.tipo}</p>
                <p className="text-xl font-black text-gray-800 mt-1">{p.qtd}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {fmtHms(p.segundos)} total · média {fmtDur(p.media_seg)}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {tab === 'live' && (
              <div className="xl:col-span-2 card shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-base font-bold text-gray-900">Piso ao vivo</h2>
                  <p className="text-xs text-gray-400">
                    Keep-alive atrasado = última sessão sem sinal &gt;3 min (exc. se tabulou depois) · deslogs = relogin fechado (15s–12min) + KA aberto confirmado
                  </p>
                </div>
                <div className="overflow-x-auto max-h-[480px]">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                      <tr>
                        <SortTh label="Operador" col="user_name" sortKey={pisoKey} sortDir={pisoDir} onSort={togglePiso} align="left" className="px-4" />
                        <SortTh label="Supervisor" col="supervisor_name" sortKey={pisoKey} sortDir={pisoDir} onSort={togglePiso} align="left" className="px-4" />
                        <SortTh label="Operação" col="campanha_op" sortKey={pisoKey} sortDir={pisoDir} onSort={togglePiso} align="left" className="px-4" />
                        <SortTh label="Estado" col="estado" sortKey={pisoKey} sortDir={pisoDir} onSort={togglePiso} align="left" className="px-4" />
                        <SortTh label="Logins" col="_logins" sortKey={pisoKey} sortDir={pisoDir} onSort={togglePiso} align="right" className="px-4" />
                        <SortTh label="Deslogs" col="_deslogs" sortKey={pisoKey} sortDir={pisoDir} onSort={togglePiso} align="right" className="px-4" />
                      </tr>
                    </thead>
                    <tbody>
                      {pisoSorted.map((row) => {
                        const a = row as (typeof pisoRows)[number];
                        const st = ESTADO[a.estado] || ESTADO.disponivel;
                        const nDes = a._deslogs;
                        return (
                          <tr key={`${a.id}-${a.login}`} className="border-t border-gray-50">
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                className="text-left font-medium text-blue-700 hover:underline"
                                onClick={() => openFicha(a.login)}
                              >
                                {a.user_name}
                              </button>
                              <div className="text-[11px] text-gray-400">
                                {a.login} · {fmtHora(a.primeiro_login || a.date_login)}
                                {(a.atraso_entrada_seg || 0) > 0 && (
                                  <span className="text-red-600 font-semibold"> · atraso {fmtDur(a.atraso_entrada_seg)}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-gray-600">{a.supervisor_name || '—'}</td>
                            <td className="px-4 py-2 text-xs font-semibold text-slate-600">{a.campanha_op || '—'}</td>
                            <td className="px-4 py-2">
                              <span className={`badge ${st.cls}`}>{st.label}</span>
                            </td>
                            <td className="px-4 py-2 text-right">{a.instancias || 1}</td>
                            <td className="px-4 py-2 text-right">
                              <span className={nDes > 0 ? 'font-semibold text-amber-800' : 'text-gray-400'}>{nDes}</span>
                              {(a.tempo_perdido_seg || 0) > 0 && (
                                <span className="block text-[11px] text-amber-700">{fmtDur(a.tempo_perdido_seg)}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className={`${tab === 'live' ? '' : 'xl:col-span-3'} card shadow-sm overflow-hidden`}>
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900">Jornada · login / deslogue</h2>
                <p className="text-xs text-gray-400">
                  Entregue = logado ≥ 05:50 · perda = relogin fechado + keep-alive aberto confirmado (15s–12min)
                </p>
              </div>
              <div className="overflow-x-auto max-h-[480px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <SortTh label="Operador" col="user_name" sortKey={jorKey} sortDir={jorDir} onSort={toggleJor} align="left" />
                      <SortTh label="Login" col="date_login" sortKey={jorKey} sortDir={jorDir} onSort={toggleJor} align="left" />
                      <SortTh label="Logado" col="logged_time" sortKey={jorKey} sortDir={jorDir} onSort={toggleJor} align="right" />
                      <SortTh label="Pausa" col="pausa_seg" sortKey={jorKey} sortDir={jorDir} onSort={toggleJor} align="right" />
                      <SortTh label="Inst." col="instancias" sortKey={jorKey} sortDir={jorDir} onSort={toggleJor} align="right" />
                      <SortTh label="Relogin" col="relogins" sortKey={jorKey} sortDir={jorDir} onSort={toggleJor} align="right" />
                      <SortTh label="KA ab." col="_ka" sortKey={jorKey} sortDir={jorDir} onSort={toggleJor} align="right" />
                      <SortTh label="DROP%" col="_drop_rate" sortKey={jorKey} sortDir={jorDir} onSort={toggleJor} align="right" />
                      <SortTh label="Perda" col="tempo_perdido_seg" sortKey={jorKey} sortDir={jorDir} onSort={toggleJor} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {jornadaSorted.map((row, i) => {
                      const j = row as (typeof jornadaRows)[number];
                      return (
                      <tr
                        key={`${j.login}-${j.date_login}-${i}`}
                        className={`border-t border-gray-50 ${(j.acima_meta_pausa || (j.atraso_entrada_seg || 0) > 0 || (j.relogins || 0) > 0 || (j.keep_alive_abertos || 0) > 0 || (j._drop_rate || 0) >= 25) ? 'bg-red-50/40' : ''}`}
                      >
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-left font-medium text-blue-700 hover:underline"
                            onClick={() => openFicha(j.login)}
                          >
                            {j.user_name}
                          </button>
                          <div className="text-[11px] text-gray-400">
                            {j.supervisor_name} · {j.campanha_op}
                            {j.turno === 'tarde' ? ' · tarde' : j.turno === 'manha' ? ' · manhã' : ''}
                            {(j._drop || 0) > 0 ? ` · DROP ${j._drop}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-gray-600">
                          {fmtHora(j.date_login)}
                          <div className="text-[11px] text-gray-400">{fmtHora(j.date_logout)}</div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={j.status_logado === 'entregue' ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>
                            {fmtHms(j.logged_time)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div>{j.pausa_qtd || 0}x</div>
                          <div className="text-[11px] text-gray-500">
                            {fmtDur(j.pausa_seg)} · méd {fmtDur(j.pausa_media_seg)}
                            {(j.pct_pausa || 0) > PAUSA_META_PCT ? ' · acima meta' : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{j.instancias || 1}</td>
                        <td className="px-3 py-2 text-right font-semibold text-amber-800">{j.relogins || 0}</td>
                        <td className="px-3 py-2 text-right font-semibold text-red-700">{j.keep_alive_abertos || 0}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${(j._drop_rate || 0) >= 25 ? 'text-red-600' : 'text-gray-700'}`}>
                          {(j._drop_rate || 0).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right text-amber-700">{fmtDur(j.tempo_perdido_seg)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          </>
          )}
        </>
      )}
      {opLogin && (
        <OperadorFicha
          login={opLogin}
          metaCpcDe={metaCpcDe}
          jornada={jornada}
          ativas={tab === 'live' ? data?.ativas || [] : []}
          chamadas={chamadasRec}
          ofensoresTab={ofensoresTab}
          tmaTabs={
            (tab === 'live'
              ? data?.tma_por_tabulacao || []
              : hist.flatMap((h) => h.tma_por_tabulacao || [])
            ).filter((item) => matchCampanha(item, campanha))
          }
          onClose={closeFicha}
        />
      )}
    </AdminLayout>
  );
}

function Toolbar(props: {
  tab: 'live' | 'hist';
  setTab: (t: 'live' | 'hist') => void;
  campanha: CampanhaOp;
  setCampanha: (c: CampanhaOp) => void;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (s: string) => void;
  setDateTo: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
  lastUpdate: Date;
  refreshing: boolean;
  filtroOn: boolean;
  onLimpar: () => void;
  onRefresh: () => void;
}) {
  const ops = CAMPANHA_FILTRO_OPTIONS;
  return (
    <div className="card p-4 shadow-sm mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <SegControl
          value={props.tab}
          onChange={props.setTab}
          ariaLabel="Modo operação"
          options={LIVE_HIST_OPTIONS}
        />
        <SegControl value={props.campanha} onChange={props.setCampanha} options={ops} ariaLabel="Campanha operação" />
        {props.tab === 'hist' && (
          <>
            <Calendar size={14} className="text-gray-400" />
            <input type="date" value={props.dateFrom} onChange={(e) => props.setDateFrom(e.target.value)} className="input-field text-sm py-2 w-36" />
            <span className="text-xs text-gray-400">até</span>
            <input type="date" value={props.dateTo} onChange={(e) => props.setDateTo(e.target.value)} className="input-field text-sm py-2 w-36" />
          </>
        )}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder="Operador ou supervisor" className="input-field text-sm py-2 pl-8 w-52" />
        </div>
        {props.filtroOn && (
          <button type="button" onClick={props.onLimpar} className="text-xs font-semibold text-red-600 flex items-center gap-1">
            <X size={12} /> Limpar filtros
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="badge bg-emerald-50 text-emerald-600 hidden sm:inline-flex">{props.tab === 'live' ? 'Auto: 20s' : 'EVA'}</span>
          <span className="text-xs text-gray-400">{props.lastUpdate.toLocaleTimeString('pt-BR')}</span>
          <button type="button" onClick={props.onRefresh} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3">
            <RefreshCw size={14} className={props.refreshing ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label, value, icon: Icon, color, bg, sub, onClick,
}: {
  label: string; value: number | string; icon: typeof Users; color: string; bg: string; sub?: string; onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center`}>
          <Icon size={18} className={color} />
        </div>
      </div>
      <div className={`text-3xl font-black ${color}`}>{value}</div>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="card p-5 shadow-sm text-left w-full hover:shadow-md">
        {inner}
      </button>
    );
  }
  return <div className="card p-5 shadow-sm">{inner}</div>;
}

function Mini({
  label,
  value,
  warn,
  onClick,
  title,
}: {
  label: string;
  value: number | string;
  warn?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const cls = `card p-4 shadow-sm text-left w-full ${onClick ? 'hover:shadow-md' : ''}`;
  const body = (
    <>
      <p className="text-xs text-gray-400 font-semibold uppercase">{label}</p>
      <p className={`text-xl font-black mt-1 ${warn ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} title={title}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} title={title}>
      {body}
    </div>
  );
}

function beepOperacao() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  } catch {
    /* ignore */
  }
}
