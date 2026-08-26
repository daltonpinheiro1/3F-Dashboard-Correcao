import type { Advertencia } from '../../lib/advertenciasEscala';
import { fmtDateTime } from './format';

export function EntregaTimeline({ item }: { item: Advertencia }) {
  const steps = [
    { ok: true, label: 'Solicitação criada', quando: item.created_at },
    {
      ok: item.status !== 'pendente',
      label: item.status === 'recusada' ? 'Devolvida pelo DP' : 'Aprovada pelo DP',
      quando: item.aprovado_em,
    },
    {
      ok:
        item.entrega_status === 'impressa' ||
        item.entrega_status === 'entregue' ||
        item.entrega_status === 'recusada_ciencia',
      label: 'Documento impresso',
      quando: item.impressa_em,
    },
    {
      ok: item.entrega_status === 'entregue' || item.entrega_status === 'recusada_ciencia',
      label:
        item.entrega_status === 'recusada_ciencia' ? 'Recusa de ciência registrada' : 'Entrega confirmada',
      quando: item.entregue_em,
    },
  ];
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase text-gray-500 mb-2">Trilha de entrega</p>
      <ol className="space-y-1">
        {steps.map((s) => (
          <li key={s.label} className={`text-xs flex items-center gap-2 ${s.ok ? 'text-gray-800' : 'text-gray-400'}`}>
            <span className={`w-2 h-2 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            {s.label}
            {s.ok && s.quando ? <span className="text-gray-400">· {fmtDateTime(s.quando)}</span> : null}
          </li>
        ))}
      </ol>
      {item.entrega_observacao ? (
        <p className="text-[10px] text-gray-500 mt-2">Obs. entrega: {item.entrega_observacao}</p>
      ) : null}
    </div>
  );
}
