import { Award, Trophy } from 'lucide-react';
import type { RrCulturaNome } from '../../lib/rrCultura';

function n(v: number) {
  return v.toLocaleString('pt-BR');
}

export function RrFrasePodio({
  frase,
  podio,
  banco,
}: {
  frase: string;
  podio: RrCulturaNome[];
  banco: RrCulturaNome[];
}) {
  const abaixo = frase.startsWith('Abaixo');
  const acima = frase.startsWith('Acima');
  return (
    <div className="mb-6 min-w-0 space-y-4">
      <section
        className={`rounded-xl border px-4 py-3 ${
          abaixo
            ? 'border-amber-200 bg-amber-50'
            : acima
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-slate-200 bg-slate-50'
        }`}
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Frase da casa</p>
        <p className="text-lg font-black leading-snug text-slate-900 sm:text-xl">{frase}</p>
      </section>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-emerald-100 bg-white p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
            <Trophy size={16} className="text-emerald-600" />
            Pódio · puxam a fila
          </p>
          <ol className="space-y-2">
            {podio.map((s, i) => (
              <li key={s.supervisor} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-semibold text-slate-900">
                  {i + 1}º {s.supervisor}
                </span>
                <span className="shrink-0 tabular-nums text-emerald-800">
                  {s.pctMeta}% · {n(s.vendas)}
                </span>
              </li>
            ))}
            {!podio.length ? <li className="text-sm text-slate-400">Sem time com meta neste recorte.</li> : null}
          </ol>
        </section>
        <section className="rounded-xl border border-amber-100 bg-white p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
            <Award size={16} className="text-amber-600" />
            Banco · não repetir o turno
          </p>
          <ol className="space-y-2">
            {banco.map((s) => (
              <li key={s.supervisor} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-semibold text-slate-900">{s.supervisor}</span>
                <span className="shrink-0 tabular-nums text-amber-800">
                  {s.gap > 0 ? '+' : ''}
                  {n(s.gap)} · {s.pctMeta}%
                </span>
              </li>
            ))}
            {!banco.length ? (
              <li className="text-sm text-emerald-700">Ninguém no banco — a casa está equilibrada.</li>
            ) : null}
          </ol>
        </section>
      </div>
    </div>
  );
}
