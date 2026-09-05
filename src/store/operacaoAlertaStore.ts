import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OperacaoAlertaState {
  ka: number;
  staleMin?: number;
  ts: number;
  muted: boolean;
  publish: (ka: number, staleMin?: number) => void;
  setMuted: (muted: boolean) => void;
}

export const useOperacaoAlertaStore = create<OperacaoAlertaState>()(
  persist(
    (set) => ({
      ka: 0,
      staleMin: undefined,
      ts: 0,
      muted: false,
      publish: (ka, staleMin) => set({ ka, staleMin, ts: Date.now() }),
      setMuted: (muted) => set({ muted }),
    }),
    {
      name: '3f-operacao-alerta',
      partialize: (s) => ({ muted: s.muted }),
    },
  ),
);
