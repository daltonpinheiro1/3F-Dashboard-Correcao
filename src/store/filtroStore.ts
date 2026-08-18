import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getYesterdayRange } from '../lib/dateFilter';
import type { CampanhaOp } from '../lib/evaDash';

export type EvaTabModo = 'live' | 'hist';

interface FiltroEvaState {
  tab: EvaTabModo;
  campanha: CampanhaOp;
  dateFrom: string;
  dateTo: string;
  search: string;
  setTab: (tab: EvaTabModo) => void;
  setCampanha: (campanha: CampanhaOp) => void;
  setDateFrom: (dateFrom: string) => void;
  setDateTo: (dateTo: string) => void;
  setSearch: (search: string) => void;
  limpar: () => void;
}

function iniciais() {
  const d = getYesterdayRange();
  return {
    tab: 'live' as EvaTabModo,
    campanha: 'TODAS' as CampanhaOp,
    dateFrom: d.dateFrom,
    dateTo: d.dateTo,
    search: '',
  };
}

export function filtroEvaAtivo(s: {
  tab: EvaTabModo;
  campanha: CampanhaOp;
  dateFrom: string;
  dateTo: string;
  search: string;
}): boolean {
  const i = iniciais();
  return (
    s.search.trim() !== '' ||
    s.campanha !== i.campanha ||
    s.tab !== i.tab ||
    s.dateFrom !== i.dateFrom ||
    s.dateTo !== i.dateTo
  );
}

export const useFiltroEvaStore = create<FiltroEvaState>()(
  persist(
    (set) => ({
      ...iniciais(),
      setTab: (tab) => set({ tab }),
      setCampanha: (campanha) => set({ campanha }),
      setDateFrom: (dateFrom) => set({ dateFrom }),
      setDateTo: (dateTo) => set({ dateTo }),
      setSearch: (search) => set({ search }),
      limpar: () => set(iniciais()),
    }),
    {
      name: '3f-filtro-eva',
      version: 2,
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<FiltroEvaState>;
        const i = iniciais();
        if (p.tab === 'hist' && p.dateFrom && p.dateTo) {
          return { ...current, ...p };
        }
        return { ...current, ...p, dateFrom: i.dateFrom, dateTo: i.dateTo };
      },
    },
  ),
);
