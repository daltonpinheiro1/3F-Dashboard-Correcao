import { memo, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtDelta, n } from '../../lib/disparosFormat';
import type { CmpMes, Fatia, FunilPayload, HistoricoPonto } from '../../types/portabilidade';
import { StratCard } from './DisparosWidgets';

type GerencialAnalyticsProps = {
  mes: string;
  g: FunilPayload['gerencial'];
  rec: FunilPayload['reconciliacao'];
  historicoMes: HistoricoPonto | null;
  cmpMes: CmpMes;
  estagios?: FunilPayload['estagios'];
  fatias?: Fatia[];
  funilConversao?: FunilPayload['funil_conversao'];
  motivos?: { label: string; count: number }[];
  cancelamentos?: { label: string; count: number }[];
  tickets?: { label: string; count: number }[];
  ordens?: { label: string; count: number }[];
  logistica?: { label: string; count: number }[];
};

const ESTAGIO_COR: Record<string, string> = {
  fechamento: '#059669',
  logistica: '#0ea5e9',
  fila: '#f59e0b',
  ticket: '#6366f1',
  ordem: '#f97316',
  pre_os: '#64748b',
  orfao: '#dc2626',
};

function GerStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'emerald' | 'sky' | 'slate';
}) {
  const border =
    accent === 'emerald'
      ? 'border-emerald-100 bg-emerald-50/50'
      : accent === 'sky'
        ? 'border-sky-100 bg-sky-50/50'
        : accent === 'slate'
          ? 'border-slate-200 bg-slate-50/50'
          : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${border}`}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-black tabular-nums text-gray-900">{value}</p>
      {sub ? <p className="text-[10px] text-gray-500">{sub}</p> : null}
    </div>
  );
}

export const GerencialAnalytics = memo(function GerencialAnalytics({
  mes,
  g,
  rec,
  historicoMes,
  cmpMes,
  estagios,
  fatias,
  funilConversao,
  motivos,
  cancelamentos,
  tickets,
  ordens,
  logistica,
}: GerencialAnalyticsProps) {
  const universo = rec?.universo || 0;
  const convSteps = useMemo(() => {
    const steps = funilConversao || [];
    return steps.map((step, i) => {
      const prev = i > 0 ? steps[i - 1].valor : step.valor;
      return {
        ...step,
        pctUniverso: universo ? Math.round((step.valor / universo) * 1000) / 10 : 0,
        retencao: prev ? Math.round((step.valor / prev) * 1000) / 10 : 100,
        queda: prev && i > 0 ? prev - step.valor : 0,
      };
    });
  }, [funilConversao, universo]);

  const topFatias = useMemo(
    () => [...(fatias || [])].sort((a, b) => b.count - a.count).slice(0, 10),
    [fatias],
  );

  const mixFechamento = [
    { label: 'Portado', valor: g?.portados ?? 0, cor: '#059669' },
    { label: 'Falha parcial', valor: g?.falha_parcial ?? 0, cor: '#e11d48' },
    { label: 'Cancelada', valor: g?.canceladas ?? 0, cor: '#64748b' },
  ];
  const totalMix = mixFechamento.reduce((a, x) => a + x.valor, 0);

  return (
    <section className="mb-6 rounded-xl border border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-indigo-950">
            <TrendingUp size={16} className="text-indigo-600" />
            Análise gerencial · cohort {mes}
          </p>
          <p className="text-xs text-gray-500">
            Mesmos números do funil · conversão, mix de fechamento, estratificação e comparativo
            {cmpMes ? ` vs ${cmpMes.mes_anterior}` : ''}.
          </p>
        </div>
        {historicoMes && (
          <span className="rounded-md border border-indigo-100 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-800">
            Fila mês: {n(historicoMes.execucoes)} exec · sucesso {historicoMes.taxa_sucesso_fila_pct}%
            · activate {n(historicoMes.activate_ok)}
          </span>
        )}
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
        <GerStat label="Universo" value={n(universo)} sub="cohorte do mês" />
        <GerStat
          label="Sucesso TIM (P+F)"
          value={`${g?.taxa_sucesso_tim_pct ?? 0}%`}
          sub={n(g?.sucesso_tim ?? (g?.portados ?? 0) + (g?.falha_parcial ?? 0))}
          accent="emerald"
        />
        <GerStat label="Fechados" value={`${g?.taxa_fechamento_pct ?? 0}%`} sub={n(g?.fechados)} />
        <GerStat
          label="Portado / universo"
          value={`${g?.taxa_portado_pct ?? 0}%`}
          sub={n(g?.portados)}
          accent="emerald"
        />
        <GerStat
          label="Sucesso TIM / fechados"
          value={`${g?.taxa_sucesso_tim_sobre_fechados_pct ?? 0}%`}
          sub="P+F sobre fechados"
          accent="emerald"
        />
        <GerStat label="Canceladas" value={`${g?.taxa_cancelamento_pct ?? 0}%`} sub={n(g?.canceladas)} accent="slate" />
        <GerStat label="Com OS 1-*" value={`${g?.taxa_os_pct ?? 0}%`} sub={n(g?.com_os)} />
        <GerStat label="Com ticket" value={`${g?.taxa_ticket_pct ?? 0}%`} sub={n(g?.com_ticket)} />
        <GerStat label="Em voo" value={`${g?.taxa_em_voo_pct ?? 0}%`} sub={`BKO ${n(g?.bko)}`} accent="sky" />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Funil de conversão · retenção entre etapas
          </p>
          {!convSteps.length ? (
            <p className="text-xs text-gray-400">Sem dados de conversão.</p>
          ) : (
            <ul className="space-y-2">
              {convSteps.map((step, i) => (
                <li key={step.id}>
                  <div className="mb-0.5 flex justify-between gap-2 text-xs">
                    <span className="font-medium text-gray-800">{step.label}</span>
                    <span className="tabular-nums text-gray-600">
                      {n(step.valor)} · {step.pctUniverso}% do universo
                      {i > 0 ? ` · retenção ${step.retencao}%` : ''}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-indigo-600 transition-all"
                      style={{ width: `${Math.max(2, step.pctUniverso)}%` }}
                    />
                  </div>
                  {i > 0 && step.queda > 0 && (
                    <p className="mt-0.5 text-[10px] text-rose-600">−{n(step.queda)} vs etapa anterior</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Mix de fechamento · portado / falha / cancelada
          </p>
          {totalMix === 0 ? (
            <p className="text-xs text-gray-400">Nenhum fechamento no recorte.</p>
          ) : (
            <>
              <div className="mb-2 flex h-4 overflow-hidden rounded-full bg-slate-100">
                {mixFechamento.map((m) =>
                  m.valor > 0 ? (
                    <div
                      key={m.label}
                      className="h-full"
                      style={{
                        width: `${(m.valor / totalMix) * 100}%`,
                        backgroundColor: m.cor,
                      }}
                      title={`${m.label}: ${m.valor}`}
                    />
                  ) : null,
                )}
              </div>
              <ul className="grid gap-1 sm:grid-cols-3">
                {mixFechamento.map((m) => (
                  <li key={m.label} className="text-xs">
                    <span className="font-semibold" style={{ color: m.cor }}>
                      {m.label}
                    </span>
                    <span className="ml-1 tabular-nums text-gray-700">
                      {n(m.valor)} ({totalMix ? Math.round((m.valor / totalMix) * 1000) / 10 : 0}%)
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <div className="h-52 rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Macro-grupos exclusivos
          </p>
          {(estagios || []).length > 0 ? (
            <ResponsiveContainer width="100%" height="88%">
              <ComposedChart data={estagios} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip />
                <Bar dataKey="valor" name="Propostas" radius={[3, 3, 0, 0]}>
                  {(estagios || []).map((e) => (
                    <Cell key={e.id} fill={ESTAGIO_COR[e.id] || '#64748b'} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400">Sem estágios.</p>
          )}
        </div>

        <div className="h-52 rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Top fatias · participação no universo
          </p>
          {topFatias.length > 0 ? (
            <ResponsiveContainer width="100%" height="88%">
              <ComposedChart
                layout="vertical"
                data={topFatias.map((f) => ({ name: f.label.slice(0, 28), valor: f.count, pct: f.pct }))}
                margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9, fill: '#64748b' }} />
                <Tooltip formatter={(v: number, _n, p) => [`${n(v)} (${(p?.payload as { pct?: number })?.pct ?? 0}%)`, 'Qtd']} />
                <Bar dataKey="valor" name="Qtd" fill="#4f46e5" radius={[0, 3, 3, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400">Sem fatias.</p>
          )}
        </div>
      </div>

      {cmpMes && (
        <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
            Variação vs {cmpMes.mes_anterior}
          </p>
          <div className="flex flex-wrap gap-3 text-xs tabular-nums text-indigo-950">
            <span>Portados {fmtDelta(cmpMes.portados)}</span>
            <span>Fechados {fmtDelta(cmpMes.fechados)}</span>
            <span>Canceladas {fmtDelta(cmpMes.canceladas)}</span>
            <span>Quebras {fmtDelta(cmpMes.quebras)}</span>
            <span>BKO {fmtDelta(cmpMes.bko)}</span>
            <span>Taxa port. {fmtDelta(cmpMes.taxa_portado_pct, ' pp')}</span>
            <span>Exec. fila {fmtDelta(cmpMes.execucoes)}</span>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <StratCard title="Motivo recusar (TIM/BKO)" rows={motivos} />
        <StratCard title="Cancelamento" rows={cancelamentos} />
        <StratCard title="Ticket status" rows={tickets} />
        <StratCard title="Order status" rows={ordens} />
        <StratCard title="Logística Toutbox" rows={logistica} />
      </div>
    </section>
  );
});
