import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { SortDir } from '../lib/tableSort';

type Align = 'left' | 'right' | 'center';

const ALIGN: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

const JUSTIFY: Record<Align, string> = {
  left: 'justify-start',
  right: 'justify-end',
  center: 'justify-center',
};

export function SortTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
  className = '',
  title,
}: {
  label: ReactNode;
  col: string;
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (col: string) => void;
  align?: Align;
  className?: string;
  title?: string;
}) {
  const active = sortKey === col;
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={`${ALIGN[align]} px-3 py-2 font-semibold ${className}`}
      title={title || (typeof label === 'string' ? `Ordenar por ${label}` : undefined)}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 w-full ${JUSTIFY[align]} hover:text-indigo-700 transition-colors select-none`}
      >
        <span>{label}</span>
        <Icon size={12} className={active ? 'text-indigo-600 shrink-0' : 'text-gray-300 shrink-0'} aria-hidden />
      </button>
    </th>
  );
}
