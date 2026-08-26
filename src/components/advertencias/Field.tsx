import type { ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-gray-500">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
    </label>
  );
}
