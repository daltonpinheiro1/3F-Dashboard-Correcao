import { useEffect, useRef } from 'react';
import { XCircle } from 'lucide-react';
import type { Advertencia } from '../lib/advertenciasEscala';
import { TEXTO_MODELO_OFICIAL } from '../lib/advertenciasEscala';

type Props = {
  draft: Advertencia;
  onClose: () => void;
};

/**
 * Prévia somente visual (como “foto” do documento).
 * Sem baixar/imprimir — PDF oficial só após aprovação do DP (ou auto-aprovação).
 */
export function AdvertenciaPreviewModal({ draft, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const motivoDoc = draft.motivo_texto || draft.motivo_categoria;
  const clausula = TEXTO_MODELO_OFICIAL(motivoDoc);
  const dataBr = draft.data_ocorrido
    ? new Date(`${draft.data_ocorrido}T12:00:00`).toLocaleDateString('pt-BR')
    : '—';

  useEffect(() => {
    const blockPrint = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeprint', blockPrint);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('beforeprint', blockPrint);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 md:p-6 print:hidden"
      role="dialog"
      aria-modal
      aria-label="Prévia visual sem impressão"
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
        }
      `}</style>
      <div
        ref={panelRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden select-none"
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
      >
        <div className="px-4 md:px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 inline-block px-2 py-0.5 rounded">
              Prévia visual — sem impressão
            </p>
            <h3 className="text-sm font-bold text-gray-900 mt-1">Documento de Ação Disciplinar</h3>
            <p className="text-xs text-gray-500">
              {draft.colaborador_nome} · {draft.nivel_label} · {draft.motivo_categoria}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1" aria-label="Fechar">
            <XCircle size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 bg-stone-200/80">
          <div className="relative mx-auto max-w-2xl bg-white shadow-lg border border-stone-300 px-8 py-10 pointer-events-none">
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
              aria-hidden
            >
              <span
                className="text-red-500/15 text-4xl md:text-5xl font-black uppercase tracking-widest -rotate-12 whitespace-nowrap"
              >
                Prévia · sem valor
              </span>
            </div>
            <p className="text-center text-[11px] font-bold uppercase tracking-wide text-gray-500">
              3F · Ação disciplinar
            </p>
            <h4 className="text-center text-base font-bold text-gray-900 mt-2 mb-6">
              {draft.nivel_label}
              {(draft.dias_suspensao ?? 0) > 0 ? ` — ${draft.dias_suspensao} dia(s)` : ''}
            </h4>
            <dl className="text-xs text-gray-700 space-y-2 mb-5">
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-gray-400">Colaborador</dt>
                <dd className="font-medium">{draft.colaborador_nome}</dd>
              </div>
              {draft.colaborador_matricula ? (
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-gray-400">Matrícula</dt>
                  <dd>{draft.colaborador_matricula}</dd>
                </div>
              ) : null}
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-gray-400">Data</dt>
                <dd>{dataBr}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-gray-400">Motivo</dt>
                <dd>
                  {draft.motivo_categoria}
                  {draft.motivo_texto ? ` — ${draft.motivo_texto}` : ''}
                </dd>
              </div>
            </dl>
            <p className="text-[11px] text-gray-600 leading-relaxed mb-4">{clausula}</p>
            {draft.descricao && !draft.descricao.startsWith('(') ? (
              <p className="text-xs text-gray-800 whitespace-pre-wrap border-t border-gray-100 pt-3">
                {draft.descricao}
              </p>
            ) : (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Descrição ainda vazia — complete antes de salvar.
              </p>
            )}
            <p className="mt-8 text-[10px] text-center text-gray-400">
              Visualização apenas · impressão/PDF só após aprovação do DP (quando exigida)
            </p>
          </div>
        </div>

        <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-500 text-center">
          Esta tela não libera impressão nem download. O PDF oficial fica disponível somente para
          documentos aprovados.
        </div>
      </div>
    </div>
  );
}
