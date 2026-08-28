import type { ReactNode } from 'react';

export function atestadoInputClass(opts?: { ia?: boolean; pendente?: boolean }): string {
  const base = 'input-field w-full text-gray-900';
  if (opts?.ia) {
    return `${base} border-emerald-400 bg-emerald-50/80 font-semibold placeholder:text-gray-500`;
  }
  if (opts?.pendente) {
    return `${base} border-amber-400 bg-amber-50/50 ring-1 ring-amber-200/80 placeholder:text-amber-600/70`;
  }
  return base;
}

export function AtestadoField({
  label,
  ia,
  pendente,
  children,
}: {
  label: string;
  ia?: boolean;
  pendente?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-medium text-gray-600">
        {label}
        {ia ? (
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
            IA
          </span>
        ) : null}
        {pendente ? (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            Pendente
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
