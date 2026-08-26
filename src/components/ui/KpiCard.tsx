import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function KpiCard({
  label,
  value,
  icon: Icon,
  warn,
  critical,
  footer,
  className = '',
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  warn?: boolean;
  critical?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`kpi-card ${warn ? 'kpi-card-warn' : ''} ${critical ? 'kpi-card-critical' : ''} ${className}`}
    >
      <div className="kpi-card-header">
        <Icon size={14} aria-hidden />
        <span>{label}</span>
        {warn && Number(value) > 0 ? (
          <span className="kpi-card-badge">{value}</span>
        ) : null}
      </div>
      <p className="kpi-card-value">{value}</p>
      {footer ? <div className="kpi-card-footer">{footer}</div> : null}
    </div>
  );
}
