import type { RrPonte } from '../../lib/rrPonte';
import { GitBranch } from 'lucide-react';

function n(v: number) {
  return v.toLocaleString('pt-BR');
}

function Barra({ gap, maxAbs }: { gap: number; maxAbs: number }) {
  const w = Math.min(100, (Math.abs(gap) / Math.max(1, maxAbs)) * 100);
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${gap < 0 ? 'bg-amber-400' : 'bg-emerald-500'}`}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

export function RrPonteGap({ ponte }: { ponte: RrPonte | null }) {
  if (!ponte?.mix.length) return null;
  const maxAbs = Math.max(1, ...ponte.mix.map((f) => Math.abs(f.gap)), ...ponte.cpcBaixo.map((f) => Math.abs(f.gap)));
  return (
    <section className="mb-6 min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-1 flex items-center gap-2 text-sm font-bold text-gray-800">
        <GitBranch size={16} className="text-sky-600" />
        Ponte do gap · mix comercial
      </p>
      <p className="mb-3 text-[11px] text-gray-400">
        Port e Mig medidos à parte · BKO não entra em Todas · mix e supervisor são duas leituras, não some as duas
      </p>
      <ul className="space-y-2">
        {ponte.mix.map((f) => (
          <li key={f.id}>
            <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-800">{f.label}</span>
              <span className={`shrink-0 tabular-nums ${f.gap < 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                {n(f.vendas)} / {n(Math.round(f.meta))} · {f.gap > 0 ? '+' : ''}
                {n(f.gap)} · {f.pctMeta}%
              </span>
            </div>
            <Barra gap={f.gap} maxAbs={maxAbs} />
          </li>
        ))}
      </ul>
      {ponte.cpcBaixo.length ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">CPC baixo no gap</p>
          <ul className="space-y-1.5">
            {ponte.cpcBaixo.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-slate-700">{f.label}</span>
                <span className="shrink-0 tabular-nums text-rose-700">
                  {f.gap} · coaching de tabulação (não projeta venda)
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
