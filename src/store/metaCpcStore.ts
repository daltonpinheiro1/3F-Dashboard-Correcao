import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CPC_META } from '../lib/evaDash';

interface MetaCpcState {
  metaMes: number;
  metaDia: number;
  metasSup: Record<string, number>;
  metaVendasMes: number;
  expedienteHoras: number;
  setMetaMes: (n: number) => void;
  setMetaDia: (n: number) => void;
  setMetaSup: (supervisor: string, n: number) => void;
  setMetaVendasMes: (n: number) => void;
  setExpedienteHoras: (n: number) => void;
}

function clamp(n: number) {
  if (!Number.isFinite(n)) return CPC_META;
  return Math.min(100, Math.max(1, Math.round(n * 10) / 10));
}

export const useMetaCpcStore = create<MetaCpcState>()(
  persist(
    (set) => ({
      metaMes: CPC_META,
      metaDia: CPC_META,
      metasSup: {},
      metaVendasMes: 5000,
      expedienteHoras: 8,
      setMetaMes: (n) => set({ metaMes: clamp(n) }),
      setMetaDia: (n) => set({ metaDia: clamp(n) }),
      setMetaSup: (supervisor, n) =>
        set((s) => ({ metasSup: { ...s.metasSup, [supervisor]: clamp(n) } })),
      setMetaVendasMes: (n) => set({ metaVendasMes: Math.max(1, Math.round(n)) }),
      setExpedienteHoras: (n) => set({ expedienteHoras: Math.min(14, Math.max(4, Math.round(n))) }),
    }),
    { name: '3f-meta-cpc' },
  ),
);

export function metaDoSupervisor(metasSup: Record<string, number>, supervisor: string, fallback: number) {
  const n = metasSup[supervisor];
  return n != null ? n : fallback;
}
