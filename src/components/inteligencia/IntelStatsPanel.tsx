import type { AnalyticsOverview, RiskRadarResult } from '../../lib/operacionalIntelService';

export function IntelStatsPanel({
  analytics,
  risk,
}: {
  analytics: AnalyticsOverview | null;
  risk: RiskRadarResult | null;
}) {
  if (!analytics && !risk) return null;
  const tempoS = analytics?.tempo_medio_ms
    ? `${Math.round(analytics.tempo_medio_ms / 100) / 10}s`
    : '—';

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {analytics && (
        <div className="card p-4 shadow-sm space-y-2">
          <p className="text-sm font-bold text-gray-800">Correção · estatística</p>
          <p className="text-xs text-gray-500">
            Top erro <strong>{analytics.top_erro || '—'}</strong>
            {' · '}tempo médio {tempoS}
            {' · '}supervisores {analytics.supervisores_ativos}
            {analytics.concentracao_erro_pct != null
              ? ` · concentração ${analytics.concentracao_erro_pct}%`
              : ''}
          </p>
          {!!analytics.pareto_erro?.length && (
            <ul className="text-xs text-gray-600 space-y-1">
              <li className="text-[11px] text-slate-500">
                Pareto corte {analytics.pareto_corte_pct ?? 60}% — tipos que concentram o problema
              </li>
              {analytics.pareto_erro.map((p) => (
                <li key={p.tipo} className="flex justify-between gap-2">
                  <span>{p.tipo}</span>
                  <span className="tabular-nums">
                    {p.count} · {p.pct}% (acum {p.acum_pct}%)
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!!analytics.outliers_supervisor?.length && (
            <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">
              Outlier z≥1,5:{' '}
              {analytics.outliers_supervisor
                .map((o) => `${o.supervisor} (${o.taxa_erro_pct}%, z=${o.z})`)
                .join(' · ')}
            </p>
          )}
        </div>
      )}
      {risk && (
        <div className="card p-4 shadow-sm space-y-2">
          <p className="text-sm font-bold text-gray-800">Contribuição do score</p>
          {risk.foco && <p className="text-xs text-gray-600">Foco: {risk.foco}</p>}
          <ul className="space-y-1.5">
            {(risk.contribuicoes || []).slice(0, 6).map((c) => (
              <li key={c.id}>
                <div className="flex justify-between text-xs text-gray-600">
                  <span>{c.label}</span>
                  <span className="tabular-nums">{c.pct}%</span>
                </div>
                <div className="h-1.5 rounded bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-slate-700"
                    style={{ width: `${Math.min(100, c.pct)}%` }}
                  />
                </div>
              </li>
            ))}
            {!risk.contribuicoes?.length && (
              <p className="text-xs text-gray-500">Nenhuma contribuição — score limpo.</p>
            )}
          </ul>
          {(risk.interacoes || []).map((t) => (
            <p key={t} className="text-xs text-indigo-800 bg-indigo-50 rounded-lg p-2">
              {t}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
