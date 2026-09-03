import { useState } from 'react';
import { Clock, ExternalLink, FileCheck, FileHeart, FileX } from 'lucide-react';
import { KpiCard } from '../ui/KpiCard';
import { AtestadoDetailModal } from './AtestadoDetailModal';
import { STATUS_CHIP, STATUS_LABELS, TIPO_LABELS, type Atestado } from '../../lib/atestadosEscala';
import type { ResumoSupervisorLogado } from '../../lib/atestadosSupervisorGerencial';
import { getAtestadoArquivoUrl } from '../../lib/atestadosService';

export function SupervisorAtestadosPanel({
  resumo,
  onError,
}: {
  resumo: ResumoSupervisorLogado;
  onError?: (m: string) => void;
}) {
  const [detail, setDetail] = useState<Atestado | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const abrirPdfDireto = async (r: Atestado) => {
    if (pdfBusyId) return;
    setPdfBusyId(r.id);
    try {
      const res = await getAtestadoArquivoUrl(r.id);
      const href = res?.download_url || res?.archive_url || res?.url;
      if (href) {
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }
      if (res?.preview_unavailable) {
        onError?.(res.message || 'PDF só na pasta de rede do Controle DP por enquanto.');
        return;
      }
      onError?.('Arquivo ainda não disponível para abertura.');
    } catch (e: unknown) {
      onError?.(e instanceof Error ? e.message : 'Falha ao abrir documento');
    } finally {
      setPdfBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-indigo-950">Visão geral — suas solicitações</p>
        <p className="text-xs text-indigo-800 mt-0.5">
          Após o DP aprovar, use <strong>Abrir PDF</strong> para imprimir · atualiza a cada 2 min
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total enviados" value={resumo.total} icon={FileHeart} />
        <KpiCard label="Aguardando DP" value={resumo.pendentes} icon={Clock} warn={resumo.pendentes > 0} />
        <KpiCard label="Aprovados" value={resumo.aprovados} icon={FileCheck} />
        <KpiCard label="Recusados" value={resumo.recusados} icon={FileX} critical={resumo.recusados > 0} />
      </div>

      {resumo.recentes.length > 0 ? (
        <div className="card overflow-x-auto">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Últimas solicitações</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="p-3">Protocolo</th>
                <th className="p-3">Colaborador</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Status</th>
                <th className="p-3">Data</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {resumo.recentes.map((r) => {
                const temArquivo = Boolean(
                  r.arquivo_path || r.arquivo_cloud_archive_path || r.arquivo_thumb_path,
                );
                const isPdf =
                  String(r.arquivo_mime || '').includes('pdf') ||
                  /\.pdf$/i.test(String(r.arquivo_path || r.arquivo_cloud_archive_path || ''));
                const podePdf =
                  temArquivo && (r.status === 'aprovado' || r.status === 'arquivado');
                return (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="p-3 font-mono text-xs">{r.protocolo}</td>
                    <td className="p-3">{r.colaborador_nome}</td>
                    <td className="p-3 text-xs">{TIPO_LABELS[r.tipo]}</td>
                    <td className="p-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_CHIP[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-500">{r.data_inicio || r.created_at?.slice(0, 10)}</td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-xs text-blue-700 hover:underline"
                        onClick={() => setDetail(r)}
                      >
                        Ver
                      </button>
                      {podePdf ? (
                        <button
                          type="button"
                          className="text-xs text-violet-700 hover:underline inline-flex items-center gap-0.5"
                          disabled={pdfBusyId === r.id}
                          onClick={() => void abrirPdfDireto(r)}
                        >
                          {pdfBusyId === r.id ? 'Abrindo…' : isPdf ? 'Abrir PDF' : 'Abrir documento'}
                          <ExternalLink size={11} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center py-6">Nenhuma solicitação registrada ainda.</p>
      )}

      {detail ? (
        <AtestadoDetailModal
          item={detail}
          allowDpActions={false}
          onClose={() => setDetail(null)}
          onUpdated={(a) => setDetail(a)}
          onError={(m) => onError?.(m)}
        />
      ) : null}
    </div>
  );
}
