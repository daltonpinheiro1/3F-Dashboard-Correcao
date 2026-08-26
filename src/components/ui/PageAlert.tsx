import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import type { ReactNode } from 'react';

type Variant = 'success' | 'error' | 'warning' | 'info';

const cfg: Record<Variant, { cls: string; Icon: typeof AlertCircle; role: 'alert' | 'status' }> = {
  success: { cls: 'page-alert-success', Icon: CheckCircle2, role: 'status' },
  error: { cls: 'page-alert-error', Icon: AlertCircle, role: 'alert' },
  warning: { cls: 'page-alert-warning', Icon: AlertTriangle, role: 'alert' },
  info: { cls: 'page-alert-info', Icon: Info, role: 'status' },
};

export function PageAlert({
  variant,
  children,
  onDismiss,
  className = '',
}: {
  variant: Variant;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const { cls, Icon, role } = cfg[variant];
  return (
    <div className={`page-alert ${cls} ${className}`} role={role} aria-live="polite">
      <Icon size={18} className="shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0 text-sm leading-relaxed">{children}</div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="page-alert-dismiss" aria-label="Fechar">
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}
