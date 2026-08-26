import { TabBar } from './TabBar';

/** Controle segmentado padronizado — substitui Seg local das páginas EVA. */
export function SegControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <TabBar
      size="sm"
      ariaLabel={ariaLabel}
      active={value}
      onChange={(id) => onChange(id as T)}
      tabs={options.map((o) => ({ id: o.id, label: o.label }))}
    />
  );
}
