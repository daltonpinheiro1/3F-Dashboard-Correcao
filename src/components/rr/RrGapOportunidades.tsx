import { Link } from 'react-router-dom';
import { Lightbulb, TrendingDown } from 'lucide-react';
import type { RrFonteGap, RrOportunidade } from '../../lib/rrOportunidades';

function n(v: number) {
  return v.toLocaleString('pt-BR');
}

export function RrGapOportunidades({
  fontes,
  oportunidades,
  gap,
}: {
  fontes: RrFonteGap[];
  oportunidades: RrOportunidade[];
  gap: number;
}) {
  const maxAbs = Math.max(1, ...fontes.map((f) => Math.abs(f.valor)));
  return (
    <div className="mb-6 grid min-w-0 gap-4 lg:grid-cols-2">
      <section className="card min-w-0 p-4 shadow-sm">
        <p className="mb-1 flex items-center gap-2 text-sm font-bold text-gray-800">
          <TrendingDown size={16} className="text-amber-600" />
          De onde veio o gap
        </p>
        <p className="mb-3 text-[11px] text-gray-400">
          Casa {gap > 0 ? `acima +${n(gap)}` : gap < 0 ? `abaixo ${n(gap)}` : 'no ritmo'} · fatia do gap negativo por
          supervisor
        </p>
        {!fontes.length ? (
          <p className="text-sm text-emerald-700">Nenhum supervisor abaixo da meta neste recorte.</p>
        ) : (
          <ul className="space-y-2">
            {fontes.map((f) => (
              <li key={f.label}>
                <div className="mb-0.5 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold text-slate-800">{f.label}</span>
                  <span className="shrink-0 tabular-nums text-amber-800">
                    {n(f.valor)} · {f.pct}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-amber-50">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: `${Math.min(100, (Math.abs(f.valor) / maxAbs) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card min-w-0 p-4 shadow-sm">
        <p className="mb-1 flex items-center gap-2 text-sm font-bold text-gray-800">
          <Lightbulb size={16} className="text-violet-600" />
          Oportunidades
        </p>
        <p className="mb-3 text-[11px] text-gray-400">
          Impacto = vendas já medidas se o time chegar à mediana — sem elasticidade inventada
        </p>
        {!oportunidades.length ? (
          <p className="text-sm text-slate-500">Sem alavanca clara neste recorte.</p>
        ) : (
          <ul className="space-y-2">
            {oportunidades.map((o) => (
              <li key={o.id}>
                <Link
                  to={o.href}
                  className={`block rounded-lg border px-3 py-2 hover:bg-slate-50 ${
                    o.prioridade === 'alta'
                      ? 'border-violet-200 bg-violet-50/50'
                      : 'border-slate-100 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{o.titulo}</p>
                    {o.impacto > 0 ? (
                      <span className="shrink-0 text-xs font-bold tabular-nums text-violet-800">+{n(o.impacto)}</span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-slate-500">{o.detalhe}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
