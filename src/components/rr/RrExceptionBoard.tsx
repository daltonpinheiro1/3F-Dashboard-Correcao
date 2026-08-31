import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RrAck } from '../../lib/rrAcks';
import { SLA_MIN, slaRestanteMin, slaStatus } from '../../lib/rrAcks';
import type { RrException } from '../../lib/rrExceptions';

export function RrExceptionBoard({
  items,
  acks,
  onAck,
}: {
  items: RrException[];
  acks?: RrAck[];
  onAck?: (item: RrException) => void;
}) {
  if (!items.length) {
    return (
      <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-800">
        Exception board limpa — nenhum KPI fora do limiar neste recorte.
      </div>
    );
  }

  const byId = new Map((acks || []).map((a) => [a.alertId, a]));

  return (
    <section className="mb-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4" role="alert">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-rose-950">
        <AlertTriangle size={16} /> Exception board · só fora do limiar
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((x) => {
          const ack = byId.get(x.id);
          const st = slaStatus(ack);
          return (
            <li
              key={x.id}
              className={`rounded-lg border px-3 py-2 ${
                x.nivel === 'critico' ? 'border-rose-300 bg-white' : 'border-amber-200 bg-white'
              }`}
            >
              <p className="text-[10px] font-bold uppercase text-slate-500">{x.nivel}</p>
              <p className="text-sm font-semibold text-slate-900">{x.titulo}</p>
              <p className="text-xs text-slate-600">{x.detalhe}</p>
              {ack ? (
                <p
                  className={`mt-1 text-[11px] font-semibold ${
                    st === 'vencido' ? 'text-rose-700' : 'text-emerald-700'
                  }`}
                >
                  {ack.ownerName || ack.ownerEmail}
                  {st === 'vencido'
                    ? ' · SLA vencido'
                    : ` · SLA ${slaRestanteMin(ack)} min`}
                </p>
              ) : onAck ? (
                <button
                  type="button"
                  onClick={() => onAck(x)}
                  className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Assumir · {SLA_MIN[x.nivel]} min
                </button>
              ) : null}
              {x.href ? (
                <Link
                  to={x.href}
                  className="mt-1 inline-block text-[11px] font-semibold text-sky-700 hover:underline"
                >
                  Abrir ofensor →
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
