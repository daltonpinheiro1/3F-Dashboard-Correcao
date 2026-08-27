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

/** Painel DP: recusar/devolver com reformulação de medida (dias / advertência / suspensão). */
export function RecusaAjusteDpModal({
  item,
  onCancel,
  onConfirm,
}: {
  item: Advertencia;
  onCancel: () => void;
  onConfirm: (result: RecusaDpResult) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [touched, setTouched] = useState(false);
  const [nivelIdx, setNivelIdx] = useState(item.nivel_idx);
  const motivoId = useId();
  const invalid = !motivo.trim();
  const nivel = nivelPorIdx(nivelIdx);
  const mudou = nivelIdx !== item.nivel_idx;

  useEffect(() => {
    setMotivo('');
    setTouched(false);
    setNivelIdx(item.nivel_idx);
  }, [item.id, item.nivel_idx]);

  return (
    <ModalShell
      title="Recusar / reformular medida"
      subtitle={item.colaborador_nome}
      size="lg"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn-secondary text-xs" onClick={onCancel}>
            Voltar
          </button>
          <button
            type="button"
            className="btn-secondary text-xs text-red-700 border-red-200"
            disabled={invalid}
            onClick={() => {
              setTouched(true);
              if (invalid) return;
              onConfirm({ motivo: motivo.trim(), nivelIdx, acao: 'devolver' });
            }}
          >
            Devolver ao solicitante
          </button>
          <button
            type="button"
            className="btn-primary text-xs"
            disabled={invalid}
            onClick={() => {
              setTouched(true);
              if (invalid) return;
              onConfirm({ motivo: motivo.trim(), nivelIdx, acao: 'autorizar' });
            }}
          >
            {mudou ? 'Ajustar e autorizar' : 'Autorizar como está'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-xs text-gray-600">
          Medida enviada:{' '}
          <strong>
            {item.nivel_label}
            {item.dias_suspensao ? ` · ${item.dias_suspensao} dia(s)` : ''}
          </strong>
          . O DP pode aumentar dias, reduzir para advertência ou reformular a suspensão antes de
          devolver ou autorizar.
        </p>

        <NivelMedidaSelector
          nivelIdx={nivelIdx}
          sugerido={item.nivel_idx}
          onChange={setNivelIdx}
          onManualChange={() => undefined}
        />

        {mudou ? (
          <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
            Medida ajustada para <strong>{nivel.label}</strong>
            {nivel.diasSuspensao > 0 ? ` (${nivel.diasSuspensao} dia(s))` : ''}.
          </p>
        ) : null}

        <div>
          <label htmlFor={motivoId} className="block text-xs font-semibold text-gray-600 mb-1">
            Motivo / orientação ao solicitante
          </label>
          <textarea
            id={motivoId}
            className="input-field text-xs min-h-[88px]"
            placeholder="Ex.: dias insuficientes — elevar para 3; ou reformular para advertência escrita…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          {touched && invalid ? (
            <p className="text-[11px] text-red-600 mt-1">Informe o motivo da decisão.</p>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
