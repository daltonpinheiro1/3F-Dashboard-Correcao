import { useEffect, useId, useRef, type ReactNode } from 'react';
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

/** Pilha LIFO — Escape fecha só o modal do topo. */
const escapeStack: Array<() => void> = [];
let escapeBound = false;

function onGlobalEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopPropagation();
  escapeStack[escapeStack.length - 1]?.();
}

function pushEscape(fn: () => void) {
  escapeStack.push(fn);
  if (!escapeBound) {
    document.addEventListener('keydown', onGlobalEscape);
    escapeBound = true;
  }
}

function popEscape(fn: () => void) {
  const i = escapeStack.lastIndexOf(fn);
  if (i >= 0) escapeStack.splice(i, 1);
  if (escapeStack.length === 0 && escapeBound) {
    document.removeEventListener('keydown', onGlobalEscape);
    escapeBound = false;
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

export function ModalShell({ title, subtitle, children, footer, onClose, size = 'lg', badge }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const close = () => onCloseRef.current();
    pushEscape(close);
    document.body.style.overflow = 'hidden';

    const nodes = panel ? getFocusable(panel) : [];
    (nodes[0] || panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panel) return;
      const list = getFocusable(panel);
      if (list.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    panel?.addEventListener('keydown', onKeyDown);
    return () => {
      panel?.removeEventListener('keydown', onKeyDown);
      popEscape(close);
      document.body.style.overflow = escapeStack.length ? 'hidden' : '';
      prev?.focus();
    };
  }, []);

  const maxW = size === 'xl' ? 'max-w-5xl' : size === 'md' ? 'max-w-lg' : 'max-w-2xl';

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtitle ? descId : undefined}
    >
      <button type="button" className="modal-backdrop-hit" aria-label="Fechar" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className={`modal-panel ${maxW}`}>
        <div className="modal-header">
          <div className="min-w-0">
            {badge}
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {subtitle ? (
              <p id={descId} className="modal-subtitle">
                {subtitle}
              </p>
            ) : null}
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
