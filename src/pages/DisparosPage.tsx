import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Download,
  Filter,
  Layers,
  PieChart,
  Radio,
  RefreshCw,
  Rocket,
  Search,
  Sparkles,
  Timer,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminLayout } from '../components/AdminLayout';
import { GerencialAnalytics } from '../components/disparos/GerencialAnalytics';
import { GerencialCommandCenter } from '../components/disparos/GerencialCommandCenter';
import { GerencialP0Strip } from '../components/disparos/GerencialP0Strip';
import { FatiaStratBlock, MiniKpi, StratCard } from '../components/disparos/DisparosWidgets';
import { ChipBar, TabBar } from '../components/ui/TabBar';
import {
  ACOES,
  COR_BAR,
  COR_SOFT,
  fetchDashboardJson,
  fmtDelta,
  GRUPOS_FILTRO,
  mesAtualBrt,
  mesesChips,
  n,
  POLL_MS,
} from '../lib/disparosFormat';
import { dashboardSessionHeaders } from '../lib/dashboardSession';
import { exportPortabilidadeFatiaExcel } from '../lib/portabilidadeExport';
import {
  formatarResumoLote,
  montarLoteInteligente,
} from '../lib/portabilidadeAcaoFatia';
import {
  reconciliaHistoricoFunil,
  validarFunilExclusivo,
} from '../lib/portabilidadeReconciliacao';
import type {
  DisparosPayload,
  Fatia,
  FatiaItem,
  FunilPayload,
  HistoricoPayload,
  StratRow,
} from '../types/portabilidade';

export function DisparosPage() {
  const [data, setData] = useState<DisparosPayload | null>(null);
  const [funil, setFunil] = useState<FunilPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [funilLoading, setFunilLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<Date | null>(null);
  const [mes, setMes] = useState(mesAtualBrt);
  const [modo, setModo] = useState<'operacional' | 'gerencial'>('operacional');
  const [propostaQ, setPropostaQ] = useState('');
  const [journey, setJourney] = useState<{
    resumo?: Record<string, unknown>;
    timeline?: Array<{ ts: string; fonte: string; titulo: string; detalhe?: string; status?: string }>;
    error?: string;
  } | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);

  const [fatiaAtiva, setFatiaAtiva] = useState<Fatia | null>(null);
  const [fatiaItems, setFatiaItems] = useState<FatiaItem[]>([]);
  const [fatiaTotal, setFatiaTotal] = useState(0);
  const [fatiaLoading, setFatiaLoading] = useState(false);
  const [fatiaQ, setFatiaQ] = useState('');
  const [fatiaOffset, setFatiaOffset] = useState(0);
  const [fatiaEstrat, setFatiaEstrat] = useState<{
    motivo_recusar?: StratRow[];
    cancelamento?: StratRow[];
    order_status?: StratRow[];
    ticket_status?: StratRow[];
    logistica?: StratRow[];
  } | null>(null);
  const [fatiaExporting, setFatiaExporting] = useState(false);
  const [fatiaExportOk, setFatiaExportOk] = useState(false);
  const [fatiaBatchConfirm, setFatiaBatchConfirm] = useState(false);
  const [fatiaBatchLoading, setFatiaBatchLoading] = useState(false);
  const [fatiaBatchMsg, setFatiaBatchMsg] = useState<string | null>(null);
  const [fatiaInsight, setFatiaInsight] = useState<string | null>(null);
  const [fatiaInsightLoading, setFatiaInsightLoading] = useState(false);
  const [grupoFiltro, setGrupoFiltro] = useState('');
  const [historico, setHistorico] = useState<HistoricoPayload | null>(null);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [fatiaError, setFatiaError] = useState<string | null>(null);
  const pollGen = useRef(0);
  const periodGen = useRef(0);
  const fatiaGen = useRef(0);
  const chips = useMemo(() => mesesChips(3), []);

  const periodoQs = useMemo(() => {
    const p = new URLSearchParams({ mes, modo });
    return p.toString();
  }, [mes, modo]);

  const load = useCallback(async (opts?: { background?: boolean }) => {
    const gen = periodGen.current;
    if (!opts?.background) setLoading(true);
    try {
      const body = await fetchDashboardJson<DisparosPayload>(
        `/api/portabilidade-disparos?mes=${encodeURIComponent(mes)}`,
      );
      if (gen !== periodGen.current) return;
      setData(body);
      setLastAt(new Date());
      setError(null);
    } catch (e) {
      if (gen !== periodGen.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (gen === periodGen.current && !opts?.background) setLoading(false);
    }
  }, [mes]);

  const loadFunil = useCallback(async (opts?: { background?: boolean }) => {
    const gen = periodGen.current;
    if (!opts?.background) setFunilLoading(true);
    try {
      const body = await fetchDashboardJson<FunilPayload>(`/api/portabilidade-funil?${periodoQs}`);
      if (gen !== periodGen.current) return;
      setFunil(body);
      setLastAt(new Date());
      setError(null);
    } catch (e) {
      if (gen !== periodGen.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      setFunil((prev) => (prev?.fatias?.length ? { ...prev, error: msg } : { error: msg }));
      setError(msg);
    } finally {
      if (gen === periodGen.current && !opts?.background) setFunilLoading(false);
    }
  }, [periodoQs]);

  const loadHistorico = useCallback(async (opts?: { background?: boolean }) => {
    const gen = periodGen.current;
    if (!opts?.background) setHistoricoLoading(true);
    try {
      const body = await fetchDashboardJson<HistoricoPayload>('/api/portabilidade-historico?meses=3');
      if (gen !== periodGen.current) return;
      setHistorico(body);
      setError(null);
    } catch (e) {
      if (gen !== periodGen.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      setHistorico((prev) => (prev?.serie?.length ? { ...prev, error: msg } : { error: msg }));
      setError(msg);
    } finally {
      if (gen === periodGen.current && !opts?.background) setHistoricoLoading(false);
    }
  }, []);

  const loadFatia = useCallback(
    async (fatia: Fatia, offset = 0, q = '') => {
      const gen = ++fatiaGen.current;
      setFatiaLoading(true);
      setFatiaError(null);
      try {
        const params = new URLSearchParams({
          fatia: fatia.id,
          limit: '80',
          offset: String(offset),
          mes,
          modo,
        });
        if (q.trim()) params.set('q', q.trim());
        const r = await fetch(`/api/portabilidade-funil?${params}`, {
          headers: dashboardSessionHeaders(),
        });
        const body = await r.json();
        if (gen !== fatiaGen.current) return;
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
        setFatiaItems(body.items || []);
        setFatiaTotal(body.total || 0);
        setFatiaOffset(offset);
        setFatiaEstrat(body.estratificacao || null);
      } catch (e) {
        if (gen !== fatiaGen.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setFatiaItems([]);
        setFatiaTotal(0);
        setFatiaError(msg);
      } finally {
        if (gen === fatiaGen.current) setFatiaLoading(false);
      }
    },
    [mes, modo],
  );

  const openFatia = useCallback(
    (f: Fatia) => {
      setFatiaAtiva(f);
      setFatiaQ('');
      setFatiaEstrat(null);
      setFatiaInsight(null);
      void loadFatia(f, 0, '');
    },
    [loadFatia],
  );

  const openFatiaById = useCallback(
    (id: string, fallback?: Partial<Fatia>) => {
      const found = (funil?.fatias || []).find((x) => x.id === id);
      if (found) {
        openFatia(found);
        return;
      }
      openFatia({
        id,
        label: fallback?.label || id,
        grupo: fallback?.grupo || 'fechamento',
        cor: fallback?.cor || 'slate',
        descricao: fallback?.descricao || '',
        count: fallback?.count ?? 0,
        pct: fallback?.pct ?? 0,
      });
    },
    [funil?.fatias, openFatia],
  );

  const fetchFatiaAll = useCallback(
    async (fatia: Fatia, q: string) => {
      const params = new URLSearchParams({
        fatia: fatia.id,
        export: '1',
        mes,
        modo,
      });
      if (q.trim()) params.set('q', q.trim());
      const body = await fetchDashboardJson<{ items?: FatiaItem[]; total?: number }>(
        `/api/portabilidade-funil?${params}`,
      );
      const items = body.items || [];
      if (items.length === 0 && (body.total || 0) > 0) {
        throw new Error('Exportação retornou vazio — tente novamente.');
      }
      return items;
    },
    [mes, modo],
  );

  const analisarFatia = useCallback(async () => {
    if (!fatiaAtiva) return;
    setFatiaInsightLoading(true);
    setFatiaInsight(null);
    setFatiaError(null);
    try {
      const r = await fetch('/api/portabilidade-fatia-insight', {
        method: 'POST',
        headers: {
          ...dashboardSessionHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fatia: fatiaAtiva,
          estratificacao: fatiaEstrat,
          gerencial: funil?.gerencial,
          periodo: { mes, modo, label: funil?.periodo?.label },
        }),
      });
      const body = (await r.json()) as { analise?: string; error?: string };
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setFatiaInsight(body.analise || '');
    } catch (e) {
      setFatiaError(e instanceof Error ? e.message : String(e));
    } finally {
      setFatiaInsightLoading(false);
    }
  }, [fatiaAtiva, fatiaEstrat, funil?.gerencial, funil?.periodo?.label, mes, modo]);

  const exportarFatiaExcel = useCallback(async () => {
    if (!fatiaAtiva) return;
    setFatiaExporting(true);
    setFatiaExportOk(false);
    try {
      const rows = await fetchFatiaAll(fatiaAtiva, fatiaQ);
      if (!rows.length) {
        setFatiaError('Nada para exportar nesta fatia.');
        return;
      }
      exportPortabilidadeFatiaExcel(rows, {
        fatiaLabel: fatiaAtiva.label,
        fatiaId: fatiaAtiva.id,
        mes,
        modo,
      });
      setFatiaExportOk(true);
      window.setTimeout(() => setFatiaExportOk(false), 2500);
    } catch (e) {
      setFatiaError(e instanceof Error ? e.message : String(e));
    } finally {
      setFatiaExporting(false);
    }
  }, [fatiaAtiva, fatiaQ, fetchFatiaAll, mes, modo]);

  const enfileirarFatiaLote = useCallback(async () => {
    if (!fatiaAtiva || !fatiaBatchConfirm || fatiaItems.length === 0) return;
    setFatiaBatchLoading(true);
    setFatiaBatchMsg(null);
    setFatiaError(null);
    try {
      const lote = montarLoteInteligente(
        fatiaItems.map((i) => ({ ...i, fatia: i.fatia || fatiaAtiva.id })),
        fatiaAtiva.id,
      );
      if (!lote.length) {
        setFatiaError('Nenhuma proposta enfileirável nesta página (terminais ou sem ação).');
        return;
      }
      const r = await fetch('/api/portabilidade-enqueue', {
        method: 'POST',
        headers: {
          ...dashboardSessionHeaders(),
          'Content-Type': 'application/json',
          'X-Batch-Enqueue': '1',
        },
        body: JSON.stringify({ lote, confirmar: true }),
      });
      const body = (await r.json()) as { mensagem?: string; error?: string };
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setFatiaBatchMsg(`${body.mensagem || 'Lote enfileirado.'} (${formatarResumoLote(lote)})`);
      setFatiaBatchConfirm(false);
      void load({ background: true });
    } catch (e) {
      setFatiaError(e instanceof Error ? e.message : String(e));
    } finally {
      setFatiaBatchLoading(false);
    }
  }, [fatiaAtiva, fatiaBatchConfirm, fatiaItems, load]);

  const lotePreview = useMemo(() => {
    if (!fatiaAtiva || !fatiaItems.length) return '';
    const lote = montarLoteInteligente(
      fatiaItems.map((i) => ({ ...i, fatia: i.fatia || fatiaAtiva.id })),
      fatiaAtiva.id,
    );
    return lote.length ? formatarResumoLote(lote) : '';
  }, [fatiaAtiva, fatiaItems]);

  const loadJourney = useCallback(async (override?: string) => {
    const q = (override ?? propostaQ).trim();
    if (!q) return;
    setPropostaQ(q);
    setJourneyLoading(true);
    setJourney(null);
    try {
      const r = await fetch(`/api/portabilidade-journey?proposta=${encodeURIComponent(q)}`, {
        headers: dashboardSessionHeaders(),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setJourney(body);
    } catch (e) {
      setJourney({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setJourneyLoading(false);
    }
  }, [propostaQ]);

  const refreshAll = useCallback(() => {
    void load();
    void loadFunil();
    if (modo === 'gerencial') void loadHistorico();
  }, [load, loadFunil, loadHistorico, modo]);

  useEffect(() => {
    periodGen.current += 1;
    const gen = ++pollGen.current;
    void load();
    void loadFunil();
    if (modo === 'gerencial') void loadHistorico();

    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      void load({ background: true });
      void loadFunil({ background: true });
      if (modo === 'gerencial') void loadHistorico({ background: true });
    };
    const t = window.setInterval(tick, POLL_MS);
    return () => {
      pollGen.current = gen + 1;
      window.clearInterval(t);
    };
  }, [load, loadFunil, loadHistorico, modo]);

  useEffect(() => {
    setFatiaAtiva(null);
    setFatiaBatchConfirm(false);
    setFatiaBatchMsg(null);
  }, [mes, modo]);

  const porAcao = data?.disparos_dia?.por_acao || {};
  const rec = funil?.reconciliacao;
  const g = funil?.gerencial;
  const fatiasVisiveis = useMemo(() => {
    const all = funil?.fatias || [];
    return [...all].sort(
      (a, b) => b.count - a.count || a.grupo.localeCompare(b.grupo) || a.label.localeCompare(b.label),
    );
  }, [funil?.fatias]);
  const maxEstagio = useMemo(
    () => Math.max(1, ...(funil?.estagios || []).map((e) => e.valor)),
    [funil?.estagios],
  );
  const maxConv = useMemo(
    () => Math.max(1, ...(funil?.funil_conversao || []).map((e) => e.valor)),
    [funil?.funil_conversao],
  );
  const universoN = rec?.universo || 0;
  const escopoMes = data?.periodo?.escopo === 'mes';
  const cmp = historico?.comparativo?.vs_mes_anterior;
  const historicoMes = useMemo(
    () => historico?.serie?.find((p) => p.mes === mes) ?? null,
    [historico?.serie, mes],
  );
  const cmpMes = useMemo(() => {
    const serie = historico?.serie || [];
    const idx = serie.findIndex((p) => p.mes === mes);
    if (idx <= 0) return null;
    const atual = serie[idx];
    const ant = serie[idx - 1];
    return {
      mes_atual: atual.mes,
      mes_anterior: ant.mes,
      portados: atual.portados - ant.portados,
      quebras: atual.quebras - ant.quebras,
      bko: atual.bko - ant.bko,
      fechados: atual.fechados - ant.fechados,
      canceladas: atual.canceladas - ant.canceladas,
      taxa_portado_pct: Math.round((atual.taxa_portado_pct - ant.taxa_portado_pct) * 10) / 10,
      execucoes: atual.execucoes - ant.execucoes,
    };
  }, [historico?.serie, mes]);
  const cmpVisivel = modo === 'gerencial' ? cmpMes : cmp;

  const replicaHistorico = useMemo(
    () => reconciliaHistoricoFunil(g, historicoMes, rec?.universo),
    [g, historicoMes, rec?.universo],
  );

  const exclusivoOk = useMemo(
    () => validarFunilExclusivo(funil?.funil_exclusivo, universoN),
    [funil?.funil_exclusivo, universoN],
  );

  return (
    <AdminLayout
      title="Disparos"
      subtitle={
        modo === 'gerencial'
          ? `Cohorte ${mes} · histórico, conversão e estratificação`
          : 'Livro aberto · fila ao vivo · drill-down por fatia'
      }
    >
      {error && (
        <div
          className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={refreshAll}
          disabled={loading || funilLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading || funilLoading ? 'animate-spin' : ''} />
          Atualizar
        </button>

        <label className="flex items-center gap-2 text-xs text-gray-600">
          <span className="font-semibold uppercase tracking-wide text-gray-400">Mês</span>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value || mesAtualBrt())}
            className="input-field py-1.5 text-sm"
          />
        </label>

        <ChipBar
          ariaLabel="Mês de referência"
          active={mes}
          onChange={setMes}
          chips={chips.map((c) => ({ id: c, label: `${c.slice(5)}/${c.slice(2, 4)}` }))}
        />

        <TabBar
          tabs={[
            { id: 'operacional', label: 'Operacional', icon: Radio },
            { id: 'gerencial', label: 'Gerencial', icon: PieChart },
          ]}
          active={modo}
          onChange={(id) => setModo(id as 'operacional' | 'gerencial')}
          ariaLabel="Modo de visualização Disparos"
          size="sm"
        />

        <label className="flex items-center gap-2 text-xs text-gray-600">
          <Filter size={12} className="text-gray-400" />
          <select
            value={grupoFiltro}
            onChange={(e) => setGrupoFiltro(e.target.value)}
            className="input-field py-1.5 text-sm"
          >
            {GRUPOS_FILTRO.map((g) => (
              <option key={g.id || 'all'} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          Auto · 10 min · ou Atualizar
        </span>
        {lastAt && (
          <span className="text-xs text-gray-500">
            Atualizado {lastAt.toLocaleTimeString('pt-BR')}
            {funil?.periodo?.label ? ` · ${funil.periodo.label}` : ''}
            {data?.taxa_sucesso_hoje != null ? ` · sucesso fila ${data.taxa_sucesso_hoje}` : ''}
          </span>
        )}
        {rec && (
          <span
            className={`text-xs font-semibold ${
              rec.fecha ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            Reconciliação {rec.fecha ? 'OK' : rec.confianca === 'parcial' ? 'PARCIAL' : 'GAP'} ·{' '}
            {n(rec.universo)} = fatias {n(rec.soma_fatias)}
            {rec.soma_grupos != null ? ` = grupos ${n(rec.soma_grupos)}` : ''}
            {rec.orfaos > 0 ? ` · ${rec.orfaos} órfãos` : ''}
            {rec.confianca === 'parcial' ? ' · cap Supabase atingido' : ''}
          </span>
        )}
      </div>

      {modo === 'gerencial' && (
        <GerencialP0Strip
          mes={mes}
          g={g}
          rec={rec}
          funil={funil ?? undefined}
          cmpMes={cmpMes}
          historicoMes={historicoMes}
          onOpenFatia={openFatiaById}
        />
      )}

      {/* Histórico — só gerencial */}
      {modo === 'gerencial' && (
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <TrendingUp size={16} className="text-slate-600" />
              Visão histórica · 3 meses
            </p>
            <p className="text-xs text-gray-500">
              Portados, quebras, BKO e taxa de fechamento. Clique no mês no gráfico ou nos chips
              acima para detalhar o funil.
            </p>
          </div>
          {cmpVisivel && (
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold tabular-nums">
              <span className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-emerald-800">
                Portados {fmtDelta(cmpVisivel.portados)}
              </span>
              <span className="rounded-md border border-red-100 bg-red-50 px-2 py-1 text-red-800">
                Quebras {fmtDelta(cmpVisivel.quebras)}
              </span>
              <span className="rounded-md border border-amber-100 bg-amber-50 px-2 py-1 text-amber-900">
                BKO {fmtDelta(cmpVisivel.bko)}
              </span>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                Taxa port. {fmtDelta(cmpVisivel.taxa_portado_pct, ' pp')}
              </span>
              {cmpMes && (
                <span className="rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 text-indigo-800">
                  Fechados {fmtDelta(cmpMes.fechados)}
                </span>
              )}
            </div>
          )}
        </div>
        {modo === 'gerencial' && replicaHistorico && (
          <div
            className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
              replicaHistorico.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-950'
            }`}
          >
            <p className="font-semibold">
              {replicaHistorico.ok ? '✓ Histórico replica funil' : '⚠ Histórico vs funil — divergência'}
              {historicoMes?.fonte ? ` · fonte ${historicoMes.fonte}` : ''}
            </p>
            <p className="mt-0.5 opacity-90">{replicaHistorico.nota}</p>
            {(historicoMes?.fonte === 'count' || historicoMes?.universo == null) && (
              <p className="mt-1 text-[10px] font-medium text-amber-800">
                Histórico em modo count — aplique a migration 027 (RPC portabilidade_cohort_stats) no
                Supabase portabilidade para reconciliar universo e taxa TIM.
              </p>
            )}
            {!replicaHistorico.ok && (
              <ul className="mt-1 tabular-nums">
                {replicaHistorico.gaps.slice(0, 5).map((x) => (
                  <li key={x.campo}>
                    {x.campo}: funil {n(x.funil)} · histórico {n(x.historico)} (Δ {x.delta > 0 ? '+' : ''}
                    {x.delta})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {historico?.error && <p className="mb-2 text-sm text-red-600">{historico.error}</p>}
        {historicoLoading && !historico?.serie ? (
          <div className="h-52 animate-pulse rounded-lg bg-slate-100" />
        ) : historico?.serie && historico.serie.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-56">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Volume · Portado / Falha / Cancelada / Quebra
              </p>
              <ResponsiveContainer width="100%" height="90%">
                <ComposedChart
                  data={historico.serie}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  onClick={(state) => {
                    const m = (state as { activeLabel?: string } | null)?.activeLabel;
                    if (m && typeof m === 'string') {
                      setMes(m);
                      setModo('gerencial');
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="portados" name="Portado" fill="#059669" radius={[3, 3, 0, 0]} cursor="pointer" />
                  <Bar
                    dataKey="falha_parcial"
                    name="Falha parcial"
                    fill="#e11d48"
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                  />
                  <Bar dataKey="canceladas" name="Cancelada" fill="#64748b" radius={[3, 3, 0, 0]} cursor="pointer" />
                  <Line
                    type="monotone"
                    dataKey="quebras"
                    name="Quebra log."
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="h-56">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Taxas % · Portado/fechados · Sucesso fila · Execuções
              </p>
              <ResponsiveContainer width="100%" height="90%">
                <ComposedChart
                  data={historico.serie}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  onClick={(state) => {
                    const m = (state as { activeLabel?: string } | null)?.activeLabel;
                    if (m && typeof m === 'string') {
                      setMes(m);
                      setModo('gerencial');
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis
                    yAxisId="pct"
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                  />
                  <YAxis
                    yAxisId="vol"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar
                    yAxisId="vol"
                    dataKey="execucoes"
                    name="Exec. fila"
                    fill="#cbd5e1"
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                  />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="taxa_portado_pct"
                    name="Taxa Portado %"
                    stroke="#059669"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="taxa_sucesso_fila_pct"
                    name="Sucesso fila %"
                    stroke="#0f766e"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Sem série histórica.</p>
        )}
      </section>
      )}

      {/* Centro de Comando — só gerencial */}
      {modo === 'gerencial' && (
        <GerencialCommandCenter
          mes={mes}
          g={g}
          rec={rec}
          funil={funil ?? undefined}
          historico={historico}
          historicoMes={historicoMes}
          cmpMes={cmpMes}
          disparos={data}
          onOpenFatia={openFatiaById}
          onRefresh={() => {
            void load({ background: true });
            void loadFunil({ background: true });
            void loadHistorico({ background: true });
          }}
        />
      )}

      {/* Painel analítico — só gerencial */}
      {modo === 'gerencial' && (
        <GerencialAnalytics
          mes={mes}
          g={g}
          rec={rec}
          historicoMes={historicoMes}
          cmpMes={cmpMes}
          estagios={funil?.estagios}
          fatias={funil?.fatias}
          funilConversao={funil?.funil_conversao}
          motivos={funil?.motivos}
          cancelamentos={funil?.cancelamentos}
          tickets={funil?.tickets}
          ordens={funil?.ordens}
          logistica={funil?.logistica}
        />
      )}

      {/* FUNIL */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <Layers size={16} className="text-slate-600" />
              {modo === 'gerencial' ? 'Funil gerencial' : 'Funil operacional'}
            </p>
            <p className="text-xs text-gray-500">
              {modo === 'gerencial'
                ? `Cohorte do mês ${mes} (enviada ou retorno no período). Cada proposta em 1 fatia.`
                : `Livro aberto + fechamentos de ${mes}. Clique na fatia para listar todas.`}
            </p>
          </div>
          {rec && (
            <div className="flex flex-wrap gap-3 text-xs tabular-nums">
              <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-800">
                Universo {n(rec.universo)}
              </span>
              <span className="rounded-md bg-sky-50 px-2 py-1 font-semibold text-sky-800">
                Em voo {n(rec.em_voo)}
              </span>
              <span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">
                Fechados {n(rec.fechados)}
              </span>
            </div>
          )}
        </div>

        {g && (
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => setGrupoFiltro('fechamento')}
              className={`rounded-lg border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-left transition hover:ring-1 hover:ring-emerald-500 ${
                grupoFiltro === 'fechamento' ? 'ring-1 ring-emerald-700' : ''
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                Taxa Portado + Falha
              </p>
              <p className="text-xl font-black tabular-nums text-emerald-900">
                {g.taxa_sucesso_tim_pct ?? 0}%
              </p>
              <p className="text-[11px] text-emerald-800/80">
                {n(g.sucesso_tim ?? (g.portados ?? 0) + (g.falha_parcial ?? 0))} casos · sucesso TIM
              </p>
            </button>
            <button
              type="button"
              onClick={() =>
                openFatiaById('sucesso_portado', {
                  label: 'Sucesso · Portado',
                  grupo: 'fechamento',
                  cor: 'emerald',
                  descricao: 'ticket_status = Portado',
                  count: g.portados ?? 0,
                  pct: g.taxa_portado_pct ?? 0,
                })
              }
              className={`rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-left transition hover:ring-1 hover:ring-emerald-400 ${
                fatiaAtiva?.id === 'sucesso_portado' ? 'ring-1 ring-emerald-700' : ''
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                Portado
              </p>
              <p className="text-xl font-black tabular-nums text-emerald-900">
                {g.taxa_portado_pct ?? 0}%
              </p>
              <p className="text-[11px] text-emerald-800/80">{n(g.portados)} casos · clique</p>
            </button>
            <button
              type="button"
              onClick={() =>
                openFatiaById('terminal_falha_parcial', {
                  label: 'Terminal · Falha Parcial',
                  grupo: 'fechamento',
                  cor: 'rose',
                  descricao: 'ticket_status = Falha Parcial',
                  count: g.falha_parcial ?? 0,
                  pct: g.taxa_falha_parcial_pct ?? 0,
                })
              }
              className={`rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 text-left transition hover:ring-1 hover:ring-rose-400 ${
                fatiaAtiva?.id === 'terminal_falha_parcial' ? 'ring-1 ring-rose-700' : ''
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                Falha parcial
              </p>
              <p className="text-xl font-black tabular-nums text-rose-900">
                {g.taxa_falha_parcial_pct ?? 0}%
              </p>
              <p className="text-[11px] text-rose-800/80">{n(g.falha_parcial)} casos · clique</p>
            </button>
            <button
              type="button"
              onClick={() => setGrupoFiltro('fechamento')}
              className={`rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-left transition hover:ring-1 hover:ring-slate-400 ${
                grupoFiltro === 'fechamento' ? 'ring-1 ring-slate-700' : ''
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Fechados
              </p>
              <p className="text-xl font-black tabular-nums text-slate-900">
                {g.taxa_fechamento_pct ?? 0}%
              </p>
              <p className="text-[11px] text-slate-600">{n(g.fechados)} terminais</p>
            </button>
            <button
              type="button"
              onClick={() =>
                openFatiaById('terminal_cancelada', {
                  label: 'Terminal · Cancelada',
                  grupo: 'fechamento',
                  cor: 'slate',
                  descricao: 'ticket_status = Cancelada',
                  count: g.canceladas ?? 0,
                  pct: g.taxa_cancelamento_pct ?? 0,
                })
              }
              className={`rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:ring-1 hover:ring-slate-400 ${
                fatiaAtiva?.id === 'terminal_cancelada' ? 'ring-1 ring-slate-700' : ''
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Canceladas
              </p>
              <p className="text-xl font-black tabular-nums text-slate-900">
                {g.taxa_cancelamento_pct ?? 0}%
              </p>
              <p className="text-[11px] text-slate-600">{n(g.canceladas)} casos · clique</p>
            </button>
            <button
              type="button"
              onClick={() =>
                openFatiaById('quebra_logistica', {
                  label: 'Quebra logística',
                  grupo: 'logistica',
                  cor: 'red',
                  descricao: 'Toutbox cancelada/expirada sem ICCID',
                  count: g.quebras ?? 0,
                  pct: g.taxa_quebra_pct ?? 0,
                })
              }
              className={`rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 text-left transition hover:ring-1 hover:ring-red-400 ${
                fatiaAtiva?.id === 'quebra_logistica' ? 'ring-1 ring-red-700' : ''
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-700">
                Quebra logística
              </p>
              <p className="text-xl font-black tabular-nums text-red-900">
                {g.taxa_quebra_pct ?? 0}%
              </p>
              <p className="text-[11px] text-red-800/80">{n(g.quebras)} casos · clique</p>
            </button>
            <button
              type="button"
              onClick={() =>
                openFatiaById('bko', {
                  label: 'BKO / intervenção',
                  grupo: 'fila',
                  cor: 'amber',
                  descricao: 'Fila em status bko',
                  count: g.bko ?? 0,
                  pct: 0,
                })
              }
              className={`rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-left transition hover:ring-1 hover:ring-sky-400 ${
                fatiaAtiva?.id === 'bko' ? 'ring-1 ring-sky-700' : ''
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                Ainda em voo
              </p>
              <p className="text-xl font-black tabular-nums text-sky-900">
                {g.taxa_em_voo_pct ?? 0}%
              </p>
              <p className="text-[11px] text-sky-800/80">BKO {n(g.bko)} · clique</p>
            </button>
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                Sucesso TIM / fechados
              </p>
              <p className="text-xl font-black tabular-nums text-indigo-900">
                {g.taxa_sucesso_tim_sobre_fechados_pct ?? 0}%
              </p>
              <p className="text-[11px] text-indigo-800/80">P+F sobre quem fechou</p>
            </div>
          </div>
        )}

        {funil?.error && (
          <p className="mb-3 text-sm text-red-600">{funil.error}</p>
        )}

        {funilLoading && !funil?.estagios ? (
          <div className="h-28 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Onde está cada proposta · grupos exclusivos (soma = universo)
            </p>
            <p className="mb-3 text-[11px] text-gray-500">
              Logística {n(funil?.estagios?.find((e) => e.id === 'logistica')?.valor)} não é
              “buraco”: o restante está em Fechamento / Fila / Ticket / Ordem / Pré-OS. Reconciliação:{' '}
              {n(universoN)} = soma grupos {n(rec?.soma_grupos ?? rec?.soma_fatias)}.
            </p>

            {/* Barra 100% exclusiva */}
            {universoN > 0 && (
              <div className="mb-3 flex h-5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                {(funil?.estagios || [])
                  .filter((e) => e.valor > 0)
                  .map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      title={`${e.label}: ${e.valor}`}
                      onClick={() => {
                        if (e.id === 'logistica') setGrupoFiltro('logistica');
                        else if (e.id === 'fila') setGrupoFiltro('fila');
                        else if (e.id === 'ticket') setGrupoFiltro('ticket');
                        else if (e.id === 'ordem') setGrupoFiltro('ordem');
                        else if (e.id === 'fechamento') setGrupoFiltro('fechamento');
                        else if (e.id === 'pre_os') setGrupoFiltro('portabilidade');
                        else setGrupoFiltro('');
                      }}
                      className={`h-full transition hover:opacity-90 ${
                        e.id === 'fechamento'
                          ? 'bg-emerald-600'
                          : e.id === 'logistica'
                            ? 'bg-sky-500'
                            : e.id === 'fila'
                              ? 'bg-amber-500'
                              : e.id === 'ticket'
                                ? 'bg-indigo-500'
                                : e.id === 'ordem'
                                  ? 'bg-orange-500'
                                  : e.id === 'orfao'
                                    ? 'bg-red-600'
                                    : 'bg-slate-500'
                      }`}
                      style={{ width: `${Math.max((e.valor / universoN) * 100, e.valor > 0 ? 1.5 : 0)}%` }}
                    />
                  ))}
              </div>
            )}

            <div className="mb-5 space-y-2">
              {(funil?.estagios || []).map((e) => {
                const pct = Math.max(3, Math.round((e.valor / maxEstagio) * 100));
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      if (e.id === 'logistica') setGrupoFiltro('logistica');
                      else if (e.id === 'fila') setGrupoFiltro('fila');
                      else if (e.id === 'ticket') setGrupoFiltro('ticket');
                      else if (e.id === 'ordem') setGrupoFiltro('ordem');
                      else if (e.id === 'fechamento') setGrupoFiltro('fechamento');
                      else if (e.id === 'pre_os') setGrupoFiltro('portabilidade');
                      else setGrupoFiltro('');
                    }}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span className="w-44 shrink-0 text-[11px] font-medium text-gray-600 sm:w-56">
                      {e.label}
                    </span>
                    <div className="h-7 flex-1 overflow-hidden rounded-md bg-slate-100">
                      <div
                        className="flex h-full items-center rounded-md bg-slate-700 px-2 text-[11px] font-bold text-white tabular-nums"
                        style={{ width: `${pct}%` }}
                      >
                        {n(e.valor)}
                      </div>
                    </div>
                    <span className="w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums text-gray-500">
                      {e.pct ?? 0}%
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Funil conversão (progressivo) */}
            {(funil?.funil_conversao || []).length > 0 && (
              <div className="mb-5 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Funil de conversão (progressivo · subconjuntos)
                </p>
                <p className="mb-2 text-[11px] text-gray-500">
                  {funil?.funil_pontes?.nota ||
                    'Cada etapa ⊆ anterior. Portado já está dentro de “com ticket” — não some ticket + portado.'}
                </p>
                <div className="space-y-1.5">
                  {(funil?.funil_conversao || []).map((e, idx) => {
                    const pct = Math.max(4, Math.round((e.valor / maxConv) * 100));
                    const barCor =
                      e.id === 'portado' || e.id === 'sucesso_tim'
                        ? 'bg-emerald-600'
                        : e.id === 'fechados'
                          ? 'bg-teal-600'
                          : 'bg-slate-600';
                    return (
                      <div key={e.id} className="flex items-center gap-3">
                        <span className="w-44 shrink-0 text-[11px] text-gray-600">
                          {idx + 1}. {e.label}
                        </span>
                        <div className="h-6 flex-1 overflow-hidden rounded-md bg-white ring-1 ring-slate-100">
                          <div
                            className={`flex h-full items-center rounded-md px-2 text-[11px] font-bold text-white tabular-nums ${barCor}`}
                            style={{ width: `${pct}%` }}
                          >
                            {n(e.valor)}
                          </div>
                        </div>
                        <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-gray-500">
                          {e.pct ?? 0}%
                        </span>
                      </div>
                    );
                  })}
                </div>
                {funil?.funil_pontes && (
                  <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-3">
                    <div className="rounded-md bg-white px-2 py-1.5 text-[11px]">
                      <span className="font-semibold text-gray-700">Sem OS 1-*:</span>{' '}
                      <span className="tabular-nums text-gray-900">{n(funil.funil_pontes.sem_os)}</span>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1.5 text-[11px]">
                      <span className="font-semibold text-gray-700">OS sem ticket:</span>{' '}
                      <span className="tabular-nums text-gray-900">
                        {n(funil.funil_pontes.os_sem_ticket)}
                      </span>
                    </div>
                    <div className="rounded-md bg-white px-2 py-1.5 text-[11px]">
                      <span className="font-semibold text-gray-700">Ticket em aberto:</span>{' '}
                      <span className="tabular-nums text-gray-900">
                        {n(funil.funil_pontes.ticket_nao_fechado)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fatias exclusivas — soma = universo */}
            {(funil?.funil_exclusivo || []).length > 0 && (
              <div className="mb-5 rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                  Resultado exclusivo (soma = universo)
                </p>
                <p className="mb-2 text-[11px] text-emerald-900/70">
                  Portado + Falha + Cancelada + Em voo = {n(universoN)}.
                  {!exclusivoOk.ok && (
                    <span className="ml-1 font-semibold text-amber-800">
                      Gap {n(exclusivoOk.delta)} (soma {n(exclusivoOk.soma)}).
                    </span>
                  )}
                  {exclusivoOk.ok && (
                    <span className="ml-1 font-semibold text-emerald-700">Reconciliado.</span>
                  )}
                </p>
                <div className="mb-2 flex h-5 overflow-hidden rounded-full bg-white ring-1 ring-emerald-100">
                  {(funil?.funil_exclusivo || [])
                    .filter((e) => e.valor > 0)
                    .map((e) => (
                      <div
                        key={e.id}
                        title={`${e.label}: ${e.valor}`}
                        className={`h-full ${
                          e.id === 'portado'
                            ? 'bg-emerald-600'
                            : e.id === 'falha_parcial'
                              ? 'bg-rose-500'
                              : e.id === 'cancelada'
                                ? 'bg-slate-500'
                                : 'bg-sky-500'
                        }`}
                        style={{
                          width: `${Math.max((e.valor / universoN) * 100, e.valor > 0 ? 1.5 : 0)}%`,
                        }}
                      />
                    ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {(funil?.funil_exclusivo || []).map((e) => (
                    <div key={e.id} className="rounded-md bg-white px-2 py-1.5 text-[11px]">
                      <span className="font-semibold text-gray-700">{e.label}:</span>{' '}
                      <span className="tabular-nums text-gray-900">
                        {n(e.valor)} ({e.pct ?? 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Logística detalhada */}
            {funil?.logistica_painel && funil.logistica_painel.total > 0 && (
              <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-gray-800">Logística Toutbox — detalhe</p>
                    <p className="text-[11px] text-gray-500">
                      {funil.logistica_painel.nota ||
                        'Só as propostas exclusivas em logística. Clique para listar.'}
                    </p>
                  </div>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold tabular-nums text-slate-700">
                    {n(funil.logistica_painel.total)} de {n(universoN)} (
                    {universoN
                      ? Math.round((funil.logistica_painel.total / universoN) * 1000) / 10
                      : 0}
                    %)
                  </span>
                </div>
                <div className="mb-3 flex h-4 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                  {funil.logistica_painel.segmentos
                    .filter((s) => s.count > 0)
                    .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        title={`${s.label}: ${s.count}`}
                        onClick={() => {
                          const f = (funil.fatias || []).find((x) => x.id === s.fatia);
                          if (f) openFatia(f);
                          else
                            openFatia({
                              id: s.fatia,
                              label: s.label,
                              grupo: 'logistica',
                              cor: s.cor,
                              descricao: s.hint,
                              count: s.count,
                              pct: s.pct,
                            });
                        }}
                        className={`h-full ${COR_BAR[s.cor] || 'bg-slate-500'} transition hover:opacity-90`}
                        style={{
                          width: `${Math.max(s.pct, s.count > 0 ? 2 : 0)}%`,
                        }}
                      />
                    ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {funil.logistica_painel.segmentos.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        const f = (funil.fatias || []).find((x) => x.id === s.fatia);
                        if (f) openFatia(f);
                        else
                          openFatia({
                            id: s.fatia,
                            label: s.label,
                            grupo: 'logistica',
                            cor: s.cor,
                            descricao: s.hint,
                            count: s.count,
                            pct: s.pct,
                          });
                      }}
                      className={`rounded-lg border px-2.5 py-2 text-left transition hover:ring-1 hover:ring-slate-400 ${
                        COR_SOFT[s.cor] || 'border-slate-200 bg-white text-gray-900'
                      } ${fatiaAtiva?.id === s.fatia ? 'ring-1 ring-slate-800' : ''}`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                        {s.label}
                      </p>
                      <p className="text-lg font-black tabular-nums">{n(s.count)}</p>
                      <p className="text-[10px] opacity-70">{s.pct}% · {s.hint}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Fatias exclusivas (clique · detalhamento)
            </p>
            {grupoFiltro && (
              <p className="mb-2 text-[11px] text-indigo-700">
                Destacando grupo <strong>{grupoFiltro}</strong> — todas as fatias permanecem visíveis.
                <button
                  type="button"
                  onClick={() => setGrupoFiltro('')}
                  className="ml-2 font-semibold underline hover:text-indigo-900"
                >
                  Ver todas
                </button>
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {fatiasVisiveis.map((f) => {
                const destacada = !grupoFiltro || f.grupo === grupoFiltro;
                return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => openFatia(f)}
                  disabled={f.count === 0}
                  className={`group rounded-lg border px-3 py-2.5 text-left transition hover:border-slate-400 hover:bg-slate-50 ${
                    fatiaAtiva?.id === f.id
                      ? 'border-slate-800 bg-slate-50 ring-1 ring-slate-800'
                      : destacada
                        ? grupoFiltro
                          ? 'border-indigo-200 bg-indigo-50/40 ring-1 ring-indigo-300'
                          : 'border-slate-200 bg-white'
                        : 'border-slate-100 bg-slate-50/60 opacity-55'
                  } ${f.count === 0 ? 'cursor-default opacity-40 hover:bg-transparent' : ''}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      {f.grupo}
                    </span>
                    <ChevronRight
                      size={12}
                      className="text-gray-300 transition group-hover:text-slate-600"
                    />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{f.label}</p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-xl font-black tabular-nums text-gray-900">
                      {n(f.count)}
                    </span>
                    <span className="text-[11px] text-gray-400">{f.pct}%</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full ${COR_BAR[f.cor] || 'bg-slate-500'}`}
                      style={{
                        width: `${f.count > 0 ? Math.min(100, Math.max(2, f.pct)) : 0}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[10px] text-gray-400">{f.descricao}</p>
                </button>
              );
              })}
            </div>
          </>
        )}
      </section>

      {/* Painel detalhe fatia */}
      {fatiaAtiva && (
        <section className="mb-6 overflow-hidden rounded-xl border border-slate-800 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                {fatiaAtiva.grupo} · detalhamento
              </p>
              <p className="text-sm font-bold">
                {fatiaAtiva.label}{' '}
                <span className="font-normal text-slate-300">
                  · {n(fatiaTotal)} proposta{fatiaTotal === 1 ? '' : 's'}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void analisarFatia()}
                disabled={fatiaInsightLoading || fatiaLoading}
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                <Sparkles size={14} className={fatiaInsightLoading ? 'animate-pulse' : ''} />
                {fatiaInsightLoading ? 'Analisando…' : 'Analisar IA'}
              </button>
              <button
                type="button"
                onClick={() => setFatiaAtiva(null)}
                className="rounded-md p-1.5 hover:bg-slate-700"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2">
            {fatiaError && (
              <p className="w-full text-xs text-red-600" role="alert">
                {fatiaError}
              </p>
            )}
            {fatiaBatchMsg && (
              <p className="w-full text-xs font-semibold text-emerald-800" role="status">
                {fatiaBatchMsg}
              </p>
            )}
            <div className="relative min-w-[200px] flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={fatiaQ}
                onChange={(e) => setFatiaQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && fatiaAtiva) {
                    void loadFatia(fatiaAtiva, 0, fatiaQ);
                  }
                }}
                placeholder="Filtrar proposta / OS / ticket / motivo"
                className="input-field w-full py-1.5 pl-8 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => fatiaAtiva && void loadFatia(fatiaAtiva, 0, fatiaQ)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white"
            >
              <Filter size={12} /> Filtrar
            </button>
            <button
              type="button"
              disabled={fatiaExporting || fatiaLoading || fatiaTotal === 0}
              onClick={() => void exportarFatiaExcel()}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"
            >
              <Download size={12} />
              {fatiaExporting ? 'Exportando…' : fatiaExportOk ? 'Excel gerado!' : 'Exportar Excel'}
            </button>
            {modo === 'gerencial' && fatiaItems.length > 0 && (
              <>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={fatiaBatchConfirm}
                    onChange={(e) => setFatiaBatchConfirm(e.target.checked)}
                    className="rounded"
                  />
                  Confirmo lote inteligente
                </label>
                <button
                  type="button"
                  disabled={
                    fatiaBatchLoading || fatiaLoading || !fatiaBatchConfirm || !lotePreview
                  }
                  onClick={() => void enfileirarFatiaLote()}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-40"
                  title={`Página atual (máx. 25 propostas) · ${lotePreview || 'sem ações'}`}
                >
                  <Rocket size={12} />
                  {fatiaBatchLoading
                    ? 'Enfileirando…'
                    : lotePreview
                      ? `Lote inteligente (${lotePreview})`
                      : 'Lote inteligente'}
                </button>
                {fatiaTotal > 80 && (
                  <span className="text-[10px] text-amber-800">
                    Lote = só esta página · total da fatia {n(fatiaTotal)}
                  </span>
                )}
              </>
            )}
            <button
              type="button"
              disabled={fatiaOffset <= 0 || fatiaLoading}
              onClick={() =>
                fatiaAtiva && void loadFatia(fatiaAtiva, Math.max(0, fatiaOffset - 80), fatiaQ)
              }
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:opacity-40"
            >
              ← Ant
            </button>
            <button
              type="button"
              disabled={fatiaOffset + 80 >= fatiaTotal || fatiaLoading}
              onClick={() => fatiaAtiva && void loadFatia(fatiaAtiva, fatiaOffset + 80, fatiaQ)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:opacity-40"
            >
              Próx →
            </button>
            <span className="text-[11px] text-gray-400">
              {fatiaOffset + 1}–{Math.min(fatiaOffset + fatiaItems.length, fatiaTotal)} de{' '}
              {n(fatiaTotal)}
            </span>
          </div>

          {fatiaEstrat && (
            <div className="grid gap-3 border-b border-gray-100 bg-slate-50/80 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
              <FatiaStratBlock title="Motivo recusar" rows={fatiaEstrat.motivo_recusar} />
              <FatiaStratBlock title="Cancelamento" rows={fatiaEstrat.cancelamento} />
              <FatiaStratBlock title="Order status" rows={fatiaEstrat.order_status} />
              <FatiaStratBlock title="Ticket status" rows={fatiaEstrat.ticket_status} />
              <FatiaStratBlock title="Logística" rows={fatiaEstrat.logistica} />
            </div>
          )}

          {fatiaInsight && (
            <div className="border-b border-violet-100 bg-violet-50/50 px-4 py-3">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                <Sparkles size={12} /> Insight IA
              </p>
              <div className="whitespace-pre-wrap text-xs text-violet-950">{fatiaInsight}</div>
            </div>
          )}

          <div className="max-h-96 overflow-auto">
            {fatiaLoading ? (
              <p className="p-4 text-sm text-gray-500">Carregando…</p>
            ) : fatiaItems.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">Nenhuma proposta nesta fatia.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Proposta</th>
                    <th className="px-3 py-2">OS</th>
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Ticket</th>
                    <th className="px-3 py-2">Motivo recusar</th>
                    <th className="px-3 py-2">Cancelamento</th>
                    <th className="px-3 py-2">ICCID</th>
                    <th className="px-3 py-2">Logística</th>
                    <th className="px-3 py-2">Fila</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {fatiaItems.map((it) => (
                    <tr key={it.proposta} className="border-t border-gray-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-gray-900">
                        {it.proposta}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{it.order_number || '—'}</td>
                      <td className="px-3 py-2 text-xs">{it.order_status || '—'}</td>
                      <td className="px-3 py-2 text-xs">{it.ticket_status || '—'}</td>
                      <td className="max-w-[220px] px-3 py-2 text-xs text-amber-900" title={it.motivo_recusar || ''}>
                        <span className="line-clamp-2">{it.motivo_recusar || '—'}</span>
                      </td>
                      <td className="max-w-[180px] px-3 py-2 text-xs text-slate-700" title={it.cancelamento || ''}>
                        <span className="line-clamp-2">{it.cancelamento || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">{it.tem_iccid ? 'sim' : 'não'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{it.logistica || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{it.fila || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void loadJourney(it.proposta)}
                          className="text-xs font-semibold text-teal-700 hover:underline"
                        >
                          Trace
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* Estratificações — operacional: resumo; gerencial: já no painel analítico */}
      {modo === 'operacional' && (
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <StratCard title="Ticket status" rows={funil?.tickets} />
        <StratCard title="Order status" rows={funil?.ordens} />
        <StratCard title="Logística Toutbox" rows={funil?.logistica} />
      </div>
      )}

      {/* Journey — operacional */}
      {modo === 'operacional' && (
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-sm font-bold text-gray-800">Journey Trace</p>
        <p className="mb-3 text-xs text-gray-500">
          Timeline: CE + logística Toutbox + fila + retornos (matrix → disparo → resultado).
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={propostaQ}
            onChange={(e) => setPropostaQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void loadJourney()}
            placeholder="3F-260044639"
            className="input-field min-w-[220px] flex-1 text-sm"
          />
          <button
            type="button"
            onClick={() => void loadJourney()}
            disabled={journeyLoading || !propostaQ.trim()}
            className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-50"
          >
            {journeyLoading ? 'Buscando…' : 'Rastrear'}
          </button>
        </div>
        {journey?.error && <p className="mt-3 text-sm text-red-600">{journey.error}</p>}
        {journey?.resumo && (
          <div className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-2 lg:grid-cols-3">
            <span>OS: {String(journey.resumo.order_number || '—')}</span>
            <span>Order: {String(journey.resumo.order_status || '—')}</span>
            <span>Ticket: {String(journey.resumo.ticket_status || '—')}</span>
            <span>ICCID: {journey.resumo.tem_iccid ? 'sim' : 'não'}</span>
            <span>
              Logística: {String(journey.resumo.logistica_status || '—')} /{' '}
              {String(journey.resumo.toutbox || '—')}
            </span>
            <span>
              Fila: {String(journey.resumo.acoes_fila || 0)} · pend{' '}
              {String(journey.resumo.pendentes || 0)} · BKO {String(journey.resumo.bko || 0)}
            </span>
          </div>
        )}
        {journey?.timeline && journey.timeline.length > 0 && (
          <ol className="mt-4 max-h-72 space-y-2 overflow-y-auto border-t border-gray-100 pt-3">
            {journey.timeline.map((ev, i) => (
              <li key={`${ev.ts}-${i}`} className="text-xs">
                <span className="font-mono text-gray-400">{String(ev.ts).slice(0, 19)}</span>
                <span className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-600">
                  {ev.fonte}
                </span>
                <span className="font-semibold text-gray-800">{ev.titulo}</span>
                {ev.detalhe ? <span className="text-gray-500"> — {ev.detalhe}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
      )}

      {modo === 'operacional' && data?.disparos_dia?.nota && (
        <p className="mb-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          {data.disparos_dia.nota}
        </p>
      )}

      {modo === 'operacional' && loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-40 skeleton" />
          ))}
        </div>
      ) : modo === 'operacional' ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniKpi
              icon={CheckCircle2}
              label={escopoMes ? `Execuções ${mes}` : 'Execuções hoje'}
              value={n(data?.execucoes_hoje ?? undefined)}
            />
            <MiniKpi icon={Timer} label="Pendentes totais" value={n(data?.totais?.pendentes)} />
            <MiniKpi icon={CalendarClock} label="Pend. < 6h" value={n(data?.pendentes_por_idade?.ultimas_6h)} />
            <MiniKpi icon={XCircle} label="Pend. > 24h" value={n(data?.pendentes_por_idade?.mais_24h)} />
          </div>

          {escopoMes && data?.totais_mes && (
            <p className="mb-4 text-[11px] text-gray-500">
              Fila no mês ({mes}): {n(data.totais_mes.execucoes)} exec · {n(data.totais_mes.concluidas)}{' '}
              concl. · {n(data.totais_mes.bko)} BKO · {n(data.totais_mes.falha)} falha ·{' '}
              {n(data.totais_mes.enfileiradas)} enfileir. · Pendentes ao vivo:{' '}
              {n(data.totais_ao_vivo?.pendentes ?? data.totais?.pendentes)}
            </p>
          )}

          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-800">
            <Rocket size={16} />
            Por ação (fila TIM · {escopoMes ? mes : 'hoje BRT'})
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2.5">Ação</th>
                  <th className="px-3 py-2.5 text-right">Concluídas</th>
                  <th className="px-3 py-2.5 text-right">Enfileiradas</th>
                  <th className="px-3 py-2.5 text-right">Falha</th>
                  <th className="px-3 py-2.5 text-right">BKO</th>
                  <th className="px-3 py-2.5 text-right">Pend. vencidos</th>
                  <th className="px-3 py-2.5 text-right">Pend. agendados</th>
                  <th className="px-3 py-2.5 text-right">Janela 08h hoje</th>
                  <th className="px-3 py-2.5 text-right">Janela 08h amanhã</th>
                </tr>
              </thead>
              <tbody>
                {ACOES.map(({ id, label }) => {
                  const row = porAcao[id];
                  const highlight08 =
                    id === 'reschedule' &&
                    ((row?.pendentes_janela_08h_amanha || 0) > 0 ||
                      (row?.pendentes_janela_08h_hoje || 0) > 0);
                  return (
                    <tr
                      key={id}
                      className={`border-t border-gray-100 ${highlight08 ? 'bg-sky-50/60' : ''}`}
                    >
                      <td className="px-3 py-2.5 font-semibold text-gray-800">{label}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums text-emerald-700">
                        {n(row?.concluidas_hoje)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{n(row?.enfileiradas_hoje)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-600">
                        {n(row?.falha_hoje)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{n(row?.bko_hoje)}</td>
                      <td
                        className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                          (row?.pendentes_vencidos || 0) > 0 ? 'text-amber-700' : ''
                        }`}
                      >
                        {n(row?.pendentes_vencidos)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {n(row?.pendentes_agendados)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {n(row?.pendentes_janela_08h_hoje)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-sky-800">
                        {n(row?.pendentes_janela_08h_amanha)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] text-gray-400">
            Fila ao vivo · auto a cada 10 min ou botão Atualizar. Use Gerencial para cohort do mês
            e análises históricas.
          </p>
        </>
      ) : null}
    </AdminLayout>
  );
}
