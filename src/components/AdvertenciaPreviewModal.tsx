import { useEffect, useRef, useState } from 'react';
import { Download, Printer, XCircle } from 'lucide-react';
import type { Advertencia } from '../lib/advertenciasEscala';
import { TEXTO_MODELO_OFICIAL } from '../lib/advertenciasEscala';
import { downloadPdfBlob, gerarPdfAdvertencia } from '../lib/advertenciasPdf';

type Props = {
  draft: Advertencia;
  onClose: () => void;
};

export function AdvertenciaPreviewModal({ draft, onClose }: Props) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setErro('');
    void (async () => {
      try {
        const b = await gerarPdfAdvertencia(draft);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      } catch (e: unknown) {
        if (!cancelled) setErro(e instanceof Error ? e.message : 'Falha ao gerar prévia');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [draft]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const filename = `previa_advertencia_${(draft.colaborador_matricula || draft.colaborador_nome).replace(/\s+/g, '_')}.pdf`;

  const imprimir = () => {
    const w = iframeRef.current?.contentWindow;
    if (w) w.print();
  };

  const baixar = () => {
    if (blob) downloadPdfBlob(blob, filename);
  };

  const motivoDoc = draft.motivo_texto || draft.motivo_categoria;
  const clausula = TEXTO_MODELO_OFICIAL(motivoDoc);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 md:p-6" role="dialog">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 inline-block px-2 py-0.5 rounded">
              Prévia — não salvo
            </p>
            <h3 className="text-sm font-bold text-gray-900 mt-1">Documento de Ação Disciplinar</h3>
            <p className="text-xs text-gray-500">
              {draft.colaborador_nome} · {draft.nivel_label} · {draft.motivo_categoria}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1"
              disabled={!blob || loading}
              onClick={imprimir}
            >
              <Printer size={14} /> Imprimir
            </button>
            <button
              type="button"
              className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1"
              disabled={!blob || loading}
              onClick={baixar}
            >
              <Download size={14} /> Baixar PDF
            </button>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1" aria-label="Fechar">
              <XCircle size={20} />
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
          <aside className="md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-gray-100 p-4 overflow-y-auto text-xs space-y-3 bg-gray-50/80">
            <div>
              <p className="font-semibold text-gray-600 mb-1">Resumo</p>
              <ul className="space-y-1 text-gray-700">
                <li>
                  <span className="text-gray-400">Submotivo:</span> {draft.motivo_texto}
                </li>
                <li>
                  <span className="text-gray-400">Data:</span>{' '}
                  {new Date(`${draft.data_ocorrido}T12:00:00`).toLocaleDateString('pt-BR')}
                </li>
                {draft.colaborador_matricula ? (
                  <li>
                    <span className="text-gray-400">Matrícula:</span> {draft.colaborador_matricula}
                  </li>
                ) : null}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-600 mb-1">Cláusula CLT 482 (modelo)</p>
              <p className="text-gray-600 leading-relaxed text-[11px] border border-gray-200 rounded-lg p-2 bg-white max-h-40 overflow-y-auto">
                {clausula}
              </p>
            </div>
            {draft.descricao && !draft.descricao.startsWith('(') ? (
              <div>
                <p className="font-semibold text-gray-600 mb-1">Narrativa</p>
                <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{draft.descricao}</p>
              </div>
            ) : (
              <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                Descrição ainda vazia — a prévia mostra o modelo; complete antes de salvar.
              </p>
            )}
          </aside>

          <div className="flex-1 min-h-[50vh] md:min-h-0 bg-gray-200 relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
                Gerando prévia PDF…
              </div>
            )}
            {erro && (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-sm text-red-600">{erro}</div>
            )}
            {url && !erro && (
              <iframe
                ref={iframeRef}
                title="Prévia PDF advertência"
                src={url}
                className="w-full h-full min-h-[50vh] md:min-h-0 border-0 bg-white"
              />
            )}
          </div>
        </div>

        <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 text-center">
          Revise o layout antes de salvar. O registro oficial só é criado ao confirmar no formulário.
        </div>
      </div>
    </div>
  );
}
