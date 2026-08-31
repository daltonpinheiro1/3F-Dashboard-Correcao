import type { LucideIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';

export function KpiCard({
  label,
  value,
  icon: Icon,
  warn,
  critical,
  footer,
  janela,
  className = '',
  onClick,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  warn?: boolean;
  critical?: boolean;
  footer?: ReactNode;
  janela?: string;
  className?: string;
  onClick?: () => void;
}) {
  const cls = `kpi-card ${warn ? 'kpi-card-warn' : ''} ${critical ? 'kpi-card-critical' : ''} ${
    onClick ? 'w-full cursor-pointer text-left' : ''
  } ${className}`;

  const inner = (
    <>
      <div className="kpi-card-header">
        <Icon size={14} aria-hidden />
        <span>{label}</span>
        {janela ? (
          <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
            {janela}
          </span>
        ) : warn && Number(value) > 0 ? (
          <span className="kpi-card-badge">{value}</span>
        ) : null}
      </div>
      <p className="kpi-card-value">{value}</p>
      {footer ? <div className="kpi-card-footer">{footer}</div> : null}
    </>
  );

  if (onClick) {
    const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    };
    return (
      <div
        role="button"
        tabIndex={0}
        className={cls}
        onClick={onClick}
        onKeyDown={onKey}
        aria-label={`${label}: ${value}. Abrir detalhe.`}
      >
        {inner}
      </div>
    );
  }

  return <div className={cls}>{inner}</div>;
}
