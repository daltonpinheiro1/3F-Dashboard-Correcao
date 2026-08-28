import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import {
  STATUS_CHIP,
  STATUS_LABELS,
  TIPO_LABELS,
  scoreRequisitos,
  type Atestado,
  type AtestadoStatus,
} from '../../lib/atestadosEscala';
import { getAtestadoArquivoUrl, updateAtestado } from '../../lib/atestadosService';
import { isAtestadoSmbPending } from '../../lib/atestadosSmbStatus';

export function AtestadoDetailModal({
  item,
  onClose,
  onUpdated,
  onError,
}: {
  item: Atestado;
  onClose: () => void;
  onUpdated: (a: Atestado) => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [recusa, setRecusa] = useState('');
  const [showRecusa, setShowRecusa] = useState(false);
  const [arquivoUrl, setArquivoUrl] = useState<string | null>(null);
  const [arquivoMeta, setArquivoMeta] = useState<{
    smb_unc?: string | null;
    is_thumbnail?: boolean;
    smb_pending?: boolean;
    smb_synced?: boolean;
    preview_unavailable?: boolean;
    message?: string;
    archive_url?: string | null;
  } | null>(null);
  const [arquivoLoading, setArquivoLoading] = useState(false);
  const smbPending = isAtestadoSmbPending(item) || Boolean(arquivoMeta?.smb_pending);

  useEffect(() => {
    if (!item.arquivo_path && !item.arquivo_thumb_path) {
      setArquivoUrl(null);
      setArquivoMeta(null);
      return;
    }
    let cancelled = false;
    setArquivoLoading(true);
    void getAtestadoArquivoUrl(item.id)
      .then((res) => {
        if (cancelled) return;
        setArquivoUrl(res?.url || null);
        setArquivoMeta(
          res
            ? {
                smb_unc: res.smb_unc,
                is_thumbnail: res.is_thumbnail,
                smb_pending: res.smb_pending,
                smb_synced: res.smb_synced,
                preview_unavailable: res.preview_unavailable,
                message: res.message,
                archive_url: res.archive_url,
              }
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setArquivoUrl(null);
          setArquivoMeta(null);
        }
      })
      .finally(() => {
        if (!cancelled) setArquivoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.arquivo_path, item.arquivo_thumb_path]);

  const decidir = async (status: AtestadoStatus, extra?: Partial<Atestado>) => {
    if (busy) return;
    if (status === 'recusado' && !recusa.trim()) {
      onError('Informe o motivo da recusa.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateAtestado(item.id, {
        status,
        recusa_motivo: status === 'recusado' ? recusa.trim() : undefined,
        ...extra,
      });
      onUpdated(updated);
      onClose();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const score = scoreRequisitos(item.ia_analise?.requisitos);
  const stClass = STATUS_CHIP[item.status] || STATUS_CHIP.protocolado;
  const isImage = /\.(jpe?g|png|webp|gif)$/i.test(item.arquivo_path || '') ||
    String(item.arquivo_mime || '').startsWith('image/');

  const footer = (
    <>
      {item.status === 'protocolado' || item.status === 'em_analise' ? (
        <>
          <button
            type="button"
            className="btn-secondary text-xs text-red-700"
            disabled={busy}
            onClick={() => setShowRecusa(true)}
          >
            Recusar
          </button>
          <button
            type="button"
            className="btn-primary text-xs"
            disabled={busy}
            onClick={() => void decidir('aprovado')}
          >
            <CheckCircle2 size={12} className="inline mr-1" /> Aprovar
          </button>
          {item.status === 'protocolado' && (
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={busy}
              onClick={() => void decidir('em_analise')}
            >
              Marcar em análise
            </button>
          )}
        </>
      ) : item.status === 'aprovado' ? (
        <button
          type="button"
          className="btn-secondary text-xs"
          disabled={busy}
          onClick={() => void decidir('arquivado')}
        >
          Arquivar
        </button>
      ) : null}
      <button type="button" className="btn-secondary text-xs ml-auto" onClick={onClose}>
        Fechar
      </button>
    </>
  );

  return (
    <ModalShell
      title={`Protocolo ${item.protocolo}`}
      subtitle={item.colaborador_nome}
      onClose={onClose}
      footer={footer}
      size="xl"
      badge={
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${stClass}`}>
          {STATUS_LABELS[item.status]}
        </span>
      }
    >
      <div className="space-y-4 text-sm">
        {(item.arquivo_path || item.arquivo_thumb_path) && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <span className="text-xs font-medium text-gray-600">
                {arquivoMeta?.is_thumbnail ? 'Miniatura (nuvem)' : 'Documento anexado'}
              </span>
              <div className="flex items-center gap-2">
                {smbPending && (
                  <span className="text-[9px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                    Aguardando rede
                  </span>
                )}
                {arquivoMeta?.smb_synced && (
                  <span className="text-[9px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Na pasta de rede
                  </span>
                )}
                {arquivoUrl && (
                  <a
                    href={arquivoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 flex items-center gap-1"
                  >
                    Abrir {arquivoMeta?.is_thumbnail ? 'miniatura' : ''} <ExternalLink size={12} />
                  </a>
                )}
                {arquivoMeta?.archive_url && (
                  <a
                    href={arquivoMeta.archive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-violet-600 flex items-center gap-1"
                  >
                    Completo (nuvem) <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
            {smbPending && arquivoMeta?.message && (
              <p className="text-xs text-amber-800 bg-amber-50 px-2 py-1 rounded mb-2">
                {arquivoMeta.message}
              </p>
            )}
            {arquivoLoading ? (
              <p className="text-xs text-gray-500 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Carregando visualização…
              </p>
            ) : arquivoUrl && isImage ? (
              <img
                src={arquivoUrl}
                alt="Atestado"
                className="max-h-64 mx-auto rounded object-contain"
              />
            ) : arquivoMeta?.preview_unavailable ? (
              <p className="text-xs text-amber-800 bg-amber-50 px-2 py-1 rounded">
                {arquivoMeta.message || 'Arquivo completo disponível apenas na rede.'}
              </p>
            ) : (
              <p className="font-mono text-[10px] break-all text-gray-500">{item.arquivo_path}</p>
            )}
            {arquivoMeta?.smb_unc && (
              <p className="mt-2 text-[10px] text-gray-600">
                <span className="font-medium">Arquivo completo (rede):</span>
                <br />
                <code className="break-all">{arquivoMeta.smb_unc}</code>
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-gray-500">Tipo</span>
            <p className="font-medium">{TIPO_LABELS[item.tipo]}</p>
          </div>
          <div>
            <span className="text-gray-500">Período</span>
            <p className="font-medium">
              {item.unidade_periodo === 'horas'
                ? `${item.quantidade_horas || 0}h`
                : `${item.quantidade_dias || 0} dia(s)`}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Datas</span>
            <p className="font-medium">
              {item.data_inicio || '—'}
              {item.data_fim ? ` → ${item.data_fim}` : ''}
            </p>
          </div>
          <div>
            <span className="text-gray-500">CID</span>
            <p className="font-medium">{item.cid || '—'}</p>
          </div>
          <div>
            <span className="text-gray-500">Médico / CRM</span>
            <p className="font-medium">
              {item.medico_nome || '—'}
              {item.crm_uf ? ` · ${item.crm_uf}` : ''}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Matrícula</span>
            <p className="font-medium">{item.colaborador_matricula || '—'}</p>
          </div>
        </div>

        {item.ia_analise?.resumo && (
          <div className="rounded-lg bg-violet-50 border border-violet-100 p-3 text-xs">
            <p className="font-medium text-violet-900 mb-1">Análise IA ({score}% requisitos)</p>
            <p className="text-violet-800">{item.ia_analise.resumo}</p>
            {item.ia_analise.alertas?.length ? (
              <ul className="mt-2 list-disc pl-4 text-amber-800">
                {item.ia_analise.alertas.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {item.observacoes && (
          <div>
            <span className="text-xs text-gray-500">Observações</span>
            <p className="text-sm mt-1">{item.observacoes}</p>
          </div>
        )}

        {item.recusa_motivo && (
          <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800">
            <XCircle size={12} className="inline mr-1" />
            {item.recusa_motivo}
          </div>
        )}

        {showRecusa && (
          <div className="space-y-2">
            <label className="text-xs text-gray-500">Motivo da recusa</label>
            <textarea
              className="input w-full min-h-[80px] text-sm"
              value={recusa}
              onChange={(e) => setRecusa(e.target.value)}
            />
            <button
              type="button"
              className="btn-secondary text-xs text-red-700"
              disabled={busy}
              onClick={() => void decidir('recusado')}
            >
              Confirmar recusa
            </button>
          </div>
        )}

        <p className="text-[10px] text-gray-400">
          Protocolado por {item.criado_por_nome || item.criado_por_email || '—'} em{' '}
          {new Date(item.created_at).toLocaleString('pt-BR')}
          {item.arquivo_hash_sha256 && (
            <>
              <br />
              Hash SHA-256: <code className="text-[9px]">{item.arquivo_hash_sha256.slice(0, 16)}…</code>
            </>
          )}
        </p>
      </div>
    </ModalShell>
  );
}
