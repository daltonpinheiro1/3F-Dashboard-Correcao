import { useEffect, useId, useState } from 'react';
import type { Advertencia } from '../../lib/advertenciasEscala';
import { nivelPorIdx } from '../../lib/advertenciasEscala';
import { ModalShell } from '../ui/ModalShell';
import { NivelMedidaSelector } from './NivelMedidaSelector';

export type RecusaDpResult = {
  motivo: string;
  nivelIdx: number;
  /** devolver = recusada com medida sugerida; autorizar = aprovar já com a medida ajustada */
  acao: 'devolver' | 'autorizar';
};

/** Painel DP: decidir medida (devolver ou autorizar, com reformulação opcional). */
export function RecusaAjusteDpModal({
  item,
  busy = false,
  onCancel,
  onConfirm,
}: {
  item: Advertencia;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (result: RecusaDpResult) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [touched, setTouched] = useState(false);
  const [nivelIdx, setNivelIdx] = useState(item.nivel_idx);
  const motivoId = useId();
  const nivel = nivelPorIdx(nivelIdx);
  const original = nivelPorIdx(item.nivel_idx);
  const mudou = nivelIdx !== item.nivel_idx;
  /** Motivo obrigatório ao devolver; ao autorizar com mudança, também. */
  const motivoObrigatorioPara = (acao: RecusaDpResult['acao']) =>
    acao === 'devolver' || (acao === 'autorizar' && mudou);
  const motivoIdOk = Boolean(motivo.trim());

  useEffect(() => {
    setMotivo('');
    setTouched(false);
    setNivelIdx(item.nivel_idx);
  }, [item.id, item.nivel_idx]);

  const submit = (acao: RecusaDpResult['acao']) => {
    setTouched(true);
    if (busy) return;
    if (motivoObrigatorioPara(acao) && !motivoIdOk) return;
    onConfirm({ motivo: motivo.trim(), nivelIdx, acao });
  };

  return (
    <ModalShell
      title="Decidir medida"
      subtitle={item.colaborador_nome}
      size="lg"
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={onCancel}>
            Voltar
          </button>
          <button
            type="button"
            className="btn-secondary text-xs text-red-700 border-red-200"
            disabled={busy || (touched && motivoObrigatorioPara('devolver') && !motivoIdOk)}
            onClick={() => submit('devolver')}
          >
            {busy ? 'Aguarde…' : 'Devolver ao solicitante'}
          </button>
          <button
            type="button"
            className="btn-primary text-xs"
            disabled={busy || (touched && motivoObrigatorioPara('autorizar') && !motivoIdOk)}
            onClick={() => submit('autorizar')}
          >
            {busy ? 'Aguarde…' : mudou ? 'Ajustar e autorizar' : 'Autorizar como está'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-xs text-gray-600">
          Use <strong>Aprovar</strong> na lista para autorizar sem alterar. Este painel é para{' '}
          <strong>devolver</strong> ou <strong>reformular</strong> (dias / advertência / suspensão) e
          então autorizar.
        </p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 space-y-1">
          <p>
            <span className="text-gray-500">Solicitado:</span>{' '}
            <strong>
              {original.label}
              {original.diasSuspensao ? ` · ${original.diasSuspensao} dia(s)` : ''}
            </strong>
          </p>
          <p>
            <span className="text-gray-500">Decisão:</span>{' '}
            <strong>
              {nivel.label}
              {nivel.diasSuspensao ? ` · ${nivel.diasSuspensao} dia(s)` : ''}
            </strong>
            {mudou ? <span className="ml-1 text-amber-700 font-medium">· alterado</span> : null}
          </p>
        </div>

        <NivelMedidaSelector
          nivelIdx={nivelIdx}
          sugerido={item.nivel_idx}
          onChange={setNivelIdx}
          onManualChange={() => undefined}
        />

        {mudou ? (
          <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
            De <strong>{original.label}</strong>
            {original.diasSuspensao ? ` (${original.diasSuspensao}d)` : ''} →{' '}
            <strong>{nivel.label}</strong>
            {nivel.diasSuspensao ? ` (${nivel.diasSuspensao}d)` : ''}. O pedido original fica
            registrado.
          </p>
        ) : null}

        <div>
          <label htmlFor={motivoId} className="block text-xs font-semibold text-gray-600 mb-1">
            Motivo / orientação
            <span className="font-normal text-gray-400">
              {' '}
              (obrigatório ao devolver; obrigatório se alterar a medida)
            </span>
          </label>
          <textarea
            id={motivoId}
            className="input-field text-xs min-h-[88px]"
            disabled={busy}
            placeholder="Ex.: dias insuficientes — elevar para 3; ou reformular para advertência escrita…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {touched && !motivoIdOk ? (
            <p className="text-[11px] text-gray-500 mt-1">
              Preencha o motivo se for devolver ou se a medida foi alterada.
            </p>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
