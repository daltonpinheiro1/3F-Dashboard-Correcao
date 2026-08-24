import { AlertTriangle } from 'lucide-react';

type Props = {
  stale?: boolean;
  ageMs?: number | null;
  updatedAt?: string | null;
};

export function StaleDataBanner({ stale, ageMs, updatedAt }: Props) {
  if (!stale) return null;
  const min = ageMs != null ? Math.round(ageMs / 60_000) : null;
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
      <div>
        <div className="font-semibold">Dados EVA possivelmente desatualizados</div>
        <div className="text-amber-900/90 text-xs mt-0.5">
          {min != null ? `Última atualização há ~${min} min.` : 'Idade do live.json desconhecida.'}
          {updatedAt ? ` Timestamp: ${updatedAt}.` : ''} Confira o sync na VM (cron */2) se persistir.
        </div>
      </div>
    </div>
  );
}
