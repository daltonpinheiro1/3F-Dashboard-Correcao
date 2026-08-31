import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Variant = 'success' | 'error' | 'warning' | 'info';

const cfg: Record<Variant, { cls: string; Icon: typeof AlertCircle; role: 'alert' | 'status' }> = {
  success: { cls: 'page-alert-success', Icon: CheckCircle2, role: 'status' },
  error: { cls: 'page-alert-error', Icon: AlertCircle, role: 'alert' },
  warning: { cls: 'page-alert-warning', Icon: AlertTriangle, role: 'alert' },
  info: { cls: 'page-alert-info', Icon: Info, role: 'status' },
};

const AUTO_DISMISS_MS: Record<Variant, number | null> = {
  success: 5200,
  info: 5200,
  warning: null,
  error: null,
};

export function PageAlert({
  variant,
  children,
  onDismiss,
  className = '',
  /** Popup flutuante (padrão). `false` mantém o banner no fluxo da página. */
  floating = true,
}: {
  variant: Variant;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
  floating?: boolean;
}) {
  const { cls, Icon, role } = cfg[variant];
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const ms = AUTO_DISMISS_MS[variant];
    // Só auto-fecha se houver callback — evita timer inútil e reset por `children` instável
    if (!ms || !floating || !onDismiss) return;
    const t = window.setTimeout(() => onDismissRef.current?.(), ms);
    return () => window.clearTimeout(t);
  }, [variant, floating, onDismiss]);

  const node = (
    <div
      className={`page-alert ${cls} ${floating ? 'page-alert-toast' : ''} ${className}`}
      role={role}
      aria-live="polite"
    >
      <Icon size={18} className="shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0 text-sm leading-relaxed">{children}</div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="page-alert-dismiss" aria-label="Fechar">
          <X size={16} />
        </button>
      ) : null}
    </div>
  );

  if (floating && typeof document !== 'undefined') {
    const root = document.getElementById('toast-root');
    if (root) return createPortal(node, root);
  }
  return node;
}
