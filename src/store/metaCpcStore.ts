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
  metaVendasMesCc: number;
  metaVendasMesAlgar: number;
  expedienteHorasPort: number;
  expedienteHorasMig: number;
  expedienteHorasBko: number;
  expedienteHorasCc: number;
  expedienteHorasAlgar: number;
  setMetaMes: (n: number) => void;
  setMetaDia: (n: number) => void;
  setMetaSup: (supervisor: string, n: number) => void;
  setMetaVendasMesPort: (n: number) => void;
  setMetaVendasMesMig: (n: number) => void;
  setMetaVendasMesBko: (n: number) => void;
  setMetaVendasMesCc: (n: number) => void;
  setMetaVendasMesAlgar: (n: number) => void;
  setExpedienteHorasPort: (n: number) => void;
  setExpedienteHorasMig: (n: number) => void;
  setExpedienteHorasBko: (n: number) => void;
  setExpedienteHorasCc: (n: number) => void;
  setExpedienteHorasAlgar: (n: number) => void;
  hydrate: (partial: Partial<MetaCpcState>) => void;
}

type LegacyMetaCpcState = Partial<MetaCpcState> & {
  metaVendasMes?: unknown;
  expedienteHoras?: unknown;
};

function clamp(n: number) {
  if (!Number.isFinite(n)) return CPC_META;
  return Math.min(100, Math.max(1, Math.round(n * 10) / 10));
}
function clampVendas(n: number, fallback: number) {
  return Number.isFinite(n) ? Math.min(999_999, Math.max(0, Math.round(n))) : fallback;
}
function clampExp(n: number) {
  return Math.min(13, Math.max(4, Math.round(n)));
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
      metaVendasMesCc: 5000,
      metaVendasMesAlgar: 0,
      expedienteHorasPort: 8,
      expedienteHorasMig: 8,
      expedienteHorasBko: 8,
      expedienteHorasCc: 8,
      expedienteHorasAlgar: 8,
      setMetaMes: (n) => set({ metaMes: clamp(n) }),
      setMetaDia: (n) => set({ metaDia: clamp(n) }),
      setMetaSup: (supervisor, n) =>
        set((s) => ({ metasSup: { ...s.metasSup, [supervisor]: clamp(n) } })),
      setMetaVendasMesPort: (n) => set({ metaVendasMesPort: clampVendas(n, 5000) }),
      setMetaVendasMesMig: (n) => set({ metaVendasMesMig: clampVendas(n, 5000) }),
      setMetaVendasMesBko: (n) => set({ metaVendasMesBko: clampVendas(n, 1000) }),
      setMetaVendasMesCc: (n) => set({ metaVendasMesCc: clampVendas(n, 5000) }),
      setMetaVendasMesAlgar: (n) => set({ metaVendasMesAlgar: clampVendas(n, 0) }),
      setExpedienteHorasPort: (n) => set({ expedienteHorasPort: clampExp(n) }),
      setExpedienteHorasMig: (n) => set({ expedienteHorasMig: clampExp(n) }),
      setExpedienteHorasBko: (n) => set({ expedienteHorasBko: clampExp(n) }),
      setExpedienteHorasCc: (n) => set({ expedienteHorasCc: clampExp(n) }),
      setExpedienteHorasAlgar: (n) => set({ expedienteHorasAlgar: clampExp(n) }),
      hydrate: (partial) => set((s) => ({ ...s, ...partial })),
    }),
    {
      name: '3f-meta-cpc',
      version: 5,
      // Compatibilidade: antes existia `metaVendasMes` (única). Agora separamos por Portabilidade/Migração.
      // Se o storage antigo existir, replicamos o valor antigo para as duas novas chaves.
      migrate: (persisted: unknown) => {
        if (!persisted || typeof persisted !== 'object') return persisted as MetaCpcState;
        const state = persisted as LegacyMetaCpcState;
        const metaVendasMesAntiga = state.metaVendasMes;
        if (typeof metaVendasMesAntiga === 'number') {
          // Preservar semântica do antigo `metaVendasMes` para o modo "TODAS":
          // como hoje "TODAS" soma Port + Mig, dividimos o total antigo ao meio.
          const half = Math.max(1, Math.round(metaVendasMesAntiga / 2));
          state.metaVendasMesPort = state.metaVendasMesPort ?? half;
          state.metaVendasMesMig = state.metaVendasMesMig ?? half;
        }
        delete state.metaVendasMes;

        // Compatibilidade: antes existia `expedienteHoras` (único). Agora separamos por campanha.
        const expAntigo = state.expedienteHoras;
        if (typeof expAntigo === 'number') {
          const expNorm = Math.min(13, Math.max(4, Math.round(expAntigo)));
          state.expedienteHorasPort = state.expedienteHorasPort ?? expNorm;
          state.expedienteHorasMig = state.expedienteHorasMig ?? expNorm;
        }
        delete state.expedienteHoras;

        state.metaVendasMesBko = state.metaVendasMesBko ?? 1000;
        state.expedienteHorasBko = state.expedienteHorasBko ?? 8;
        state.metaVendasMesCc = state.metaVendasMesCc ?? 5000;
        state.expedienteHorasCc = state.expedienteHorasCc ?? 8;
        state.metaVendasMesAlgar = state.metaVendasMesAlgar ?? 0;
        state.expedienteHorasAlgar = state.expedienteHorasAlgar ?? 8;

        return state as MetaCpcState;
      },
    },
  ),
);

export function metaDoSupervisor(metasSup: Record<string, number>, supervisor: string, fallback: number) {
  const n = metasSup[supervisor];
  return n != null ? n : fallback;
}
