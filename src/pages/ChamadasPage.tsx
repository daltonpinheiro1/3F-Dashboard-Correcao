import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  PhoneCall,
  RefreshCw,
  Search,
  Target,
  X,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminLayout } from '../components/AdminLayout';
import { OperadorFicha } from '../components/OperadorFicha';
import { SortTh } from '../components/SortTh';
import {
  resolveCpcMeta,
  calcularPerdas,
  consolidarSupervisores,
  fetchEvaLive,
  fetchEvaPeriodo,
  fmtHms,
  fmtHora,
  fmtPerda,
  cpcOperacionalDeTab,
  dropPorLogin,
  isTabDrop,
  isTabNaoCpc,
  isTabulacaoAutomatica,
  maskPhoneDisplay,
  matchCampanha,
  type CampanhaOp,
  type EvaChamada,
  type EvaCpcCampanha,
  type EvaOfensorTab,
  type EvaPayload,
  type EvaRankingOp,
  type EvaTabulacao,
  type EvaTmaHora,
  type SupervisorResumo,
} from '../lib/evaDash';
import { filtroEvaAtivo, useFiltroEvaStore } from '../store/filtroStore';
import { useMetaCpcStore } from '../store/metaCpcStore';
import { jornadaUnicaPorLogin } from '../lib/ofensorOp';
import { useTableSortFields } from '../lib/tableSort';

function tel(ch: EvaChamada): string {
  return maskPhoneDisplay(ch.area_code, ch.phone_number);
}

export function ChamadasPage() {
  const metaDia = useMetaCpcStore((s) => s.metaDia);
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
  const [ofensor, setOfensor] = useState<{ nome: string; campanha_op?: string } | null>(null);
  const [opLogin, setOpLogin] = useState<string | null>(null);

  const loadLive = useCallback(async (spin = true) => {
    if (spin) setIsLoading(true);
    setRefreshing(true);
    setFetchError(null);
    try {
      setData(await fetchEvaLive());
      setLastUpdate(new Date());
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Não foi possível ler as chamadas EVA.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadHist = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const { dias, faltando } = await fetchEvaPeriodo(dateFrom, dateTo);
      setHist(dias);
      setHistFaltando(faltando);
      setLastUpdate(new Date());
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
    const id = setInterval(() => loadLive(false), 20_000);
    return () => clearInterval(id);
  }, [tab, loadLive]);

  useEffect(() => {
    setOfensor(null);
    setOpLogin(null);
  }, [campanha, tab, dateFrom, dateTo]);

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const q = debouncedSearch.trim().toLowerCase();
  const jornada = useMemo(() => {
    const rows = tab === 'live' ? data?.jornada || [] : hist.flatMap((h) => h.jornada || []);
    const filtrada = rows.filter((j) => {
      if (!matchCampanha(j, campanha)) return false;
      if (!q) return true;
      return `${j.user_name} ${j.login} ${j.supervisor_name}`.toLowerCase().includes(q);
    });
    return jornadaUnicaPorLogin(filtrada);
  }, [tab, data, hist, campanha, q]);

  const ofensoresBase = useMemo(() => {
    const rows = tab === 'live' ? data?.ofensores_tab || [] : mergeOfensores(hist);
    return rows.filter((r) => {
      if (!matchCampanha(r, campanha)) return false;
      if (!q) return true;
      return `${r.operador} ${r.login} ${r.supervisor}`.toLowerCase().includes(q);
    });
  }, [tab, data, hist, campanha, q]);

  const ofensoresTab = useMemo(() => {
    return ofensoresBase.filter((r) => {
      if (ofensor && r.nome !== ofensor.nome) return false;
      if (ofensor?.campanha_op && r.campanha_op && r.campanha_op !== ofensor.campanha_op) return false;
      return true;
    });
  }, [ofensoresBase, ofensor]);

  const rankingGeral: EvaRankingOp[] = useMemo(() => {
    const rows = tab === 'live' ? data?.ranking_operadores || [] : mergeRanking(hist);
    return rows
      .filter((r) => matchCampanha(r, campanha))
      .filter((r) => !q || `${r.operador} ${r.login} ${r.supervisor}`.toLowerCase().includes(q))
      .sort((a, b) => (a.pct_cpc || 0) - (b.pct_cpc || 0));
  }, [tab, data, hist, campanha, q]);

  const ranking: EvaRankingOp[] = useMemo(() => {
    const tmaByOp = new Map(rankingGeral.map((r) => [`${r.login}|${r.campanha_op || ''}`, r.tma_seg]));
    if (ofensor && ofensoresTab.length) {
      return ofensoresTab
        .map((r) => ({
          login: r.login,
          operador: r.operador,
          supervisor: r.supervisor,
          campanha_op: r.campanha_op,
          total: r.total,
          cpc: r.cpc,
          sucesso: r.sucesso || 0,
          recusa: 0,
          pct_cpc: r.pct_cpc,
          alerta_cpc: r.alerta_cpc,
          tma_seg: r.tma_seg || tmaByOp.get(`${r.login}|${r.campanha_op || ''}`),
        }))
        .sort((a, b) => (a.pct_cpc || 0) - (b.pct_cpc || 0));
    }
    return rankingGeral;
  }, [ofensor, ofensoresTab, rankingGeral]);

  const rankingVol = useMemo(
    () => [...ranking].sort((a, b) => b.total - a.total),
    [ranking],
  );

  const chamadas = useMemo(() => {
    const rows = tab === 'live' ? data?.chamadas_recente || [] : hist.flatMap((h) => h.chamadas_recente || []);
    return rows.filter((c) => {
      if (!matchCampanha(c, campanha)) return false;
      if (ofensor && c.classification_name !== ofensor.nome) return false;
      if (ofensor?.campanha_op && c.campanha_op && c.campanha_op !== ofensor.campanha_op) return false;
      if (isTabulacaoAutomatica(c.classification_name)) return false;
      if (!q) return true;
      return `${c.user_name} ${c.login} ${c.supervisor_name} ${c.classification_name} ${c.phone_number}`
        .toLowerCase()
        .includes(q);
    });
  }, [tab, data, hist, campanha, q, ofensor]);

  const tabsHumanas = useMemo(() => {
    if (q) return consolidarTabsDeOfensores(ofensoresBase);
    const src = tab === 'live' ? data?.tma_por_tabulacao || data?.top_tabulacao || [] : mergeTabs(hist);
    return consolidarTabs(
      filtrarCampanhaTab(src, campanha).filter((t) => !isTabulacaoAutomatica(t.nome)),
    );
  }, [tab, data, hist, campanha, q, ofensoresBase]);

  const tmaTabs = useMemo(
    () =>
      ofensor
        ? tabsHumanas.filter(
            (t) =>
              t.nome === ofensor.nome &&
              (!ofensor.campanha_op || !t.campanha_op || t.campanha_op === ofensor.campanha_op),
          )
        : tabsHumanas,
    [tabsHumanas, ofensor],
  );

  const tmaHora = useMemo(() => {
    const src = tab === 'live' ? data?.tma_hora || [] : mergeTmaHora(hist);
    const tabsOk = new Set(ofensoresBase.map((r) => r.nome));
    const byCamp = consolidarHora(
      filtrarCampanhaTab(src, campanha).filter((t) => {
        if (isTabulacaoAutomatica(t.nome)) return false;
        if (q && tabsOk.size && !tabsOk.has(t.nome)) return false;
        return true;
      }),
    );
    return ofensor ? byCamp.filter((t) => t.nome === ofensor.nome) : byCamp;
  }, [tab, data, hist, ofensor, campanha, q, ofensoresBase]);

  const supervisores = useMemo(() => {
    if (ofensor && ofensoresTab.length) return consolidarDrill(ofensoresTab);
    return consolidarSupervisores(jornada, tab === 'live' ? data?.ativas || [] : []);
  }, [jornada, data, tab, ofensor, ofensoresTab]);

  const { tabuladasTabs, tabuladas, cpcN, sucN, recN, pctCpc } = useMemo(() => {
    const _tabuladasTabs = tabsHumanas.reduce((s, t) => s + t.total, 0);
    const _tabuladasRk = rankingGeral.reduce((s, r) => s + r.total, 0);
    const _cpcRk = rankingGeral.reduce((s, r) => s + r.cpc, 0);
    const _tabuladas = _tabuladasRk > 0 ? _tabuladasRk : _tabuladasTabs;
    const _cpcN = _tabuladasRk > 0 ? _cpcRk : tabsHumanas.reduce((s, t) => s + (t.cpc || 0), 0);
    const _sucN = rankingGeral.reduce((s, r) => s + r.sucesso, 0);
    const _recN = rankingGeral.reduce((s, r) => s + r.recusa, 0);
    const _pctCpc = _tabuladas ? Math.round((1000 * _cpcN) / _tabuladas) / 10 : 0;
    return { tabuladasTabs: _tabuladasTabs, tabuladas: _tabuladas, cpcN: _cpcN, sucN: _sucN, recN: _recN, pctCpc: _pctCpc };
  }, [tabsHumanas, rankingGeral]);
  const cpcCampanhas: EvaCpcCampanha[] = useMemo(() => {
    if (q) {
      const acc: Record<string, { tabuladas: number; cpc: number }> = {};
      for (const r of rankingGeral) {
        const cop = r.campanha_op || 'OUTROS';
        if (!acc[cop]) acc[cop] = { tabuladas: 0, cpc: 0 };
        acc[cop].tabuladas += r.total;
        acc[cop].cpc += r.cpc;
      }
      return Object.entries(acc).map(([campanha_op, v]) => ({
        campanha_op,
        tabuladas: v.tabuladas,
        cpc: v.cpc,
        pct_cpc: v.tabuladas ? Math.round((1000 * v.cpc) / v.tabuladas) / 10 : 0,
        confiavel: false,
        fonte: 'tabulacao',
      }));
    }
    const src = tab === 'live' ? data?.cpc_por_campanha || [] : mergeCpcCamp(hist);
    const filtered = campanha === 'TODAS' ? src : src.filter((c) => c.campanha_op === campanha);
    if (filtered.length) return filtered;
    const acc: Record<string, { tabuladas: number; cpc: number }> = {};
    for (const t of tabsHumanas) {
      const cop = t.campanha_op || 'OUTROS';
      if (!acc[cop]) acc[cop] = { tabuladas: 0, cpc: 0 };
      acc[cop].tabuladas += t.total;
      acc[cop].cpc += t.cpc || 0;
    }
    return Object.entries(acc).map(([campanha_op, v]) => ({
      campanha_op,
      tabuladas: v.tabuladas,
      cpc: v.cpc,
      pct_cpc: v.tabuladas ? Math.round((1000 * v.cpc) / v.tabuladas) / 10 : 0,
      confiavel: false,
      fonte: 'tabulacao',
    }));
  }, [tab, data, hist, campanha, tabsHumanas, q, rankingGeral]);
  const alerta = cpcCampanhas.some((c) => c.tabuladas >= 8 && c.pct_cpc < metaDia);
  const { autoIgnoradas, tma, attN, gapTab, vb, aprov, isizeCruz, isizeTotal, isizeAceitas, isizeCanceladas, perdas } = useMemo(() => {
    const _attTabs = tabsHumanas.reduce((s, t) => s + (t.att_n || 0), 0);
    const _autoIgnoradas =
      campanha !== 'TODAS'
        ? 0
        : tab === 'live'
          ? Number(data?.kpis_chamadas?.auto_ignoradas || 0)
          : hist.reduce((s, h) => s + Number(h.kpis_chamadas?.auto_ignoradas || 0), 0);
    const _tmaPond = jornada.reduce((s, j) => s + (j.tma_seg || 0) * (j.chamadas || 0), 0);
    const _attN = jornada.reduce((s, j) => s + (j.chamadas || 0), 0);
    const _tma = _attN ? _tmaPond / _attN : tab === 'live' ? Number(data?.kpis_chamadas?.tma_seg || 0) : 0;
    const _gapKpi =
      campanha === 'TODAS' && tab === 'live'
        ? Number(data?.kpis_chamadas?.gap_tabulacao || 0)
        : campanha === 'TODAS'
          ? hist.reduce((s, h) => s + Number(h.kpis_chamadas?.gap_tabulacao || 0), 0)
          : 0;
    const _gapTab = _attTabs > 0 ? Math.max(0, _attTabs - tabuladasTabs) : Math.max(0, _gapKpi, _attN - tabuladas);
    const _vb = jornada.reduce((s, j) => s + (j.vb || 0), 0);
    const _aprov = jornada.reduce((s, j) => s + (j.aprovadas || 0), 0);
    const _isizeCruz = tab === 'live' ? data?.kpis_chamadas?.isize_cruzamento : false;
    const _isizeTotal = Number(tab === 'live' ? data?.kpis_chamadas?.isize_total : 0) || 0;
    const _isizeAceitas = Number(tab === 'live' ? data?.kpis_chamadas?.isize_aceitas : 0) || 0;
    const _isizeCanceladas = Number(tab === 'live' ? data?.kpis_chamadas?.isize_canceladas : 0) || 0;
    const _perdido = jornada.reduce((s, j) => s + (j.tempo_perdido_seg || 0), 0);
    const _pausaSeg = jornada.reduce((s, j) => s + (j.pausa_seg || 0), 0);
    const _logadoSeg = jornada.reduce((s, j) => s + (j.logged_time || 0), 0);
    const _perdas = calcularPerdas({
      tempoDeslogueSeg: _perdido,
      pausaSeg: _pausaSeg,
      logadoSeg: _logadoSeg,
      tmaSeg: _tma,
      tabuladas,
      sucesso: sucN,
      vb: _vb,
    });
    return {
      attTabs: _attTabs, autoIgnoradas: _autoIgnoradas, tma: _tma, attN: _attN,
      gapTab: _gapTab, vb: _vb, aprov: _aprov, isizeCruz: _isizeCruz,
      isizeTotal: _isizeTotal, isizeAceitas: _isizeAceitas, isizeCanceladas: _isizeCanceladas,
      perdas: _perdas,
    };
  }, [tabsHumanas, jornada, data, hist, tab, campanha, tabuladasTabs, tabuladas, sucN]);

  const dropByLogin = useMemo(() => dropPorLogin(ofensoresBase), [ofensoresBase]);

  const supervisoresComDrop = useMemo(() => {
    const bySup: Record<string, { drop: number; tabs: number }> = {};
    for (const r of ofensoresBase) {
      const sup = r.supervisor || 'Sem supervisor';
      if (!bySup[sup]) bySup[sup] = { drop: 0, tabs: 0 };
      const n = r.total || 0;
      bySup[sup].tabs += n;
      if (isTabDrop(r.nome)) bySup[sup].drop += n;
    }
    return supervisores.map((s) => {
      const d = bySup[s.supervisor] || { drop: 0, tabs: 0 };
      return {
        ...s,
        _drop: d.drop,
        _drop_rate: d.tabs ? Math.round((1000 * d.drop) / d.tabs) / 10 : 0,
      };
    });
  }, [supervisores, ofensoresBase]);

  const {
    sorted: supSorted,
    sortKey: supKey,
    sortDir: supDir,
    toggleSort: toggleSup,
  } = useTableSortFields(supervisoresComDrop as unknown as Record<string, unknown>[], 'tabuladas', 'desc');

  const rankingRows = useMemo(
    () =>
      ranking.slice(0, 60).map((r) => {
        const d = dropByLogin[r.login] || { drop: 0, tabs: 0, rate: 0 };
        return {
          ...r,
          _pct_cpc: r.pct_cpc || 0,
          _tma_seg: r.tma_seg || 0,
          _drop: d.drop,
          _drop_rate: d.rate,
        };
      }),
    [ranking, dropByLogin],
  );
  const {
    sorted: rankingSorted,
    sortKey: rkKey,
    sortDir: rkDir,
    toggleSort: toggleRk,
  } = useTableSortFields(rankingRows as Record<string, unknown>[], '_pct_cpc', 'asc');

  const chamadaRows = useMemo(
    () =>
      chamadas.map((c) => {
        const drop = isTabDrop(c.classification_name);
        return {
          ...c,
          _tel: tel(c),
          _flag: drop
            ? 'DROP'
            : c.success
              ? 'Sucesso'
              : (c.cpc_op ?? c.cpc)
                ? 'CPC'
                : c.refusal
                  ? 'Recusa'
                  : '—',
          _drop: drop ? 1 : 0,
        };
      }),
    [chamadas],
  );
  const {
    sorted: chamadasSorted,
    sortKey: chKey,
    sortDir: chDir,
    toggleSort: toggleCh,
  } = useTableSortFields(chamadaRows as Record<string, unknown>[], 'call_time', 'desc');

  return (
    <AdminLayout title="Chamadas" subtitle="CPC operacional por campanha · flag EVA só entra se for discriminante">
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Seg
            value={tab}
            onChange={setTab}
            options={[
              { id: 'live', label: 'Realtime' },
              { id: 'hist', label: 'Histórico' },
            ]}
          />
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Operador, tabulação, telefone" className="input-field text-sm py-2 pl-8 w-64" />
          </div>
          {filtroOn && (
            <button
              type="button"
              onClick={() => {
                limparFiltro();
                setOfensor(null);
                setOpLogin(null);
              }}
              className="text-xs font-semibold text-red-600 flex items-center gap-1"
            >
              <X size={12} /> Limpar filtros
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">{lastUpdate.toLocaleTimeString('pt-BR')}</span>
            <button type="button" onClick={() => (tab === 'live' ? loadLive(false) : loadHist())} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Atualizar
            </button>
          </div>
        </div>
      </div>

      {alerta && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex gap-3" role="alert">
          <AlertCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">CPC abaixo da meta ({metaDia}%)</p>
            <p className="text-xs text-red-600 mt-0.5">
              {cpcCampanhas
                .filter((c) => c.tabuladas >= 8 && c.pct_cpc < metaDia)
                .map((c) => `${c.campanha_op} ${c.pct_cpc.toFixed(1)}%`)
                .join(' · ') || `${pctCpc.toFixed(1)}%`}
              . Fonte: tabulação (caixa postal/muda/queda/desligou sem ouvir não são CPC). O flag EVA de Portabilidade vs Migração não se mistura.
            </p>
          </div>
        </div>
      )}
      {fetchError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex gap-3" role="alert">
          <AlertCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{fetchError}</p>
        </div>
      )}
      {tab === 'hist' && histFaltando.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Sem arquivo gerencial em {histFaltando.length} dia(s) (ex.: {histFaltando.slice(0, 3).join(', ')}
          {histFaltando.length > 3 ? '…' : ''}). D-1 ausente é reconstruído na madrugada via EVA reports.
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
          <div className={`grid grid-cols-2 ${cpcCampanhas.length > 1 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4 mb-6`}>
            <Kpi
              label="Tabuladas humanas"
              value={tabuladas}
              icon={PhoneCall}
              color="text-blue-600"
              bg="bg-blue-50"
              sub={[
                gapTab ? `gap ${gapTab} vs TMA (${attN} atend.)` : `${attN} atend. TMA`,
                autoIgnoradas ? `${autoIgnoradas} auto fora` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
            {cpcCampanhas.length ? (
              (cpcCampanhas.some((c) => c.campanha_op === 'PORTABILIDADE' || c.campanha_op === 'MIGRACAO')
                ? cpcCampanhas.filter((c) => c.campanha_op === 'PORTABILIDADE' || c.campanha_op === 'MIGRACAO')
                : cpcCampanhas.slice(0, 2)
              ).map((c) => {
                const down = c.tabuladas >= 8 && c.pct_cpc < metaDia;
                const nome = c.campanha_op === 'PORTABILIDADE' ? 'Portabilidade' : c.campanha_op === 'MIGRACAO' ? 'Migração' : c.campanha_op;
                return (
                  <Kpi
                    key={c.campanha_op}
                    label={`CPC ${nome}`}
                    value={`${c.pct_cpc.toFixed(1)}%`}
                    icon={Target}
                    color={down ? 'text-red-600' : 'text-teal-600'}
                    bg={down ? 'bg-red-50' : 'bg-teal-50'}
                    sub={`${c.cpc} / ${c.tabuladas} · ${c.fonte === 'eva' ? 'flag EVA' : 'por tabulação'} · meta ${metaDia}%`}
                  />
                );
              })
            ) : (
              <Kpi
                label="CPC"
                value={`${pctCpc.toFixed(1)}%`}
                icon={Target}
                color={alerta ? 'text-red-600' : 'text-teal-600'}
                bg={alerta ? 'bg-red-50' : 'bg-teal-50'}
                sub={`${cpcN} / ${tabuladas} · meta ≥ ${metaDia}%`}
              />
            )}
            <Kpi label="TMA consolidado" value={fmtHms(tma)} icon={Clock} color="text-indigo-600" bg="bg-indigo-50" sub={`${attN} atendimentos`} />
            <Kpi
              label="Sucesso / recusa"
              value={isizeCruz ? `${isizeTotal} / ${isizeCanceladas}` : `${sucN} / ${recN}`}
              icon={CheckCircle2}
              color="text-emerald-600"
              bg="bg-emerald-50"
              sub={
                isizeCruz
                  ? `iSize: ${isizeTotal} sucesso · ${isizeAceitas} aprovadas · ${isizeCanceladas} reprovadas`
                  : vb ? `VB ${vb} · aprov. ${aprov}` : undefined
              }
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi
              label="Tempo perdido"
              value={fmtHms(perdas.tempo_total_seg)}
              icon={Clock}
              color="text-amber-700"
              bg="bg-amber-50"
              sub={`deslogue ${fmtHms(perdas.tempo_deslogue_seg)} · pausa+ ${fmtHms(perdas.tempo_pausa_excedente_seg)}`}
            />
            <Kpi
              label="Chamadas perdidas"
              value={fmtPerda(perdas.chamadas_perdidas)}
              icon={PhoneCall}
              color="text-orange-600"
              bg="bg-orange-50"
              sub={`÷ TMA ${fmtHms(tma)}`}
            />
            <Kpi
              label="Conversão"
              value={`${perdas.conversao_pct.toFixed(1)}%`}
              icon={Target}
              color="text-teal-700"
              bg="bg-teal-50"
              sub={`${sucN} sucesso / ${tabuladas} tab.`}
            />
            <Kpi
              label="Vendas perdidas (est.)"
              value={fmtPerda(perdas.vendas_perdidas)}
              icon={AlertCircle}
              color="text-rose-600"
              bg="bg-rose-50"
              sub={`VB est. ${fmtPerda(perdas.vb_perdidas)}`}
            />
          </div>

          <div className="card shadow-sm mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {ofensor ? `CPC por supervisor · ${ofensor.nome}` : 'CPC por supervisor'}
              </h2>
              <p className="text-xs text-gray-400">
                {ofensor
                  ? 'Operadores desta tabulação agrupados no supervisor · clique na barra para furar'
                  : `Vermelho = abaixo de ${metaDia}% · clique na tabulação para furar supervisor → operador`}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <SortTh label="Supervisor" col="supervisor" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="left" className="px-4 font-semibold" />
                    <SortTh label="Tab." col="tabuladas" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" className="font-semibold" />
                    <SortTh label="CPC" col="cpc" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" className="font-semibold" />
                    <SortTh label="CPC%" col="pct_cpc" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" className="font-semibold" />
                    <SortTh label="DROP%" col="_drop_rate" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" className="font-semibold" />
                    <SortTh label="TMA" col="tma_seg" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" className="font-semibold" />
                    <SortTh label="VB / Apr." col="vb" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" className="font-semibold" />
                    <SortTh label="Vendas perdidas" col="vendas_perdidas" sortKey={supKey} sortDir={supDir} onSort={toggleSup} align="right" className="font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {(supSorted as typeof supervisoresComDrop).map((s) => (
                    <tr key={s.supervisor} className="border-t border-gray-50">
                      <td className="px-4 py-2 font-medium">{s.supervisor}</td>
                      <td className="px-3 py-2 text-right">{s.tabuladas}</td>
                      <td className="px-3 py-2 text-right">{s.cpc}</td>
                      <td className={`px-3 py-2 text-right font-bold ${s.alerta_cpc ? 'text-red-600' : 'text-teal-700'}`}>
                        {s.pct_cpc.toFixed(1)}%
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${(s._drop_rate || 0) >= 25 ? 'text-red-600' : 'text-gray-700'}`}>
                        {(s._drop_rate || 0).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtHms(s.tma_seg)}</td>
                      <td className="px-3 py-2 text-right">{s.vb} / {s.aprovadas}</td>
                      <td className="px-3 py-2 text-right font-semibold text-rose-700">{fmtPerda(s.vendas_perdidas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <div className="card p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div>
                  <h3 className="text-sm font-bold text-gray-700">Ofensores · TMA e CPC por tabulação</h3>
                  <p className="text-xs text-gray-400">
                    {q ? 'Recalculado no filtro (data / gestor / operador)' : 'Clique na barra para furar supervisor → operador nesta tab'}
                  </p>
                </div>
                {ofensor && (
                  <button type="button" className="text-xs font-semibold text-blue-600" onClick={() => setOfensor(null)}>
                    Limpar filtro
                  </button>
                )}
              </div>
              <div className="h-80 mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={tmaTabs.slice(0, 12)}
                    layout="vertical"
                    margin={{ top: 8, right: 56, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                    <Tooltip content={<ChartTip />} />
                    <Bar
                      dataKey="tma_seg"
                      name="TMA"
                      fill="#6366f1"
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={(d: { payload?: { nome?: string; campanha_op?: string }; nome?: string; campanha_op?: string }) => {
                        const row = d?.payload || d;
                        if (row?.nome) setOfensor({ nome: row.nome, campanha_op: row.campanha_op });
                      }}
                    >
                      <LabelList dataKey="tma_seg" position="right" fontSize={10} fill="#475569" formatter={(v: number) => fmtHms(v)} />
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-1">Volume e % da tabulação</h3>
              <p className="text-xs text-gray-400 mb-3">Qtd · CPC · participação no total</p>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={tmaTabs.slice(0, 12)}
                    layout="vertical"
                    margin={{ top: 8, right: 56, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" width={200} tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
                    <Tooltip content={<ChartTip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar
                      dataKey="total"
                      name="Tabuladas"
                      fill="#3b82f6"
                      radius={[0, 4, 4, 0]}
                      cursor="pointer"
                      onClick={(d: { payload?: { nome?: string; campanha_op?: string }; nome?: string; campanha_op?: string }) => {
                        const row = d?.payload || d;
                        if (row?.nome) setOfensor({ nome: row.nome, campanha_op: row.campanha_op });
                      }}
                    >
                      <LabelList dataKey="pct" position="right" fontSize={10} fill="#475569" formatter={(v: number) => (v != null ? `${v}%` : '')} />
                    </Bar>
                    <Bar dataKey="cpc" name="CPC" fill="#0d9488" radius={[0, 4, 4, 0]} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <TmaHoraHeatmap rows={tmaHora} onSelect={(nome, campanha_op) => setOfensor({ nome, campanha_op })} />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="card shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900">
                  {ofensor ? `Operadores · ${ofensor.nome}` : 'CPC por operador'}
                </h2>
                <p className="text-xs text-gray-400">
                  {ofensor ? 'Pior CPC nesta tabulação' : 'Ordenado do pior CPC para o melhor'}
                </p>
              </div>
              <div className="overflow-x-auto max-h-[520px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <SortTh label="Operador" col="operador" sortKey={rkKey} sortDir={rkDir} onSort={toggleRk} align="left" className="px-3 font-semibold" />
                      <SortTh label="Tab." col="total" sortKey={rkKey} sortDir={rkDir} onSort={toggleRk} align="right" className="font-semibold" />
                      <SortTh label="CPC%" col="_pct_cpc" sortKey={rkKey} sortDir={rkDir} onSort={toggleRk} align="right" className="font-semibold" />
                      <SortTh label="DROP%" col="_drop_rate" sortKey={rkKey} sortDir={rkDir} onSort={toggleRk} align="right" className="font-semibold" />
                      <SortTh label="TMA" col="_tma_seg" sortKey={rkKey} sortDir={rkDir} onSort={toggleRk} align="right" className="font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {(rankingSorted as typeof rankingRows).map((r) => (
                      <tr key={`${r.login}-${r.campanha_op || ''}`} className={`border-t border-gray-50 ${r.alerta_cpc ? 'bg-red-50/50' : ''}`}>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-left font-medium text-blue-700 hover:underline"
                            onClick={() => setOpLogin(r.login)}
                          >
                            {r.operador}
                          </button>
                          <div className="text-[11px] text-gray-400">
                            {r.supervisor}
                            {r.alerta_cpc ? ' · ofensor CPC' : ''}
                            {(r._drop || 0) > 0 ? ` · DROP ${r._drop}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{r.total}</td>
                        <td className={`px-3 py-2 text-right font-bold ${r.alerta_cpc ? 'text-red-600' : 'text-teal-700'}`}>
                          {(r.pct_cpc || 0).toFixed(1)}%
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold ${(r._drop_rate || 0) >= 25 ? 'text-red-600' : 'text-gray-700'}`}>
                          {(r._drop_rate || 0).toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtHms(r.tma_seg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="xl:col-span-2 card shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Últimas tabulações</h2>
                  {ofensor && (
                    <p className="text-xs text-indigo-600 mt-0.5">
                      Filtro ofensor: {ofensor.nome}
                      {ofensor.campanha_op ? ` · ${ofensor.campanha_op}` : ''}
                    </p>
                  )}
                </div>
                {ofensor && (
                  <button type="button" className="text-xs font-semibold text-blue-600" onClick={() => setOfensor(null)}>
                    Ver todas
                  </button>
                )}
              </div>
              <div className="overflow-x-auto max-h-[520px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <SortTh label="Hora" col="call_time" sortKey={chKey} sortDir={chDir} onSort={toggleCh} align="left" className="px-4 font-semibold" />
                      <SortTh label="Operador" col="user_name" sortKey={chKey} sortDir={chDir} onSort={toggleCh} align="left" className="px-4 font-semibold" />
                      <SortTh label="Tabulação" col="classification_name" sortKey={chKey} sortDir={chDir} onSort={toggleCh} align="left" className="px-4 font-semibold" />
                      <SortTh label="Tel." col="_tel" sortKey={chKey} sortDir={chDir} onSort={toggleCh} align="left" className="px-4 font-semibold" />
                      <SortTh label="Flag" col="_flag" sortKey={chKey} sortDir={chDir} onSort={toggleCh} align="left" className="px-4 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {(chamadasSorted as typeof chamadaRows).map((c) => (
                      <tr key={c.id} className="border-t border-gray-50">
                        <td className="px-4 py-2 tabular-nums text-gray-500">{fmtHora(c.call_time)}</td>
                        <td className="px-4 py-2">
                          <button
                            type="button"
                            className="text-left font-medium text-blue-700 hover:underline"
                            onClick={() => c.login && setOpLogin(c.login)}
                          >
                            {c.user_name}
                          </button>
                          <div className="text-[11px] text-gray-400">{c.campanha_op || c.campaign_name} · {c.supervisor_name}</div>
                        </td>
                        <td className="px-4 py-2 text-gray-700">
                          {c.classification_name}
                          {isTabDrop(c.classification_name) && (
                            <span className="ml-1.5 inline-flex rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                              DROP
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-gray-600">{tel(c)}</td>
                        <td className="px-4 py-2">
                          {isTabDrop(c.classification_name) ? (
                            <span className="badge bg-red-50 text-red-700 font-bold">DROP</span>
                          ) : c.success ? (
                            <span className="badge bg-emerald-50 text-emerald-700">Sucesso</span>
                          ) : (c.cpc_op ?? c.cpc) ? (
                            <span className="badge bg-teal-50 text-teal-700">CPC</span>
                          ) : c.refusal ? (
                            <span className="badge bg-amber-50 text-amber-700">Recusa</span>
                          ) : (
                            <span className="badge bg-gray-100 text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <p className="sr-only">{rankingVol.length} operadores</p>
        </>
      )}
      {opLogin && (
        <OperadorFicha
          login={opLogin}
          jornada={jornada}
          ativas={tab === 'live' ? data?.ativas || [] : []}
          chamadas={tab === 'live' ? data?.chamadas_recente || [] : hist.flatMap((h) => h.chamadas_recente || [])}
          ofensoresTab={tab === 'live' ? data?.ofensores_tab || [] : hist.flatMap((h) => h.ofensores_tab || [])}
          tmaTabs={
            tab === 'live'
              ? (data?.tma_por_tabulacao?.length ? data.tma_por_tabulacao : (data?.top_tabulacao || []))
              : hist.flatMap((h) => h.tma_por_tabulacao || h.top_tabulacao || [])
          }
          onClose={() => setOpLogin(null)}
        />
      )}
    </AdminLayout>
  );
}

function mergeRanking(hist: EvaPayload[]): EvaRankingOp[] {
  const acc: Record<string, EvaRankingOp & { tma_w: number; tma_n: number }> = {};
  for (const h of hist) {
    for (const r of h.ranking_operadores || []) {
      const k = `${r.login}|${r.campanha_op || ''}`;
      const n = r.chamadas || r.total || 0;
      if (!acc[k]) acc[k] = { ...r, tma_w: (r.tma_seg || 0) * n, tma_n: n };
      else {
        acc[k].total += r.total;
        acc[k].cpc += r.cpc;
        acc[k].sucesso += r.sucesso;
        acc[k].recusa += r.recusa;
        acc[k].chamadas = (acc[k].chamadas || 0) + (r.chamadas || 0);
        acc[k].tma_w += (r.tma_seg || 0) * n;
        acc[k].tma_n += n;
      }
    }
  }
  return Object.values(acc).map((r) => {
    const { tma_w, tma_n, ...rest } = r;
    return {
      ...rest,
      tma_seg: tma_n ? Math.round((tma_w / tma_n) * 10) / 10 : r.tma_seg,
      pct_cpc: r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0,
      alerta_cpc: r.total >= 8 && (r.total ? (100 * r.cpc) / r.total : 0) < resolveCpcMeta(),
    };
  });
}

function filtrarCampanhaTab<T extends { campanha_op?: string }>(rows: T[], campanha: CampanhaOp): T[] {
  if (campanha === 'TODAS') return rows;
  return rows.filter((r) => !r.campanha_op || r.campanha_op === campanha);
}

function mergeOfensores(hist: EvaPayload[]): EvaOfensorTab[] {
  const acc: Record<string, EvaOfensorTab & { tma_w: number }> = {};
  for (const h of hist) {
    for (const r of h.ofensores_tab || []) {
      const k = `${r.nome}|${r.login}|${r.campanha_op || ''}`;
      if (!acc[k]) acc[k] = { ...r, tma_w: 0 };
      else {
        acc[k].total += r.total;
        acc[k].cpc += r.cpc;
        acc[k].sucesso = (acc[k].sucesso || 0) + (r.sucesso || 0);
      }
      acc[k].tma_w += (r.tma_seg || 0) * (r.total || 0);
    }
  }
  return Object.values(acc).map((r) => {
    const pct = r.total ? Math.round((1000 * r.cpc) / r.total) / 10 : 0;
    const { tma_w, ...rest } = r;
    return {
      ...rest,
      tma_seg: r.total ? Math.round((tma_w / r.total) * 10) / 10 : r.tma_seg,
      pct_cpc: pct,
      alerta_cpc: r.total >= 5 && pct < resolveCpcMeta() && !isTabNaoCpc(r.nome),
    };
  });
}

function mergeCpcCamp(hist: EvaPayload[]): EvaCpcCampanha[] {
  const acc: Record<
    string,
    { tabuladas: number; cpc: number; cpc_eva: number; evaN: number; fonte: string; confiavel: boolean }
  > = {};
  for (const h of hist) {
    for (const c of h.cpc_por_campanha || []) {
      if (!acc[c.campanha_op]) {
        acc[c.campanha_op] = {
          tabuladas: 0,
          cpc: 0,
          cpc_eva: 0,
          evaN: 0,
          fonte: c.fonte,
          confiavel: c.confiavel,
        };
      }
      acc[c.campanha_op].tabuladas += c.tabuladas;
      acc[c.campanha_op].cpc += c.cpc;
      acc[c.campanha_op].cpc_eva += c.cpc_eva || 0;
      acc[c.campanha_op].evaN += c.tabuladas;
      if (!c.confiavel) acc[c.campanha_op].confiavel = false;
      if (c.fonte !== 'eva') acc[c.campanha_op].fonte = 'tabulacao';
    }
  }
  return Object.entries(acc).map(([campanha_op, v]) => ({
    campanha_op,
    tabuladas: v.tabuladas,
    cpc: v.cpc,
    cpc_eva: v.cpc_eva,
    pct_cpc: v.tabuladas ? Math.round((1000 * v.cpc) / v.tabuladas) / 10 : 0,
    pct_cpc_eva: v.evaN ? Math.round((1000 * v.cpc_eva) / v.evaN) / 10 : 0,
    confiavel: v.confiavel,
    fonte: v.fonte,
  }));
}

function consolidarDrill(rows: EvaOfensorTab[]): SupervisorResumo[] {
  const tabNome = rows[0]?.nome;
  const acc: Record<string, SupervisorResumo & { ops: Set<string> }> = {};
  for (const r of rows) {
    const sup = r.supervisor || 'Sem supervisor';
    if (!acc[sup]) {
      acc[sup] = {
        supervisor: sup,
        operadores: 0,
        logados: 0,
        cpc: 0,
        tabuladas: 0,
        pct_cpc: 0,
        alerta_cpc: false,
        tma_seg: 0,
        pausa_seg: 0,
        logado_seg: 0,
        pct_pausa: 0,
        relogins: 0,
        tempo_perdido_seg: 0,
        vb: 0,
        aprovadas: 0,
        sucesso: 0,
        pausa_excedente_seg: 0,
        chamadas_perdidas: 0,
        vendas_perdidas: 0,
        ops: new Set(),
      };
    }
    acc[sup].ops.add(r.login);
    acc[sup].tabuladas += r.total;
    acc[sup].cpc += r.cpc;
    acc[sup].sucesso += r.sucesso || 0;
  }
  return Object.values(acc)
    .map((r) => {
      const { ops, ...rest } = r;
      rest.operadores = ops.size;
      rest.pct_cpc = rest.tabuladas ? Math.round((1000 * rest.cpc) / rest.tabuladas) / 10 : 0;
      rest.alerta_cpc = rest.tabuladas >= 5 && rest.pct_cpc < resolveCpcMeta() && !isTabNaoCpc(tabNome);
      return rest;
    })
    .sort((a, b) => a.pct_cpc - b.pct_cpc);
}

function labelTab(nome: string, campanha_op?: string): string {
  if (!campanha_op) return nome;
  const p = campanha_op === 'PORTABILIDADE' ? 'Port' : campanha_op === 'MIGRACAO' ? 'Mig' : campanha_op.slice(0, 4);
  return `${p} · ${nome}`;
}

function consolidarTabs(rows: EvaTabulacao[]) {
  const acc: Record<
    string,
    { nome: string; total: number; cpc: number; tma_w: number; att_n: number; campanha_op?: string; fonte?: string }
  > = {};
  for (const t of rows) {
    const k = `${t.nome}|${t.campanha_op || ''}`;
    if (!acc[k]) {
      acc[k] = {
        nome: t.nome,
        total: 0,
        cpc: 0,
        tma_w: 0,
        att_n: 0,
        campanha_op: t.campanha_op,
        fonte: t.cpc_fonte,
      };
    }
    acc[k].total += t.total;
    acc[k].cpc += cpcOperacionalDeTab(t.nome, t.total, t.cpc, t.cpc_fonte);
    acc[k].tma_w += (t.tma_seg || 0) * t.total;
    acc[k].att_n += t.att_n || 0;
    if (t.cpc_fonte && t.cpc_fonte !== 'eva') acc[k].fonte = t.cpc_fonte;
  }
  const list = Object.values(acc).map((t) => ({
    nome: t.nome,
    campanha_op: t.campanha_op,
    label: labelTab(t.nome, t.campanha_op),
    total: t.total,
    cpc: t.cpc,
    cpc_fonte: t.fonte,
    att_n: t.att_n,
    tma_seg: t.total ? Math.round((t.tma_w / t.total) * 10) / 10 : 0,
  }));
  const tot = list.reduce((s, t) => s + t.total, 0) || 1;
  return list
    .map((t) => ({ ...t, pct: Math.round((10000 * t.total) / tot) / 100 }))
    .sort((a, b) => b.total - a.total);
}

function consolidarTabsDeOfensores(rows: EvaOfensorTab[]) {
  const acc: Record<string, { nome: string; total: number; cpc: number; tma_w: number; campanha_op?: string }> = {};
  for (const r of rows) {
    if (isTabulacaoAutomatica(r.nome)) continue;
    const k = `${r.nome}|${r.campanha_op || ''}`;
    if (!acc[k]) acc[k] = { nome: r.nome, total: 0, cpc: 0, tma_w: 0, campanha_op: r.campanha_op };
    acc[k].total += r.total;
    acc[k].cpc += r.cpc;
    acc[k].tma_w += (r.tma_seg || 0) * (r.total || 0);
  }
  const list = Object.values(acc).map((t) => ({
    nome: t.nome,
    campanha_op: t.campanha_op,
    label: labelTab(t.nome, t.campanha_op),
    total: t.total,
    cpc: t.cpc,
    tma_seg: t.total ? Math.round((t.tma_w / t.total) * 10) / 10 : 0,
    att_n: t.total,
  }));
  const tot = list.reduce((s, t) => s + t.total, 0) || 1;
  return list
    .map((t) => ({ ...t, pct: Math.round((10000 * t.total) / tot) / 100 }))
    .sort((a, b) => b.total - a.total);
}

function consolidarHora(rows: EvaTmaHora[]): EvaTmaHora[] {
  const acc: Record<string, { nome: string; hora: number; n: number; tma_w: number; campanha_op?: string }> = {};
  for (const r of rows) {
    const k = `${r.nome}|${r.hora}|${r.campanha_op || ''}`;
    if (!acc[k]) acc[k] = { nome: r.nome, hora: r.hora, n: 0, tma_w: 0, campanha_op: r.campanha_op };
    acc[k].n += r.n || 0;
    acc[k].tma_w += (r.tma_seg || 0) * (r.n || 0);
  }
  const tot = Object.values(acc).reduce((s, r) => s + r.n, 0) || 1;
  return Object.values(acc).map((r) => ({
    nome: r.nome,
    hora: r.hora,
    n: r.n,
    tma_seg: r.n ? Math.round((r.tma_w / r.n) * 10) / 10 : 0,
    pct: Math.round((10000 * r.n) / tot) / 100,
    campanha_op: r.campanha_op,
  }));
}

function mergeTabs(hist: EvaPayload[]) {
  const acc: Record<string, { nome: string; total: number; cpc: number; tma_seg: number; tma_w: number; campanha_op?: string; cpc_fonte?: string }> = {};
  for (const h of hist) {
    for (const t of h.tma_por_tabulacao || h.top_tabulacao || []) {
      const k = `${t.nome}|${t.campanha_op || ''}`;
      if (!acc[k]) acc[k] = { nome: t.nome, total: 0, cpc: 0, tma_seg: 0, tma_w: 0, campanha_op: t.campanha_op, cpc_fonte: t.cpc_fonte };
      acc[k].total += t.total;
      acc[k].cpc += t.cpc || 0;
      acc[k].tma_w += (t.tma_seg || 0) * t.total;
      if (t.cpc_fonte && t.cpc_fonte !== 'eva') acc[k].cpc_fonte = t.cpc_fonte;
    }
  }
  const rows = Object.values(acc).map((t) => ({
    ...t,
    tma_seg: t.total ? Math.round((t.tma_w / t.total) * 10) / 10 : 0,
  }));
  const tot = rows.reduce((s, t) => s + t.total, 0) || 1;
  return rows
    .map((t) => ({ ...t, pct: Math.round((10000 * t.total) / tot) / 100 }))
    .sort((a, b) => b.total - a.total);
}

function mergeTmaHora(hist: EvaPayload[]): EvaTmaHora[] {
  const acc: Record<string, { nome: string; hora: number; n: number; tma_w: number; campanha_op?: string }> = {};
  for (const h of hist) {
    for (const r of h.tma_hora || []) {
      const k = `${r.nome}|${r.hora}|${r.campanha_op || ''}`;
      if (!acc[k]) acc[k] = { nome: r.nome, hora: r.hora, n: 0, tma_w: 0, campanha_op: r.campanha_op };
      acc[k].n += r.n || 0;
      acc[k].tma_w += (r.tma_seg || 0) * (r.n || 0);
    }
  }
  const tot = Object.values(acc).reduce((s, r) => s + r.n, 0) || 1;
  return Object.values(acc).map((r) => ({
    nome: r.nome,
    hora: r.hora,
    n: r.n,
    tma_seg: r.n ? Math.round((r.tma_w / r.n) * 10) / 10 : 0,
    pct: Math.round((10000 * r.n) / tot) / 100,
    campanha_op: r.campanha_op,
  }));
}

function ChartTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { nome?: string; campanha_op?: string; tma_seg?: number; total?: number; n?: number; cpc?: number; pct?: number } }[];
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-lg text-xs text-gray-700">
      <p className="font-semibold text-gray-900 mb-1.5 max-w-[280px] leading-snug">{d.nome}</p>
      {d.campanha_op && <p>{d.campanha_op === 'PORTABILIDADE' ? 'Portabilidade' : d.campanha_op === 'MIGRACAO' ? 'Migração' : d.campanha_op}</p>}
      {d.tma_seg != null && <p>TMA: {fmtHms(d.tma_seg)}</p>}
      {d.total != null && <p>Tabuladas: {d.total}</p>}
      {d.n != null && d.total == null && <p>Qtd: {d.n}</p>}
      {d.cpc != null && <p>CPC: {d.cpc}</p>}
      {d.pct != null && <p>% do total: {d.pct}%</p>}
    </div>
  );
}

const HORAS_TMA = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

function tmaCellColor(seg: number, max: number): string {
  if (!seg || !max) return 'bg-slate-50 text-slate-300';
  const r = seg / max;
  if (r < 0.25) return 'bg-indigo-50 text-indigo-700';
  if (r < 0.45) return 'bg-indigo-100 text-indigo-800';
  if (r < 0.65) return 'bg-indigo-200 text-indigo-900';
  if (r < 0.85) return 'bg-indigo-400 text-white';
  return 'bg-indigo-700 text-white';
}

function TmaHoraHeatmap({
  rows,
  onSelect,
}: {
  rows: EvaTmaHora[];
  onSelect: (nome: string, campanha_op?: string) => void;
}) {
  const [hover, setHover] = useState<{ key: string; hora: number } | null>(null);
  const byNome = useMemo(() => {
    const map: Record<string, Record<number, EvaTmaHora>> = {};
    const vol: Record<string, number> = {};
    const meta: Record<string, { nome: string; campanha_op?: string; label: string }> = {};
    for (const r of rows) {
      const key = `${r.nome}|${r.campanha_op || ''}`;
      if (!map[key]) map[key] = {};
      map[key][r.hora] = r;
      vol[key] = (vol[key] || 0) + (r.n || 0);
      meta[key] = { nome: r.nome, campanha_op: r.campanha_op, label: labelTab(r.nome, r.campanha_op) };
    }
    const nomes = Object.keys(vol).sort((a, b) => vol[b] - vol[a]).slice(0, 14);
    return { map, nomes, vol, meta };
  }, [rows]);
  const maxTma = useMemo(
    () => Math.max(1, ...rows.map((r) => r.tma_seg || 0)),
    [rows],
  );
  const hovered = hover ? byNome.map[hover.key]?.[hover.hora] : null;

  if (!byNome.nomes.length) {
    return (
      <div className="card p-6 shadow-sm mb-6">
        <h3 className="text-sm font-bold text-gray-700">TMA por hora (9h–21h)</h3>
        <p className="text-xs text-gray-400 mt-1">Sem dados de TMA horário neste recorte.</p>
      </div>
    );
  }

  return (
    <div className="card p-6 shadow-sm mb-6 overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-700">TMA por hora · ofensores</h3>
          <p className="text-xs text-gray-400">Média 9h–21h em tabulação humana · hover = TMA, qtd e % · clique para filtrar · acompanha data/gestor/operador</p>
        </div>
        {hovered && (
          <div className="text-right text-xs text-gray-600">
            <p className="font-semibold text-gray-800 max-w-xs truncate">{hovered.nome}</p>
            <p>
              {hovered.hora}h · TMA {fmtHms(hovered.tma_seg)} · {hovered.n} · {hovered.pct}%
            </p>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-left font-semibold text-gray-500 px-2 py-1 min-w-[180px]">Tabulação</th>
              {HORAS_TMA.map((h) => (
                <th key={h} className="font-semibold text-gray-400 text-center w-14">{h}h</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byNome.nomes.map((key) => {
              const meta = byNome.meta[key];
              return (
              <tr key={key}>
                <td>
                  <button
                    type="button"
                    className="text-left font-medium text-gray-700 hover:text-indigo-700 px-2 py-1 max-w-[220px] truncate"
                    title={meta?.label || key}
                    onClick={() => onSelect(meta?.nome || key, meta?.campanha_op)}
                  >
                    {meta?.label || key}
                  </button>
                </td>
                {HORAS_TMA.map((h) => {
                  const cell = byNome.map[key]?.[h];
                  return (
                    <td key={h}>
                      <button
                        type="button"
                        className={`w-full rounded-md px-1 py-1.5 tabular-nums ${tmaCellColor(cell?.tma_seg || 0, maxTma)}`}
                        title={
                          cell
                            ? `${meta?.label || key} · ${h}h · TMA ${fmtHms(cell.tma_seg)} · ${cell.n} chamadas · ${cell.pct}%`
                            : `${meta?.label || key} · ${h}h · sem volume`
                        }
                        onMouseEnter={() => setHover({ key, hora: h })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => onSelect(meta?.nome || key, meta?.campanha_op)}
                      >
                        {cell ? fmtHms(cell.tma_seg).slice(3) : '—'}
                      </button>
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
            value === o.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({
  label, value, icon: Icon, color, bg, sub,
}: {
  label: string; value: number | string; icon: typeof PhoneCall; color: string; bg: string; sub?: string;
}) {
  return (
    <div className="card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center`}>
          <Icon size={18} className={color} />
        </div>
      </div>
      <div className={`text-3xl font-black ${color}`}>{value}</div>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
