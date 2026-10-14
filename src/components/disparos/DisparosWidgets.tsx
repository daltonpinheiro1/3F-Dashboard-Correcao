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
  total,
  subtitulo,
}: {
  title: string;
  rows?: { label: string; count: number; linhas?: number }[];
  /** Base do percentual (ex.: propostas da janela). Sem total, só a contagem. */
  total?: number;
  subtitulo?: string;
}) {
  const max = Math.max(1, ...(rows || []).map((r) => r.count));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-gray-800">{title}</p>
      {subtitulo && <p className="mt-0.5 text-[11px] text-slate-500">{subtitulo}</p>}
      {!rows?.length ? (
        <p className="mt-3 text-xs text-gray-400">Sem dados</p>
      ) : (
        <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-0.5 flex justify-between gap-2 text-[11px]">
                <span
                  className={`truncate ${r.label === 'Demais' ? 'italic text-gray-400' : 'text-gray-600'}`}
                  title={r.linhas != null ? `${r.label} · ${n(r.linhas)} registro(s)` : r.label}
                >
                  {r.label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                  {n(r.count)}
                  {total ? (
                    <span className="ml-1 font-normal text-gray-400">
                      {((r.count / total) * 100).toFixed(1)}%
                    </span>
                  ) : null}
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
  janela,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  janela?: string;
}) {
  return (
    <div className="card p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        <Icon size={12} />
        {label}
        {janela ? (
          <span className="ml-auto rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-normal text-emerald-700">
            {janela}
          </span>
        ) : null}
      </div>
      <p className="text-2xl font-black tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
