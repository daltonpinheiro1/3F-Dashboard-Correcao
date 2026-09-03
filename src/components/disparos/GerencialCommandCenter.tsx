import { memo, useCallback, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Loader2,
  Play,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboardSessionHeaders } from '../../lib/dashboardSession';
import { fmtDelta, n, normalizePropostaInput } from '../../lib/disparosFormat';
import { ACOES_SUPERVISOR_FILA } from '../../lib/portabilidadeAcaoFatia';
import {
  ACOES_FILA,
  buildProjecaoMes,
  detectarOportunidades,
  serieTendencia,
  type Oportunidade,
} from '../../lib/portabilidadeProjecoes';
import type {
  CmpMes,
  DisparosPayload,
  Fatia,
  FunilPayload,
  HistoricoPayload,
  HistoricoPonto,
} from '../../types/portabilidade';

type Props = {
  mes: string;
  g: FunilPayload['gerencial'];
  rec: FunilPayload['reconciliacao'];
  funil?: FunilPayload;
  historico?: HistoricoPayload | null;
  historicoMes: HistoricoPonto | null;
  cmpMes: CmpMes;
  disparos?: DisparosPayload | null;
  /** cancel/open/activate só admin (espelha API). */
  isAdmin?: boolean;
  onOpenFatia?: (id: string, fatia: Fatia) => void;
  onRefresh?: () => void;
};

const PRIO_COR: Record<string, string> = {
  P0: 'border-rose-200 bg-rose-50 text-rose-900',
  P1: 'border-amber-200 bg-amber-50 text-amber-950',
  P2: 'border-sky-200 bg-sky-50 text-sky-950',
};

function CenarioCard({
  label,
  valor,
  taxa,
  cor,
}: {
  label: string;
  valor: number;
  taxa: number;
  cor: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${cor}`}>
      <p className="text-[9px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xl font-black tabular-nums">{n(valor)}</p>
      <p className="text-[10px] tabular-nums opacity-80">Sucesso TIM · {taxa}% universo</p>
    </div>
  );
}

export const GerencialCommandCenter = memo(function GerencialCommandCenter({
  mes,
  g,
  rec,
  funil,
  historico,
  historicoMes,
  cmpMes,
  disparos,
  isAdmin = false,
  onOpenFatia,
  onRefresh,
}: Props) {
  const acoesDisponiveis = isAdmin ? ACOES_FILA : ACOES_SUPERVISOR_FILA;
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingErr, setBriefingErr] = useState<string | null>(null);

  const [propostaCmd, setPropostaCmd] = useState('');
  const [acaoCmd, setAcaoCmd] = useState<string>('consult');
  const [confirmCmd, setConfirmCmd] = useState(false);
  const [enqueueLoading, setEnqueueLoading] = useState(false);
  const [enqueueMsg, setEnqueueMsg] = useState<string | null>(null);
  const [enqueueErr, setEnqueueErr] = useState<string | null>(null);

  const serie = historico?.serie || [];
  const projecao = useMemo(
    () =>
      buildProjecaoMes({
        mes,
        g,
        rec,
        serie,
        metaPortados: funil?.meta_mes?.meta_portados ?? null,
        metaPortadosPct: funil?.meta_mes?.portados_pct ?? null,
      }),
    [mes, g, rec, serie, funil?.meta_mes?.meta_portados, funil?.meta_mes?.portados_pct],
  );

  const oportunidades = useMemo(
    () =>
      detectarOportunidades({
        g,
        rec,
        funil,
        cmpMes,
        projecao,
        historicoMes,
      }),
    [g, rec, funil, cmpMes, projecao, historicoMes],
  );

  const tendencia = useMemo(() => serieTendencia(serie), [serie]);

  const gerarBriefing = useCallback(async () => {
    setBriefingLoading(true);
    setBriefingErr(null);
    try {
      const r = await fetch('/api/portabilidade-gerencial-insight', {
        method: 'POST',
        headers: { ...dashboardSessionHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodo: { mes, modo: 'gerencial', label: funil?.periodo?.label },
          gerencial: g,
          reconciliacao: rec,
          projecao,
          oportunidades,
          comparativo: cmpMes,
          historico: serie.slice(-6),
          funil_pontes: funil?.funil_pontes,
          funil_exclusivo: funil?.funil_exclusivo,
          estagios: funil?.estagios?.map((e) => ({ id: e.id, label: e.label, valor: e.valor })),
          top_motivos: (funil?.motivos || []).slice(0, 8),
          top_cancelamentos: (funil?.cancelamentos || []).slice(0, 5),
          fila_mes: historicoMes
            ? {
                execucoes: historicoMes.execucoes,
                taxa_sucesso_fila_pct: historicoMes.taxa_sucesso_fila_pct,
                activate_ok: historicoMes.activate_ok,
              }
            : null,
          disparos_ao_vivo: disparos?.totais_ao_vivo || disparos?.totais,
        }),
      });
      const body = (await r.json()) as { briefing?: string; error?: string };
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setBriefing(body.briefing || '');
    } catch (e) {
      setBriefingErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBriefingLoading(false);
    }
  }, [mes, g, rec, projecao, oportunidades, cmpMes, serie, funil, historicoMes, disparos]);

  const executarEnqueue = useCallback(async () => {
    if (!propostaCmd.trim() || !confirmCmd) return;
    setEnqueueLoading(true);
    setEnqueueErr(null);
    setEnqueueMsg(null);
    try {
      const r = await fetch('/api/portabilidade-enqueue', {
        method: 'POST',
        headers: { ...dashboardSessionHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposta: normalizePropostaInput(propostaCmd.trim()),
          acao: acaoCmd,
          confirmar: true,
        }),
      });
      const body = (await r.json()) as { mensagem?: string; error?: string };
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setEnqueueMsg(body.mensagem || 'Enfileirado.');
      setPropostaCmd('');
      setConfirmCmd(false);
      onRefresh?.();
    } catch (e) {
      setEnqueueErr(e instanceof Error ? e.message : String(e));
    } finally {
      setEnqueueLoading(false);
    }
  }, [propostaCmd, acaoCmd, confirmCmd, onRefresh]);

  if (!g || !rec) return null;

  return (
    <section className="mb-6 space-y-4">
      <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-indigo-50/50 to-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-violet-950">
              <Bot size={18} className="text-violet-600" />
              Centro de Comando Gerencial · IA + Projeções
            </p>
            <p className="text-xs text-gray-600">
              Cohort {mes} · projeção estatística · oportunidades · briefing IA · enfileiramento manual
            </p>
          </div>
          <button
            type="button"
            onClick={gerarBriefing}
            disabled={briefingLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-violet-800 disabled:opacity-60"
          >
            {briefingLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {briefingLoading ? 'Gerando briefing IA…' : 'Briefing IA do mês'}
          </button>
        </div>

        {projecao && (
          <div className="mb-4 rounded-lg border border-white/80 bg-white/70 p-3 backdrop-blur-sm">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
              <TrendingUp size={12} />
              Projeção de fechamento · {projecao.diasRestantes} dias restantes (
              {projecao.diasUteisRestantes} úteis)
            </p>
            <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[9px] font-semibold uppercase text-slate-500">Ritmo atual</p>
                <p className="text-lg font-black tabular-nums text-slate-900">
                  {projecao.ritmoDiarioSucessoTim}/dia
                </p>
                <p className="text-[10px] text-slate-600">
                  P+F · {n(projecao.sucessoTimAtual)} de {n(projecao.universo)}
                </p>
              </div>
              <CenarioCard
                label="Pessimista"
                valor={projecao.cenarios.pessimista.sucessoTim}
                taxa={projecao.cenarios.pessimista.taxaSucessoTimPct}
                cor="border-slate-200 bg-slate-50 text-slate-800"
              />
              <CenarioCard
                label="Realista"
                valor={projecao.cenarios.realista.sucessoTim}
                taxa={projecao.cenarios.realista.taxaSucessoTimPct}
                cor="border-indigo-200 bg-indigo-50 text-indigo-950"
              />
              <CenarioCard
                label="Otimista"
                valor={projecao.cenarios.otimista.sucessoTim}
                taxa={projecao.cenarios.otimista.taxaSucessoTimPct}
                cor="border-emerald-200 bg-emerald-50 text-emerald-950"
              />
            </div>
            <div className="grid gap-2 text-[11px] tabular-nums text-violet-900 sm:grid-cols-3">
              <span className="rounded-md bg-violet-100/80 px-2 py-1">
                Monte Carlo P50: <strong>{n(projecao.monteCarlo.p50)}</strong> sucesso TIM
              </span>
              <span className="rounded-md bg-violet-100/80 px-2 py-1">
                Faixa P10–P90: {n(projecao.monteCarlo.p10)} – {n(projecao.monteCarlo.p90)}
              </span>
              <span className="rounded-md bg-violet-100/80 px-2 py-1">
                Prob. bater realista: <strong>{projecao.monteCarlo.probBaterRealista}%</strong>
              </span>
            </div>
            {projecao.meta && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">
                    Meta · {projecao.meta.portados_pct}% portados · Portado + Falha parcial (
                    {n(projecao.meta.meta_portados)} de {n(projecao.universo)})
                  </p>
                  <span className="text-xs font-black tabular-nums text-amber-950">
                    {projecao.meta.taxa_atual_pct}% universo · {projecao.meta.pctAtual}% da meta
                  </span>
                </div>
                <div className="mb-2 h-2.5 overflow-hidden rounded-full bg-amber-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all"
                    style={{
                      width: `${Math.min(100, (projecao.meta.taxa_atual_pct / projecao.meta.portados_pct) * 100)}%`,
                    }}
                  />
                </div>
                <div className="grid gap-1 text-[10px] tabular-nums text-amber-950 sm:grid-cols-3">
                  <span>
                    {n(projecao.meta.portados_atual)} P+F · faltam {n(projecao.meta.gapRestante)}
                  </span>
                  <span>Proj. realista: {n(projecao.cenarios.realista.sucessoTim)} P+F</span>
                  <span>Prob. bater meta: {projecao.meta.probBaterMeta}%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {tendencia.length > 1 && (
          <div className="mb-4 rounded-lg border border-white/80 bg-white/70 p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Tendência · sucesso TIM vs execuções fila
            </p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={tendencia} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis yAxisId="vol" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis
                    yAxisId="exec"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    width={36}
                  />
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    hide
                  />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Area
                    yAxisId="vol"
                    type="monotone"
                    dataKey="sucessoTim"
                    name="Sucesso TIM"
                    stroke="#7c3aed"
                    fill="#ddd6fe"
                    fillOpacity={0.5}
                  />
                  <Line
                    yAxisId="exec"
                    type="monotone"
                    dataKey="execucoes"
                    name="Exec. fila"
                    stroke="#64748b"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="taxaSucessoTim"
                    name="Taxa s/ fechados %"
                    stroke="#059669"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {cmpMes && (
              <p className="mt-1 text-[10px] text-indigo-700">
                vs {cmpMes.mes_anterior}: portados {fmtDelta(cmpMes.portados)} · fechados{' '}
                {fmtDelta(cmpMes.fechados)} · exec. fila {fmtDelta(cmpMes.execucoes)}
              </p>
            )}
          </div>
        )}

        {oportunidades.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
              <Target size={12} />
              Oportunidades detectadas ({oportunidades.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {oportunidades.map((op: Oportunidade) => (
                <div
                  key={op.id}
                  className={`rounded-lg border px-3 py-2 text-left ${PRIO_COR[op.prioridade]}`}
                >
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className="text-[9px] font-black">{op.prioridade}</span>
                    {op.valor != null && (
                      <span className="text-[10px] font-bold tabular-nums">{n(op.valor)}</span>
                    )}
                  </div>
                  <p className="text-xs font-bold">{op.titulo}</p>
                  <p className="text-[11px] opacity-90">{op.descricao}</p>
                  {op.acao && (
                    <p className="mt-1 text-[10px] font-medium opacity-80">→ {op.acao}</p>
                  )}
                  {op.fatiaId && onOpenFatia && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenFatia(op.fatiaId!, {
                          id: op.fatiaId!,
                          label: op.titulo,
                          grupo: 'fila',
                          cor: 'amber',
                          descricao: op.descricao,
                          count: op.valor ?? 0,
                          pct: 0,
                        })
                      }
                      className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold underline"
                    >
                      Ver fatia <ArrowRight size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(briefing || briefingErr) && (
          <div className="mb-4 rounded-lg border border-violet-100 bg-white p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-violet-700">
              <Sparkles size={12} /> Briefing IA
            </p>
            {briefingErr ? (
              <p className="text-sm text-red-600">{briefingErr}</p>
            ) : (
              <div className="max-w-none whitespace-pre-wrap text-xs text-gray-800">{briefing}</div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
            <Zap size={12} />
            Comando · enfileirar na fila TIM
          </p>
          <p className="mb-3 text-[11px] text-emerald-900/70">
            Dispara ação manual para o bot processar. Busca CPF/telefone/OS no CE automaticamente.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-gray-600">Proposta</span>
              <input
                type="text"
                value={propostaCmd}
                onChange={(e) => setPropostaCmd(e.target.value)}
                placeholder="3F-12345678"
                className="w-40 rounded-md border border-slate-200 px-2 py-1.5 text-sm tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-gray-600">Ação</span>
              <select
                value={acaoCmd}
                onChange={(e) => setAcaoCmd(e.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              >
                {acoesDisponiveis.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              {!isAdmin ? (
                <span className="text-[9px] text-amber-700">cancel/open/activate: só admin</span>
              ) : null}
            </label>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={confirmCmd}
                onChange={(e) => setConfirmCmd(e.target.checked)}
                className="rounded"
              />
              Confirmo enfileirar
            </label>
            <button
              type="button"
              onClick={executarEnqueue}
              disabled={enqueueLoading || !propostaCmd.trim() || !confirmCmd}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              {enqueueLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Play size={12} />
              )}
              Executar
            </button>
          </div>
          {enqueueMsg && <p className="mt-2 text-xs font-semibold text-emerald-800">{enqueueMsg}</p>}
          {enqueueErr && <p className="mt-2 text-xs text-red-600">{enqueueErr}</p>}
        </div>
      </div>
    </section>
  );
});
