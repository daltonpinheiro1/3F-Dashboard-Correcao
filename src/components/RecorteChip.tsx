import { X } from 'lucide-react';
import { recorteAtivo, rotuloRecorte, type Recorte } from '../lib/recorteFiltro';

export function RecorteChip({ recorte, onLimpar }: { recorte: Recorte; onLimpar: () => void }) {
  if (!recorteAtivo(recorte)) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap" role="status">
      <span className="badge bg-blue-50 text-blue-700 text-xs font-semibold">
        Filtrado: {rotuloRecorte(recorte)}
      </span>
      <button
        type="button"
        onClick={onLimpar}
        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700"
      >
        <X size={12} aria-hidden /> Limpar filtro
      </button>
    </div>
  );
}
