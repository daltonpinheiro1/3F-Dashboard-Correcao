import type { RrFunilEtapa } from '../../lib/rrFunil';

function n(v: number) {
  return v.toLocaleString('pt-BR');
}

export function RrFunilStrip({ etapas }: { etapas: RrFunilEtapa[] }) {
  if (!etapas.length) return null;
  return (
    <section className="mb-4 rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/70 to-white p-4 shadow-sm">
      <p className="mb-1 text-sm font-bold text-teal-950">Funil 360° do dia</p>
      <p className="mb-3 text-[11px] text-teal-800/70">
        Discagem → CPC → Sucesso EVA → Crivo → Gross → Entrega → Portado · janela rotulada em cada etapa
      </p>
      <ol className="flex flex-wrap gap-2">
        {etapas.map((e, i) => (
          <li key={e.id} className="flex min-w-[7.5rem] flex-1 items-stretch gap-2">
            <div className="flex-1 rounded-lg border border-teal-100 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-teal-700">{e.label}</span>
                <span className="rounded bg-slate-100 px-1 text-[9px] font-bold uppercase text-slate-500">{e.janela}</span>
              </div>
              <p className="text-xl font-black tabular-nums text-slate-900">{n(e.valor)}</p>
              {e.pctDoAnterior != null ? (
                <p className="text-[10px] text-teal-800">{e.pctDoAnterior}% da etapa anterior</p>
              ) : e.nota ? (
                <p className="text-[10px] text-slate-500">{e.nota}</p>
              ) : null}
            </div>
            {i < etapas.length - 1 ? (
              <span className="self-center text-teal-300" aria-hidden>
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
