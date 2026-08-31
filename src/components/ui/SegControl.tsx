import { Calendar, Zap, type LucideIcon } from 'lucide-react';
import { TabBar } from './TabBar';

export const LIVE_HIST_OPTIONS: { id: 'live' | 'hist'; label: string; icon: LucideIcon }[] = [
  { id: 'live', label: 'Realtime', icon: Zap },
  { id: 'hist', label: 'Histórico', icon: Calendar },
];

/** Controle segmentado padronizado — substitui Seg local das páginas EVA. */
export function SegControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; icon?: LucideIcon }[];
  ariaLabel: string;
}) {
  return (
    <TabBar
      size="sm"
      ariaLabel={ariaLabel}
      active={value}
      onChange={(id) => onChange(id as T)}
      tabs={options.map((o) => ({ id: o.id, label: o.label, icon: o.icon }))}
    />
  );
}
