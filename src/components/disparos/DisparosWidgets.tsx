import { CheckCircle2 } from 'lucide-react';
import { n } from '../../lib/disparosFormat';
import type { StratRow } from '../../types/portabilidade';

export function FatiaStratBlock({ title, rows }: { title: string; rows?: StratRow[] }) {
  const list = rows || [];
  const max = Math.max(1, ...list.map((r) => r.count));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {title} · maior → menor
      </p>
      {!list.length ? (
        <p className="text-[11px] text-gray-400">—</p>
      ) : (
        <ul className="max-h-36 space-y-1.5 overflow-y-auto">
          {list.slice(0, 12).map((r) => (
            <li key={`${title}-${r.label}`}>
              <div className="mb-0.5 flex justify-between gap-2 text-[11px]">
                <span className="truncate text-gray-700" title={r.label}>
                  {r.label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                  {n(r.count)}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-slate-700"
                  style={{ width: `${Math.round((r.count / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StratCard({
  title,
  rows,
}: {
  title: string;
  rows?: { label: string; count: number }[];
}) {
  const max = Math.max(1, ...(rows || []).map((r) => r.count));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-bold text-gray-800">{title}</p>
      {!rows?.length ? (
        <p className="text-xs text-gray-400">Sem dados</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-0.5 flex justify-between gap-2 text-[11px]">
                <span className="truncate text-gray-600">{r.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                  {n(r.count)}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-slate-600"
                  style={{ width: `${Math.round((r.count / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MiniKpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  return (
    <div className="card p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        <Icon size={12} />
        {label}
      </div>
      <p className="text-2xl font-black tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
