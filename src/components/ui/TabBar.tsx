import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
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

type Indicator = { x: number; w: number; ready: boolean };

export function TabBar({ tabs, active, onChange, ariaLabel, size = 'md', className = '' }: Props) {
  const pad = size === 'sm' ? 'py-2 px-3 text-xs' : 'py-2.5 px-4 text-sm';
  const iconPx = size === 'sm' ? 14 : 16;
  const rootRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<Indicator>({ x: 0, w: 0, ready: false });

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const btn = root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!btn) return;
    const x = btn.offsetLeft;
    const w = btn.offsetWidth;
    setInd((prev) => {
      if (prev.ready && prev.x === x && prev.w === w) return prev;
      return { x, w, ready: true };
    });
  }, [active, tabs.length]);

  useLayoutEffect(() => {
    measure();
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    root.querySelectorAll('[role="tab"]').forEach((el) => ro.observe(el));
    root.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      root.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    const i = tabs.findIndex((t) => t.id === active);
    if (i < 0) return;
    e.preventDefault();
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else next = tabs.length - 1;
    const id = tabs[next].id;
    onChange(id);
    requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLButtonElement>(`[id="tab-${id}"]`)?.focus();
    });
  };

  return (
    <div
      ref={rootRef}
      className={`tab-bar-shell ${ind.ready ? 'tab-bar-shell-ready' : ''} ${className}`}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      <span
        className="tab-bar-indicator"
        aria-hidden
        style={{
          width: ind.w,
          transform: `translate3d(${ind.x}px, 0, 0)`,
          opacity: ind.ready ? 1 : 0,
        }}
      />
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
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`tab-bar-item ${pad} ${isActive ? 'tab-bar-item-active' : ''}`}
          >
            {Icon ? <Icon size={iconPx} className="tab-bar-icon shrink-0" strokeWidth={isActive ? 2.25 : 1.85} aria-hidden /> : null}
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

/** Grupo de chips/filtros (ex.: campanha, hora, inbox DP) */
export type ChipItem = { id: string; label: string; badge?: number; icon?: LucideIcon };

export function ChipBar({
  chips,
  active,
  onChange,
  ariaLabel,
  variant = 'neutral',
  className = '',
}: {
  chips: ChipItem[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  variant?: 'neutral' | 'brand';
  className?: string;
}) {
  return (
    <div className={`chip-bar-shell ${className}`} role="group" aria-label={ariaLabel}>
      {chips.map((c) => {
        const on = c.id === active;
        const Icon = c.icon;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c.id)}
            className={`chip-bar-item ${on ? (variant === 'brand' ? 'chip-bar-item-brand' : 'chip-bar-item-active') : ''}`}
          >
            {Icon ? <Icon size={13} className="shrink-0 opacity-80" strokeWidth={on ? 2.2 : 1.8} aria-hidden /> : null}
            <span>{c.label}</span>
            {c.badge != null && c.badge > 0 ? (
              <span className="chip-bar-badge">{c.badge > 99 ? '99+' : c.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
