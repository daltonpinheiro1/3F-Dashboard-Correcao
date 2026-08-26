import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'md' | 'lg' | 'xl';
  badge?: ReactNode;
};

export function ModalShell({ title, subtitle, children, footer, onClose, size = 'lg', badge }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [onClose]);

  const maxW = size === 'xl' ? 'max-w-5xl' : size === 'md' ? 'max-w-lg' : 'max-w-2xl';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button type="button" className="modal-backdrop-hit" aria-label="Fechar" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`modal-panel ${maxW}`}
      >
        <div className="modal-header">
          <div className="min-w-0">
            {badge}
            <h2 id="modal-title" className="modal-title">{title}</h2>
            {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
