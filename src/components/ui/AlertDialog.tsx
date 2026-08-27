import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ModalShell } from './ModalShell';

type Props = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  /** Se definido, exige texto não vazio para confirmar. */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

/** Diálogo de confirmação (padrão Linear/shadcn) — substitui window.prompt/confirm. */
export function AlertDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  requireReason = false,
  reasonLabel = 'Motivo',
  reasonPlaceholder = '',
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reasonId = useId();

  useEffect(() => {
    if (!open) {
      setReason('');
      setTouched(false);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const invalid = requireReason && !reason.trim();
  const confirmCls =
    tone === 'danger'
      ? 'btn-primary text-xs bg-red-600 hover:bg-red-700 border-red-600'
      : 'btn-primary text-xs';

  return (
    <ModalShell
      title={title}
      size="md"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn-secondary text-xs" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmCls}
            disabled={invalid}
            onClick={() => {
              setTouched(true);
              if (invalid) return;
              onConfirm(reason.trim());
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {description ? <div className="text-gray-600">{description}</div> : null}
        {requireReason && (
          <div>
            <label htmlFor={reasonId} className="block text-xs font-medium text-gray-600 mb-1">
              {reasonLabel} <span className="text-red-600">*</span>
            </label>
            <textarea
              ref={inputRef}
              id={reasonId}
              className={`input-field text-sm min-h-[88px] ${touched && invalid ? 'border-red-400' : ''}`}
              placeholder={reasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-required
              aria-invalid={touched && invalid}
            />
            {touched && invalid ? (
              <p className="text-xs text-red-600 mt-1" role="alert">
                Informe o motivo para continuar.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
