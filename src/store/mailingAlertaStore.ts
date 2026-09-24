import { create } from 'zustand';

interface MailingAlertaState {
  /** Quantidade de alertas fôlego/desgaste do live */
  n: number;
  ts: number;
  publish: (n: number) => void;
}

export const useMailingAlertaStore = create<MailingAlertaState>()((set) => ({
  n: 0,
  ts: 0,
  publish: (n) => set({ n: Math.max(0, n), ts: Date.now() }),
}));
