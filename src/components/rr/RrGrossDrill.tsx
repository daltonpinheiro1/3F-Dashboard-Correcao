import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { Rr360ListaItem } from '../../lib/rr360';

export function RrGrossDrill({
  titulo,
  itens,
  onClose,
}: {
  titulo: string;
  itens: Rr360ListaItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/40 p-4 sm:items-center" role="dialog" aria-modal>
      <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-slate-900">{titulo}</p>
            <p className="text-[11px] text-slate-500">
              Até 80 propostas · clique fora ou Esc para fechar
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          {!itens.length ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Sem linhas neste recorte.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Proposta</th>
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-4 py-2">Classificação</th>
                  <th className="px-4 py-2">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((r, i) => (
                  <tr key={`${r.proposta_id}-${i}`} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono text-xs text-slate-900">{r.proposta_id}</td>
                    <td className="px-4 py-2 text-slate-700">{r.vendedor || '—'}</td>
                    <td className="px-4 py-2 text-slate-600">{r.classificacao || (r.tipos_erro?.length ? r.tipos_erro.join(', ') : '—')}</td>
                    <td className="px-4 py-2 text-slate-600">{r.ticket_status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
