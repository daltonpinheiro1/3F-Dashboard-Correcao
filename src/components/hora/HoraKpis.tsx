import type { LucideIcon } from 'lucide-react';
import { Clock } from 'lucide-react';

export function MiniKpi({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string | number;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 ${warn ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
      <p className="text-[10px] font-semibold uppercase text-gray-400">{label}</p>
      <p className={`text-lg font-black ${warn ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500">{sub}</p>}
    </div>
  );
}

export function HoraKpi({
  label,
  value,
  sub,
  warn,
  icon: Icon = Clock,
}: {
  label: string;
  value: string | number;
  sub?: string;
  warn?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <div className={`card p-4 shadow-sm ${warn ? 'border-red-200 bg-red-50' : ''}`}>
      <p className="text-[10px] font-semibold uppercase text-gray-400 flex items-center gap-1">
        <Icon size={12} /> {label}
      </p>
      <p className={`text-2xl font-black ${warn ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

/** Alias legado usado na HoraPage. */
export const Kpi = HoraKpi;
