import { type LucideIcon } from 'lucide-react';

export type TabItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
  /** Ocultar label em telas muito estreitas (mostra só ícone) */
  compact?: boolean;
};

type Props = {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
  className?: string;
};

export function TabBar({ tabs, active, onChange, ariaLabel, size = 'md', className = '' }: Props) {
  const pad = size === 'sm' ? 'py-2 px-3 text-xs' : 'py-2.5 px-4 text-sm';

  return (
    <div
      className={`tab-bar-shell ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`tab-bar-item ${pad} ${isActive ? 'tab-bar-item-active' : ''}`}
          >
            {Icon ? <Icon size={size === 'sm' ? 14 : 16} className="shrink-0" aria-hidden /> : null}
            <span className={tab.compact ? 'hidden xs:inline' : ''}>{tab.label}</span>
            {tab.badge != null && tab.badge > 0 ? (
              <span className="tab-bar-badge">{tab.badge > 99 ? '99+' : tab.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Grupo de chips/filtros (ex.: campanha, hora) */
export type ChipItem = { id: string; label: string };

export function ChipBar({
  chips,
  active,
  onChange,
  ariaLabel,
  variant = 'neutral',
}: {
  chips: ChipItem[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  variant?: 'neutral' | 'brand';
}) {
  return (
    <div className="chip-bar-shell" role="group" aria-label={ariaLabel}>
      {chips.map((c) => {
        const on = c.id === active;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c.id)}
            className={`chip-bar-item ${on ? (variant === 'brand' ? 'chip-bar-item-brand' : 'chip-bar-item-active') : ''}`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
