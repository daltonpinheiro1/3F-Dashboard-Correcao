import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Clock,
  Headphones,
  PauseCircle,
  RefreshCw,
  Search,
  TrendingDown,
  Users,
  X,
} from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { OperadorFicha } from '../components/OperadorFicha';
import {
  PAUSA_META_PCT,
  calcularPerdas,
  consolidarSupervisores,
  fetchEvaLive,
  fetchEvaPeriodo,
  fmtDur,
  fmtHms,
  fmtHora,
  fmtPerda,
  matchCampanha,
  somarPausas,
  type CampanhaOp,
  type EvaPayload,
} from '../lib/evaDash';
import { listarOfensores, jornadaUnicaPorLogin, type FocoId } from '../lib/ofensorOp';
import { filtroEvaAtivo, useFiltroEvaStore } from '../store/filtroStore';

const ESTADO: Record<string, { label: string; cls: string }> = {
  disponivel: { label: 'Disponível', cls: 'bg-emerald-50 text-emerald-700' },
  atendimento: { label: 'Em atendimento', cls: 'bg-blue-50 text-blue-700' },
  pausa: { label: 'Em pausa', cls: 'bg-amber-50 text-amber-800' },
  instavel: { label: 'Keep-alive atrasado', cls: 'bg-red-50 text-red-700' },
};

export function OperacaoPage() {
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
  const [opLogin, setOpLogin] = useState<string | null>(null);
  const [vista, setVista] = useState<'piso' | 'ofensores'>('ofensores');
  const [focoFiltro, setFocoFiltro] = useState<'todos' | FocoId>('todos');

  const loadLive = useCallback(async (spin = true) => {
    if (spin) setIsLoading(true);
    setRefreshing(true);
    setFetchError(null);
    try {
      setData(await fetchEvaLive());
      setLastUpdate(new Date());
    } catch (e: any) {
      setFetchError(e?.message || 'Não foi possível ler o EVA.');
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
    } catch (e: any) {
      setFetchError(e?.message || 'Falha no histórico.');
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

  const q = search.trim().toLowerCase();
  const jornadaBase = tab === 'live' ? data?.jornada || [] : hist.flatMap((h) => h.jornada || []);
  const ativasBase = (data?.ativas || []).filter((a) => matchCampanha(a, campanha));
  const jornadaFiltrada = useMemo(() => {
    return jornadaBase.filter((j) => {
      if (!matchCampanha(j, campanha)) return false;
      if (!q) return true;
      return `${j.user_name} ${j.login} ${j.supervisor_name}`.toLowerCase().includes(q);
    });
  }, [jornadaBase, campanha, q]);
  const jornada = useMemo(() => jornadaUnicaPorLogin(jornadaFiltrada), [jornadaFiltrada]);

  const ativas = useMemo(() => {
    return ativasBase.filter((a) => {
      if (!q) return true;
      return `${a.user_name} ${a.login} ${a.supervisor_name}`.toLowerCase().includes(q);
    });
  }, [ativasBase, q]);

  const supervisores = useMemo(
    () => consolidarSupervisores(jornada, tab === 'live' ? ativas : []),
    [jornada, ativas, tab],
  );
  const pausasTipo = useMemo(() => somarPausas(jornada), [jornada]);

  const logado = jornada.reduce((s, j) => s + (j.logged_time || 0), 0);
  const pausaSeg = jornada.reduce((s, j) => s + (j.pausa_seg || 0), 0);
  const pausaQtd = jornada.reduce((s, j) => s + (j.pausa_qtd || 0), 0);
  const perdido = jornada.reduce((s, j) => s + (j.tempo_perdido_seg || 0), 0);
  const relogins = jornada.reduce((s, j) => s + (j.relogins || 0), 0);
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
  const ofensores = useMemo(() => {
    const list = listarOfensores(jornada);
    if (focoFiltro === 'todos') return list;
    return list.filter((o) => o.focos.some((f) => f.id === focoFiltro));
  }, [jornada, focoFiltro]);
  const chamadasRec = tab === 'live' ? data?.chamadas_recente || [] : hist.flatMap((h) => h.chamadas_recente || []);
  const ofensoresTab = tab === 'live' ? data?.ofensores_tab || [] : hist.flatMap((h) => h.ofensores_tab || []);

  return (
    <AdminLayout title="Operação" subtitle="Quadro de ofensores · ficha no clique · manhã 09:00 / tarde 15:00">
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
          setOpLogin(null);
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

      {tab === 'hist' && histFaltando.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Histórico gerencial ainda sem {histFaltando.length} dia(s) no período (ex.: {histFaltando.slice(0, 3).join(', ')}
          {histFaltando.length > 3 ? '…' : ''}). D-1 (3 meses) entra na madrugada a partir do EVA reports/activities — o live de hoje não consulta essa base pesada.
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Kpi label="Logados agora" value={tab === 'live' ? ativas.length : jornada.length} icon={Users} color="text-blue-600" bg="bg-blue-50" />
            <Kpi label="Em pausa" value={tab === 'live' ? ativas.filter((a) => a.estado === 'pausa').length : '—'} icon={PauseCircle} color="text-amber-600" bg="bg-amber-50" />
            <Kpi label="TMA" value={fmtHms(tma)} icon={Clock} color="text-indigo-600" bg="bg-indigo-50" sub={`${chamadasN} atendimentos`} />
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Mini label="Instâncias de login" value={instancias} />
            <Mini label="Relogins (deslogues)" value={relogins} warn={relogins > 20} onClick={() => { setVista('ofensores'); setFocoFiltro('deslogue'); }} />
            <Mini label="Tempo perdido entre deslogs" value={fmtDur(perdido)} warn={perdido > 1800} />
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
            <Seg
              value={vista}
              onChange={setVista}
              options={[
                { id: 'ofensores', label: `Ofensores (${ofensores.length})` },
                { id: 'piso', label: 'Piso e jornada' },
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
                  {ofensores.map((o) => (
                    <button
                      key={o.login}
                      type="button"
                      onClick={() => setOpLogin(o.login)}
                      className={`text-left card p-4 shadow-sm border-l-4 hover:shadow-md transition-shadow ${
                        o.nivel === 'critico' ? 'border-l-red-600 bg-red-50/60' : 'border-l-orange-400 bg-orange-50/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-gray-900 leading-tight">{o.nome}</p>
                          <p className="text-[11px] text-gray-500">{o.supervisor} · {o.campanha}</p>
                        </div>
                        <span className={`badge ${o.nivel === 'critico' ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>
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
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {vista === 'piso' && (
          <>
          <div className="card shadow-sm mb-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Consolidado por supervisor</h2>
              <p className="text-xs text-gray-400">CPC operacional por campanha (flag EVA só se discriminar) · pausa vs meta {PAUSA_META_PCT}%</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Supervisor</th>
                    <th className="text-right px-3 py-2 font-semibold">Ops</th>
                    <th className="text-right px-3 py-2 font-semibold">Logados</th>
                    <th className="text-right px-3 py-2 font-semibold">Tab.</th>
                    <th className="text-right px-3 py-2 font-semibold">CPC</th>
                    <th className="text-right px-3 py-2 font-semibold">CPC%</th>
                    <th className="text-right px-3 py-2 font-semibold">TMA</th>
                    <th className="text-right px-3 py-2 font-semibold">% pausa</th>
                    <th className="text-right px-3 py-2 font-semibold">Relogins</th>
                    <th className="text-right px-3 py-2 font-semibold">Perda</th>
                    <th className="text-right px-3 py-2 font-semibold">Pausa+</th>
                    <th className="text-right px-3 py-2 font-semibold">Vendas perdidas</th>
                  </tr>
                </thead>
                <tbody>
                  {supervisores.map((s) => (
                    <tr key={s.supervisor} className="border-t border-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-800">{s.supervisor}</td>
                      <td className="px-3 py-2 text-right">{s.operadores}</td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">{s.logados}</td>
                      <td className="px-3 py-2 text-right">{s.tabuladas}</td>
                      <td className="px-3 py-2 text-right">{s.cpc}</td>
                      <td className={`px-3 py-2 text-right font-bold ${s.alerta_cpc ? 'text-red-600' : 'text-teal-700'}`}>
                        {s.pct_cpc.toFixed(1)}%
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
                  ))}
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
                  <p className="text-xs text-gray-400">Keep-alive atrasado = sessão instável (candidato a relogin)</p>
                </div>
                <div className="overflow-x-auto max-h-[480px]">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold">Operador</th>
                        <th className="text-left px-4 py-2 font-semibold">Supervisor</th>
                        <th className="text-left px-4 py-2 font-semibold">Operação</th>
                        <th className="text-left px-4 py-2 font-semibold">Estado</th>
                        <th className="text-right px-4 py-2 font-semibold">Logins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ativas.map((a) => {
                        const st = ESTADO[a.estado] || ESTADO.disponivel;
                        return (
                          <tr key={`${a.id}-${a.login}`} className="border-t border-gray-50">
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                className="text-left font-medium text-blue-700 hover:underline"
                                onClick={() => a.login && setOpLogin(a.login)}
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
                            <td className="px-4 py-2 text-right">
                              {a.instancias || 1}
                              {(a.relogins || 0) > 0 && (
                                <span className="block text-[11px] text-amber-700">
                                  {a.relogins} relogin · {fmtDur(a.tempo_perdido_seg)}
                                </span>
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
                <p className="text-xs text-gray-400">Entregue = logado ≥ 05:50 · perda = intervalo entre logout e novo login</p>
              </div>
              <div className="overflow-x-auto max-h-[480px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Operador</th>
                      <th className="text-left px-3 py-2 font-semibold">Login</th>
                      <th className="text-right px-3 py-2 font-semibold">Logado</th>
                      <th className="text-right px-3 py-2 font-semibold">Pausa</th>
                      <th className="text-right px-3 py-2 font-semibold">Inst.</th>
                      <th className="text-right px-3 py-2 font-semibold">Perda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jornada.map((j, i) => (
                      <tr
                        key={`${j.login}-${j.date_login}-${i}`}
                        className={`border-t border-gray-50 ${(j.acima_meta_pausa || (j.atraso_entrada_seg || 0) > 0 || (j.relogins || 0) > 0) ? 'bg-red-50/40' : ''}`}
                      >
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-left font-medium text-blue-700 hover:underline"
                            onClick={() => j.login && setOpLogin(j.login)}
                          >
                            {j.user_name}
                          </button>
                          <div className="text-[11px] text-gray-400">
                            {j.supervisor_name} · {j.campanha_op}
                            {j.turno === 'tarde' ? ' · tarde' : j.turno === 'manha' ? ' · manhã' : ''}
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
                        <td className="px-3 py-2 text-right text-amber-700">{fmtDur(j.tempo_perdido_seg)}</td>
                      </tr>
                    ))}
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
          jornada={jornada}
          ativas={tab === 'live' ? data?.ativas || [] : []}
          chamadas={chamadasRec}
          ofensoresTab={ofensoresTab}
          tmaTabs={tab === 'live' ? data?.tma_por_tabulacao || [] : hist.flatMap((h) => h.tma_por_tabulacao || [])}
          onClose={() => setOpLogin(null)}
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
  const ops: { id: CampanhaOp; label: string }[] = [
    { id: 'TODAS', label: 'Todas' },
    { id: 'PORTABILIDADE', label: 'Portabilidade' },
    { id: 'MIGRACAO', label: 'Migração Pré' },
  ];
  return (
    <div className="card p-4 shadow-sm mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <Seg
          value={props.tab}
          onChange={props.setTab}
          options={[
            { id: 'live', label: 'Realtime' },
            { id: 'hist', label: 'Histórico' },
          ]}
        />
        <Seg value={props.campanha} onChange={props.setCampanha} options={ops} />
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

function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
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

function Mini({ label, value, warn, onClick }: { label: string; value: number | string; warn?: boolean; onClick?: () => void }) {
  const cls = `card p-4 shadow-sm text-left w-full ${onClick ? 'hover:shadow-md' : ''}`;
  const body = (
    <>
      <p className="text-xs text-gray-400 font-semibold uppercase">{label}</p>
      <p className={`text-xl font-black mt-1 ${warn ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
    </>
  );
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}
