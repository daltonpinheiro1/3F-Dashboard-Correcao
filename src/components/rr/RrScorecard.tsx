import { Activity, Gauge } from 'lucide-react';

export function RrScorecard({
  lag,
  lead,
}: {
  lag: Array<{ label: string; valor: string; warn?: boolean }>;
  lead: Array<{ label: string; valor: string; warn?: boolean }>;
}) {
  return (
    <div className="mb-6 grid min-w-0 gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-800">
          <Gauge size={16} className="text-slate-500" />
          Lag · já fechou
        </p>
        <ul className="space-y-2">
          {lag.map((x) => (
            <li key={x.label} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-500">{x.label}</span>
              <span className={`font-bold tabular-nums ${x.warn ? 'text-amber-700' : 'text-slate-900'}`}>{x.valor}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-800">
          <Activity size={16} className="text-sky-600" />
          Líder · mexe o resto do dia
        </p>
        <ul className="space-y-2">
          {lead.map((x) => (
            <li key={x.label} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-500">{x.label}</span>
              <span className={`font-bold tabular-nums ${x.warn ? 'text-amber-700' : 'text-slate-900'}`}>{x.valor}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
