import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain, Radar, FlaskConical, Target, Bot, BookOpen, Radio, RefreshCw, Send,
  FileText, AlertTriangle, TrendingUp, Gauge,
} from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { PageAlert } from '../components/ui/PageAlert';
import { TabBar } from '../components/ui/TabBar';
import { KpiCard } from '../components/ui/KpiCard';
import { useAuthStore } from '../store/authStore';
import { useOperacionalEvents } from '../hooks/useOperacionalEvents';
import { fetchAtestadosStats } from '../lib/atestadosService';
import {
  askCopilot,
  createCoaching,
  fetchAnalyticsOverview,
  fetchRiskRadar,
  listCoaching,
  patchCoaching,
  runWhatIf,
  searchKnowledge,
  triagePortabilidade,
  type AnalyticsOverview,
  type CoachingAction,
  type KnowledgeChunk,
  type RiskRadarResult,
  type TriageResult,
  type WhatIfResult,
} from '../lib/operacionalIntelService';

type Tab = 'copiloto' | 'radar' | 'simulador' | 'coaching' | 'agente' | 'conhecimento';

const TABS = [
  { id: 'copiloto' as const, label: 'Copiloto', icon: Brain },
  { id: 'radar' as const, label: 'Risk Radar', icon: Radar },
  { id: 'simulador' as const, label: 'What-if', icon: FlaskConical },
  { id: 'coaching' as const, label: 'Coaching', icon: Target },
  { id: 'agente' as const, label: 'Agente Port.', icon: Bot },
  { id: 'conhecimento' as const, label: 'RAG 3F', icon: BookOpen },
];

const RISK_LEVEL_CLS: Record<string, string> = {
  low: 'text-emerald-600 bg-emerald-50',
  medium: 'text-amber-700 bg-amber-50',
  high: 'text-orange-700 bg-orange-50',
  critical: 'text-red-700 bg-red-50',
};

export function InteligenciaPage() {
  const { userRole } = useAuthStore();
  const isAdmin = userRole === 'admin';
  const [tab, setTab] = useState<Tab>('radar');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().slice(0, 10);
  const [de, setDe] = useState(today);
  const [ate, setAte] = useState(today);
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [risk, setRisk] = useState<RiskRadarResult | null>(null);

  const [cpcPct, setCpcPct] = useState('62');
  const [metaCpc, setMetaCpc] = useState('65');
  const [portP0, setPortP0] = useState('0');
  const [portFila, setPortFila] = useState('0');
  const [advPend, setAdvPend] = useState('0');
  const [advCrit, setAdvCrit] = useState('0');

  const [pergunta, setPergunta] = useState('');
  const [copilotResp, setCopilotResp] = useState('');
  const [copilotBusy, setCopilotBusy] = useState(false);

  const [whatIf, setWhatIf] = useState<WhatIfResult | null>(null);
  const [wiOps, setWiOps] = useState('0');
  const [wiVendas, setWiVendas] = useState('40');
  const [wiMeta, setWiMeta] = useState('55');

  const [coaching, setCoaching] = useState<CoachingAction[]>([]);
  const [novaSugestao, setNovaSugestao] = useState('');

  const [propId, setPropId] = useState('');
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [triageBusy, setTriageBusy] = useState(false);

  const [ragQ, setRagQ] = useState('');
  const [ragRows, setRagRows] = useState<KnowledgeChunk[]>([]);

  const { events, lastPoll, refresh: refreshEvents } = useOperacionalEvents(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const overview = await fetchAnalyticsOverview(de, ate);
      setAnalytics(overview);

      let atestados_pendentes = 0;
      let inss_alertas = 0;
      if (isAdmin) {
        try {
          const st = await fetchAtestadosStats();
          if (st) {
            atestados_pendentes = st.pendentes;
            inss_alertas = st.inss_alertas;
          }
        } catch {
          /* supervisor sem stats */
        }
      }

      const r = await fetchRiskRadar({
        taxa_erro_pct: overview.taxa_erro_pct,
        taxa_erro_tendencia: overview.taxa_erro_tendencia,
        atestados_pendentes,
        inss_alertas,
        cpc_pct: Number(cpcPct) || undefined,
        meta_cpc: Number(metaCpc) || 65,
        portabilidade_p0: Number(portP0) || 0,
        portabilidade_fila: Number(portFila) || 0,
        advertencias_pendentes: Number(advPend) || 0,
        advertencias_criticos: Number(advCrit) || 0,
      });
      setRisk(r);

      const coach = await listCoaching();
      setCoaching(coach);

      const rag = await searchKnowledge('');
      setRagRows(rag);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar inteligência');
    } finally {
      setLoading(false);
    }
  }, [de, ate, isAdmin, cpcPct, metaCpc, portP0, portFila, advPend, advCrit]);

  const riskInput = useMemo(
    () => ({
      taxa_erro_pct: analytics?.taxa_erro_pct,
      taxa_erro_tendencia: analytics?.taxa_erro_tendencia,
      cpc_pct: Number(cpcPct) || undefined,
      meta_cpc: Number(metaCpc) || 65,
      portabilidade_p0: Number(portP0) || 0,
      portabilidade_fila: Number(portFila) || 0,
      advertencias_pendentes: Number(advPend) || 0,
      advertencias_criticos: Number(advCrit) || 0,
    }),
    [analytics, cpcPct, metaCpc, portP0, portFila, advPend, advCrit],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const runCopilot = async () => {
    if (!pergunta.trim()) return;
    setCopilotBusy(true);
    setErro('');
    try {
      const res = await askCopilot({
        question: pergunta.trim(),
        page: 'inteligencia',
        risk_input: riskInput,
        analytics: analytics ? { ...analytics } : undefined,
      });
      setCopilotResp(res.texto);
      if (res.risk) setRisk(res.risk);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha no copiloto');
    } finally {
      setCopilotBusy(false);
    }
  };

  const runSimulator = async () => {
    setErro('');
    try {
      const res = await runWhatIf({
        operadores_removidos: Number(wiOps) || 0,
        cpc_por_operador_hora: 1.4,
        horas_restantes: 4,
        vendas_atuais: Number(wiVendas) || 0,
        meta_dia: Number(wiMeta) || 0,
        fila_portabilidade: Number(portFila) || 0,
        minutos_medio_resolucao: 28,
      });
      setWhatIf(res);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha no simulador');
    }
  };

  const runTriage = async () => {
    if (!propId.trim()) return;
    setTriageBusy(true);
    setErro('');
    try {
      const res = await triagePortabilidade({
        proposta_id: propId.trim(),
        idade_horas: 36,
        tentativas: 2,
        ultimo_erro: 'timeout sistema',
        tem_os: true,
        tem_ticket: false,
      });
      setTriage(res);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha no agente');
    } finally {
      setTriageBusy(false);
    }
  };

  const addCoaching = async () => {
    if (!novaSugestao.trim()) return;
    try {
      const row = await createCoaching({ sugestao: novaSugestao.trim(), tipo: 'geral' });
      setCoaching((prev) => [row, ...prev]);
      setNovaSugestao('');
      setOk('Coaching registrado.');
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao criar coaching');
    }
  };

  const setCoachStatus = async (id: string, status: CoachingAction['status']) => {
    try {
      const row = await patchCoaching(id, status);
      setCoaching((prev) => prev.map((c) => (c.id === id ? row : c)));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao atualizar');
    }
  };

  const searchRag = async () => {
    try {
      const rows = await searchKnowledge(ragQ);
      setRagRows(rows);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha na busca');
    }
  };

  return (
    <AdminLayout
      title="Inteligência Operacional"
      subtitle="Copiloto, risk radar, simulador, coaching, agente e base 3F"
    >
      <div className="space-y-4">
        {erro && (
          <PageAlert variant="error" onDismiss={() => setErro('')}>
            {erro}
          </PageAlert>
        )}
        {ok && (
          <PageAlert variant="success" onDismiss={() => setOk('')}>
            {ok}
          </PageAlert>
        )}

        <div className="card p-3 shadow-sm flex flex-wrap gap-3 items-end">
          <label className="text-xs text-gray-500">
            De
            <input type="date" className="input-field block mt-1" value={de} onChange={(e) => setDe(e.target.value)} />
          </label>
          <label className="text-xs text-gray-500">
            Até
            <input type="date" className="input-field block mt-1" value={ate} onChange={(e) => setAte(e.target.value)} />
          </label>
          <button type="button" className="btn-secondary text-sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw size={14} className={`inline mr-1 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
            <Radio size={14} className="text-emerald-500" />
            Eventos {lastPoll ? new Date(lastPoll).toLocaleTimeString('pt-BR') : '—'}
            <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => void refreshEvents()}>
              Poll
            </button>
          </div>
        </div>

        {analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Propostas" value={String(analytics.total)} icon={FileText} />
            <KpiCard label="Taxa erro" value={`${analytics.taxa_erro_pct}%`} icon={AlertTriangle} warn={analytics.taxa_erro_pct > 15} />
            <KpiCard label="Tendência erro" value={`${analytics.taxa_erro_tendencia > 0 ? '+' : ''}${analytics.taxa_erro_tendencia} p.p.`} icon={TrendingUp} warn={analytics.taxa_erro_tendencia > 2} />
            <KpiCard label="Risk score" value={risk ? String(risk.score) : '—'} icon={Gauge} critical={!!risk && risk.score >= 70} />
          </div>
        )}

        {events.length > 0 && (
          <div className="card p-3 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 mb-2">Feed em tempo real</p>
            <ul className="space-y-1 max-h-28 overflow-y-auto text-sm">
              {events.slice(0, 6).map((ev) => (
                <li key={ev.id} className="flex gap-2">
                  <span className={`shrink-0 text-[10px] uppercase px-1.5 py-0.5 rounded ${ev.severidade === 'critical' ? 'bg-red-100 text-red-700' : ev.severidade === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                    {ev.severidade}
                  </span>
                  <span className="truncate">{ev.titulo}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card p-3 shadow-sm">
          <TabBar tabs={TABS} active={tab} onChange={(id) => setTab(id as Tab)} ariaLabel="Módulos de inteligência" />
        </div>

        {tab === 'radar' && risk && (
          <div className="space-y-3">
            <div className={`card p-4 shadow-sm inline-flex items-center gap-3 rounded-xl ${RISK_LEVEL_CLS[risk.level]}`}>
              <Radar size={28} />
              <div>
                <p className="text-2xl font-bold">{risk.score}/100</p>
                <p className="text-sm">{risk.resumo}</p>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-2">
              <label className="text-xs">CPC %<input className="input-field w-full mt-1" value={cpcPct} onChange={(e) => setCpcPct(e.target.value)} /></label>
              <label className="text-xs">Meta CPC<input className="input-field w-full mt-1" value={metaCpc} onChange={(e) => setMetaCpc(e.target.value)} /></label>
              <label className="text-xs">P0 port.<input className="input-field w-full mt-1" value={portP0} onChange={(e) => setPortP0(e.target.value)} /></label>
              <label className="text-xs">Fila port.<input className="input-field w-full mt-1" value={portFila} onChange={(e) => setPortFila(e.target.value)} /></label>
              <label className="text-xs">Adv. pendentes<input className="input-field w-full mt-1" value={advPend} onChange={(e) => setAdvPend(e.target.value)} /></label>
              <label className="text-xs">Adv. críticos<input className="input-field w-full mt-1" value={advCrit} onChange={(e) => setAdvCrit(e.target.value)} /></label>
            </div>
            <button type="button" className="btn-primary text-sm" onClick={() => void reload()}>
              Recalcular radar
            </button>
            <ul className="space-y-2">
              {risk.signals.map((s) => (
                <li key={s.id} className="card p-3 shadow-sm flex justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{s.label}</p>
                    <p className="text-xs text-gray-500">{s.detail}</p>
                  </div>
                  {s.action && (
                    <Link to={s.action.href} className="btn-secondary text-xs shrink-0 self-center">
                      {s.action.label}
                    </Link>
                  )}
                </li>
              ))}
              {risk.signals.length === 0 && <p className="text-sm text-gray-500">Nenhum sinal de risco ativo.</p>}
            </ul>
          </div>
        )}

        {tab === 'copiloto' && (
          <div className="card p-4 shadow-sm space-y-3">
            {!isAdmin && (
              <PageAlert variant="info">Copiloto IA disponível apenas para admin.</PageAlert>
            )}
            <textarea
              className="input-field w-full min-h-[100px]"
              placeholder="Ex.: Por que o CPC caiu e a fila portabilidade subiu?"
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              disabled={!isAdmin}
            />
            <button type="button" className="btn-primary text-sm" disabled={!isAdmin || copilotBusy} onClick={() => void runCopilot()}>
              <Send size={14} className="inline mr-1" />
              {copilotBusy ? 'Analisando…' : 'Perguntar ao copiloto'}
            </button>
            {copilotResp && (
              <div className="prose prose-sm max-w-none bg-slate-50 rounded-lg p-4 whitespace-pre-wrap text-sm">
                {copilotResp}
              </div>
            )}
          </div>
        )}

        {tab === 'simulador' && (
          <div className="card p-4 shadow-sm space-y-3">
            <div className="grid md:grid-cols-3 gap-2">
              <label className="text-xs">Operadores removidos<input className="input-field w-full mt-1" value={wiOps} onChange={(e) => setWiOps(e.target.value)} /></label>
              <label className="text-xs">Vendas atuais<input className="input-field w-full mt-1" value={wiVendas} onChange={(e) => setWiVendas(e.target.value)} /></label>
              <label className="text-xs">Meta dia<input className="input-field w-full mt-1" value={wiMeta} onChange={(e) => setWiMeta(e.target.value)} /></label>
            </div>
            <button type="button" className="btn-primary text-sm" onClick={() => void runSimulator()}>
              Simular cenário
            </button>
            {whatIf && (
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <KpiCard label="Projeção realista" value={String(whatIf.vendas_projetadas)} icon={FlaskConical} />
                <KpiCard label="Gap meta" value={String(whatIf.gap_meta)} icon={Target} warn={whatIf.gap_meta < 0} />
                <p className="md:col-span-2 text-gray-700 bg-blue-50 rounded-lg p-3">{whatIf.recomendacao}</p>
                <p className="text-xs text-gray-500">
                  Cenários: otimista {whatIf.cenarios.otimista} · realista {whatIf.cenarios.realista} · pessimista {whatIf.cenarios.pessimista}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'coaching' && (
          <div className="space-y-3">
            <div className="card p-4 shadow-sm flex gap-2">
              <input className="input-field flex-1" placeholder="Nova sugestão de coaching…" value={novaSugestao} onChange={(e) => setNovaSugestao(e.target.value)} />
              <button type="button" className="btn-primary text-sm" onClick={() => void addCoaching()}>
                Registrar
              </button>
            </div>
            <ul className="space-y-2">
              {coaching.map((c) => (
                <li key={c.id} className="card p-3 shadow-sm flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="text-sm">{c.sugestao}</p>
                    <p className="text-xs text-gray-500">{c.status} · {new Date(c.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                  {c.status === 'pendente' && (
                    <div className="flex gap-1">
                      <button type="button" className="btn-secondary text-xs" onClick={() => void setCoachStatus(c.id, 'feito')}>Feito</button>
                      <button type="button" className="btn-secondary text-xs" onClick={() => void setCoachStatus(c.id, 'adiado')}>Adiar</button>
                    </div>
                  )}
                </li>
              ))}
              {coaching.length === 0 && <p className="text-sm text-gray-500">Nenhum coaching registrado.</p>}
            </ul>
          </div>
        )}

        {tab === 'agente' && (
          <div className="card p-4 shadow-sm space-y-3">
            <input className="input-field w-full" placeholder="ID proposta" value={propId} onChange={(e) => setPropId(e.target.value)} />
            <button type="button" className="btn-primary text-sm" disabled={triageBusy} onClick={() => void runTriage()}>
              {triageBusy ? 'Classificando…' : 'Triagem automática'}
            </button>
            {triage && (
              <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2">
                <p><strong>Classificação:</strong> {triage.classificacao} ({Math.round(triage.confianca * 100)}%)</p>
                <p><strong>Ação:</strong> {triage.acao_sugerida}</p>
                {triage.auto_executavel && <p className="text-emerald-700 text-xs">Auto-executável em cenários de baixo risco</p>}
                <ul className="list-disc pl-5 text-xs text-gray-600">{triage.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {tab === 'conhecimento' && (
          <div className="card p-4 shadow-sm space-y-3">
            <div className="flex gap-2">
              <input className="input-field flex-1" placeholder="Buscar políticas 3F…" value={ragQ} onChange={(e) => setRagQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void searchRag()} />
              <button type="button" className="btn-primary text-sm" onClick={() => void searchRag()}>
                <BookOpen size={14} className="inline mr-1" /> Buscar
              </button>
            </div>
            <ul className="space-y-2">
              {ragRows.map((k) => (
                <li key={k.id} className="border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-blue-600 uppercase">{k.categoria}</p>
                  <p className="font-medium text-sm">{k.titulo}</p>
                  <p className="text-sm text-gray-600 mt-1">{k.conteudo}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default InteligenciaPage;
