import { useState } from 'react';
import { CheckCircle2, Printer } from 'lucide-react';
import type { Advertencia } from '../../lib/advertenciasEscala';
import { requerAprovacaoDp } from '../../lib/advertenciasEscala';
import {
  ENTREGA_CLS,
  ENTREGA_LABEL,
  ENTREGA_MODO_LABEL,
  podeConfirmarEntrega,
  podeEmitirPdfOficial,
  podeMarcarImpressa,
  type EntregaModo,
} from '../../lib/advertenciasEntrega';
import { isMinhaSolicitacao, NOTIFICACAO_LABEL } from '../../lib/advertenciasNotificacao';
import { gestorDaAdvertencia } from '../../lib/advertenciasGestor';
import { STATUS_CLS, STATUS_LABEL } from '../../lib/advertenciasService';
import { ModalShell } from '../ui/ModalShell';
import { EntregaTimeline } from './EntregaTimeline';
import { fmtDate, fmtDateTime } from './format';

export function AdvertenciaDetailModal({
  item,
  hist,
  allowDpActions,
  userEmail,
  onClose,
  onAprovar,
  onRecusar,
  onPdf,
  pdfAmbiente = 'any',
  onMarcarImpressa,
  onConfirmarEntrega,
  onReenviarNotificacao,
}: {
  item: Advertencia;
  hist: Advertencia[];
  /** true = ambiente Controle DP (aprovar/recusar/entrega). false = só visualização. */
  allowDpActions: boolean;
  userEmail: string;
  onClose: () => void;
  onAprovar: () => void;
  onRecusar: () => void;
  onPdf: () => void;
  pdfAmbiente?: 'gestao' | 'dp' | 'any';
  onMarcarImpressa: () => void;
  onConfirmarEntrega: (modo: EntregaModo, obs: string) => void;
  onReenviarNotificacao: () => void;
}) {
  const [modoEntrega, setModoEntrega] = useState<EntregaModo>('assinatura_colaborador');
  const [obsEntrega, setObsEntrega] = useState('');
  const minha = isMinhaSolicitacao(item, userEmail);
  const podePdf = podeEmitirPdfOficial(item, { ambiente: pdfAmbiente });

  const footer = (
    <>
      {podePdf ? (
        <button type="button" className="btn-secondary text-xs" onClick={onPdf}>
          Emitir PDF
        </button>
      ) : (
        <span className="text-[10px] text-gray-400 self-center">
          {item.status === 'pendente'
            ? 'PDF só após aprovação do DP'
            : 'PDF indisponível para este status'}
        </span>
      )}
      {allowDpActions && item.criado_por_email && (item.status === 'aprovada' || item.status === 'recusada') && (
        <button type="button" className="btn-secondary text-xs" onClick={() => void onReenviarNotificacao()}>
          Reenviar e-mail
        </button>
      )}
      {allowDpActions && item.status === 'pendente' && requerAprovacaoDp(item.nivel_idx) && (
        <>
          <button type="button" className="btn-secondary text-xs text-red-700" onClick={onRecusar}>
            Decidir / ajustar
          </button>
          <button type="button" className="btn-primary text-xs" onClick={onAprovar}>
            <CheckCircle2 size={12} className="inline mr-1" /> Aprovar
          </button>
        </>
      )}
    </>
  );

  return (
    <ModalShell
      title="Detalhe da advertência"
      subtitle={item.colaborador_nome}
      size="lg"
      onClose={onClose}
      badge={
        minha ? (
          <p className="text-[10px] text-brand-navy font-medium mb-0.5">Sua solicitação</p>
        ) : null
      }
      footer={footer}
    >
      <div className="space-y-3 text-sm">
        <p>
          <span className="text-gray-500">Colaborador:</span> <strong>{item.colaborador_nome}</strong>
        </p>
        <p>
          <span className="text-gray-500">Gestor:</span>{' '}
          <strong>{gestorDaAdvertencia(item) || '—'}</strong>
        </p>
        <p className="text-xs text-gray-500">
          Registrado por: {item.criado_por_nome || '—'}
          {item.criado_por_email ? ` (${item.criado_por_email})` : ''}
        </p>
        <p>
          <span className="text-gray-500">Nível:</span> {item.nivel_label}{' '}
          <span className={`badge ${STATUS_CLS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
          {item.entrega_status ? (
            <span className={`ml-1 badge ${ENTREGA_CLS[item.entrega_status]}`}>
              {ENTREGA_LABEL[item.entrega_status]}
            </span>
          ) : null}
        </p>
        {item.nivel_solicitado_idx != null && item.nivel_solicitado_idx !== item.nivel_idx ? (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Solicitado originalmente:{' '}
            <strong>{item.nivel_solicitado_label || `nível ${item.nivel_solicitado_idx}`}</strong>
            {' → '}
            decisão: <strong>{item.nivel_label}</strong>
          </p>
        ) : null}
        {item.aprovado_por_nome && (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            {item.status === 'recusada' ? 'Devolvida' : 'Aprovada'} por <strong>{item.aprovado_por_nome}</strong>
            {item.aprovado_em ? ` em ${fmtDateTime(item.aprovado_em)}` : ''}
            {item.recusa_motivo ? (
              <span className="block mt-1 text-red-700">Motivo: {item.recusa_motivo}</span>
            ) : null}
          </p>
        )}
        {item.notificacao_status && item.notificacao_status !== 'desativada' && (
          <p className="text-xs text-gray-600">
            E-mail solicitante: {NOTIFICACAO_LABEL[item.notificacao_status]}
            {item.notificacao_enviada_em ? ` · ${fmtDateTime(item.notificacao_enviada_em)}` : ''}
            {item.notificacao_erro ? (
              <span className="block text-red-600">{item.notificacao_erro}</span>
            ) : null}
          </p>
        )}
        <EntregaTimeline item={item} />
        <p>
          <span className="text-gray-500">Motivo:</span> {item.motivo_categoria} — {item.motivo_texto}
        </p>
        <p className="text-gray-700 whitespace-pre-wrap">{item.descricao}</p>
        {item.observacoes_supervisor && (
          <p className="text-xs text-gray-500">Obs. supervisor: {item.observacoes_supervisor}</p>
        )}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">Histórico do colaborador ({hist.length})</p>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {hist.map((h) => (
              <li key={h.id} className="text-xs text-gray-600 border-b border-gray-50 py-1">
                {fmtDate(h.data_ocorrido)} · {h.nivel_label} · {STATUS_LABEL[h.status]}
              </li>
            ))}
          </ul>
        </div>

        {allowDpActions && podeMarcarImpressa(item) && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs space-y-2">
            <p className="font-semibold text-sky-900">Controle de entrega — passo 1</p>
            <p className="text-sky-800">Após gerar o PDF, registre que o documento foi impresso.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs inline-flex items-center gap-1" onClick={onPdf}>
                <Printer size={12} /> Baixar PDF
              </button>
              <button type="button" className="btn-primary text-xs" onClick={onMarcarImpressa}>
                Marcar como impresso
              </button>
            </div>
          </div>
        )}

        {allowDpActions && podeConfirmarEntrega(item) && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 text-xs space-y-2">
            <p className="font-semibold text-indigo-900">Controle de entrega — passo 2</p>
            <p className="text-indigo-800">
              Confirme como o documento foi entregue ao colaborador ou protocolado no DP.
            </p>
            <select
              className="input-field text-xs"
              value={modoEntrega}
              onChange={(e) => setModoEntrega(e.target.value as EntregaModo)}
            >
              {(Object.keys(ENTREGA_MODO_LABEL) as EntregaModo[]).map((k) => (
                <option key={k} value={k}>
                  {ENTREGA_MODO_LABEL[k]}
                </option>
              ))}
            </select>
            <textarea
              className="input-field text-xs min-h-[60px]"
              placeholder="Observação / nº protocolo / testemunhas (opcional)"
              value={obsEntrega}
              onChange={(e) => setObsEntrega(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={() => onConfirmarEntrega(modoEntrega, obsEntrega)}
            >
              Confirmar entrega / protocolo
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
