import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CPC_META } from '../lib/evaDash';

interface MetaCpcState {
  metaMes: number;
  metaDia: number;
  metasSup: Record<string, number>;
  metaVendasMesPort: number;
  metaVendasMesMig: number;
  expedienteHoras: number;
  setMetaMes: (n: number) => void;
  setMetaDia: (n: number) => void;
  setMetaSup: (supervisor: string, n: number) => void;
  setMetaVendasMesPort: (n: number) => void;
  setMetaVendasMesMig: (n: number) => void;
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
      metaVendasMesPort: 5000,
      metaVendasMesMig: 5000,
      expedienteHoras: 8,
      setMetaMes: (n) => set({ metaMes: clamp(n) }),
      setMetaDia: (n) => set({ metaDia: clamp(n) }),
      setMetaSup: (supervisor, n) =>
        set((s) => ({ metasSup: { ...s.metasSup, [supervisor]: clamp(n) } })),
      setMetaVendasMesPort: (n) => set({ metaVendasMesPort: Math.max(1, Math.round(n)) }),
      setMetaVendasMesMig: (n) => set({ metaVendasMesMig: Math.max(1, Math.round(n)) }),
      setExpedienteHoras: (n) => set({ expedienteHoras: Math.min(14, Math.max(4, Math.round(n))) }),
    }),
    {
      name: '3f-meta-cpc',
      version: 2,
      // Compatibilidade: antes existia `metaVendasMes` (única). Agora separamos por Portabilidade/Migração.
      // Se o storage antigo existir, replicamos o valor antigo para as duas novas chaves.
      migrate: (persisted: any) => {
        if (!persisted) return persisted;
        const metaVendasMesAntiga = persisted.metaVendasMes;
        if (typeof metaVendasMesAntiga === 'number') {
          persisted.metaVendasMesPort = persisted.metaVendasMesPort ?? metaVendasMesAntiga;
          persisted.metaVendasMesMig = persisted.metaVendasMesMig ?? metaVendasMesAntiga;
        }
        delete persisted.metaVendasMes;
        return persisted;
      },
    },
  ),
);

export function metaDoSupervisor(metasSup: Record<string, number>, supervisor: string, fallback: number) {
  const n = metasSup[supervisor];
  return n != null ? n : fallback;
}
