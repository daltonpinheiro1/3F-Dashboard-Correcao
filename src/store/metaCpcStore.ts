import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CPC_META } from '../lib/evaDash';

interface MetaCpcState {
  metaMes: number;
  metaDia: number;
  metasSup: Record<string, number>;
  metaVendasMesPort: number;
  metaVendasMesMig: number;
  metaVendasMesBko: number;
  expedienteHorasPort: number;
  expedienteHorasMig: number;
  expedienteHorasBko: number;
  setMetaMes: (n: number) => void;
  setMetaDia: (n: number) => void;
  setMetaSup: (supervisor: string, n: number) => void;
  setMetaVendasMesPort: (n: number) => void;
  setMetaVendasMesMig: (n: number) => void;
  setMetaVendasMesBko: (n: number) => void;
  setExpedienteHorasPort: (n: number) => void;
  setExpedienteHorasMig: (n: number) => void;
  setExpedienteHorasBko: (n: number) => void;
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
      metaVendasMesBko: 1000,
      expedienteHorasPort: 8,
      expedienteHorasMig: 8,
      expedienteHorasBko: 8,
      setMetaMes: (n) => set({ metaMes: clamp(n) }),
      setMetaDia: (n) => set({ metaDia: clamp(n) }),
      setMetaSup: (supervisor, n) =>
        set((s) => ({ metasSup: { ...s.metasSup, [supervisor]: clamp(n) } })),
      setMetaVendasMesPort: (n) => set({ metaVendasMesPort: Math.max(1, Math.round(n)) }),
      setMetaVendasMesMig: (n) => set({ metaVendasMesMig: Math.max(1, Math.round(n)) }),
      setMetaVendasMesBko: (n) => set({ metaVendasMesBko: Math.max(1, Math.round(n)) }),
      setExpedienteHorasPort: (n) => set({ expedienteHorasPort: Math.min(13, Math.max(4, Math.round(n))) }),
      setExpedienteHorasMig: (n) => set({ expedienteHorasMig: Math.min(13, Math.max(4, Math.round(n))) }),
      setExpedienteHorasBko: (n) => set({ expedienteHorasBko: Math.min(13, Math.max(4, Math.round(n))) }),
    }),
    {
      name: '3f-meta-cpc',
      version: 4,
      // Compatibilidade: antes existia `metaVendasMes` (única). Agora separamos por Portabilidade/Migração.
      // Se o storage antigo existir, replicamos o valor antigo para as duas novas chaves.
      migrate: (persisted: any) => {
        if (!persisted) return persisted;
        const metaVendasMesAntiga = persisted.metaVendasMes;
        if (typeof metaVendasMesAntiga === 'number') {
          // Preservar semântica do antigo `metaVendasMes` para o modo "TODAS":
          // como hoje "TODAS" soma Port + Mig, dividimos o total antigo ao meio.
          const half = Math.max(1, Math.round(metaVendasMesAntiga / 2));
          persisted.metaVendasMesPort = persisted.metaVendasMesPort ?? half;
          persisted.metaVendasMesMig = persisted.metaVendasMesMig ?? half;
        }
        delete persisted.metaVendasMes;

        // Compatibilidade: antes existia `expedienteHoras` (único). Agora separamos por campanha.
        const expAntigo = persisted.expedienteHoras;
        if (typeof expAntigo === 'number') {
          const expNorm = Math.min(13, Math.max(4, Math.round(expAntigo)));
          persisted.expedienteHorasPort = persisted.expedienteHorasPort ?? expNorm;
          persisted.expedienteHorasMig = persisted.expedienteHorasMig ?? expNorm;
        }
        delete persisted.expedienteHoras;

        persisted.metaVendasMesBko = persisted.metaVendasMesBko ?? 1000;
        persisted.expedienteHorasBko = persisted.expedienteHorasBko ?? 8;

        return persisted;
      },
    },
  ),
);

export function metaDoSupervisor(metasSup: Record<string, number>, supervisor: string, fallback: number) {
  const n = metasSup[supervisor];
  return n != null ? n : fallback;
}
