import { Calendar, RefreshCw, Search, X } from 'lucide-react';
import { SegControl } from '../ui';
import { HORAS } from '../../lib/horaPageData';
import type { CampanhaOp } from '../../lib/evaDash';
import { CAMPANHA_FILTRO_OPTIONS } from '../../lib/evaDash';
import type { EvaTabModo } from '../../store/filtroStore';

type Props = {
  tab: EvaTabModo;
  setTab: (t: EvaTabModo) => void;
  campanha: CampanhaOp;
  setCampanha: (c: CampanhaOp) => void;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  filtroOn: boolean;
  limparFiltro: () => void;
  hora: string;
  setHora: (h: string) => void;
  refreshing: boolean;
  lastRefresh: Date;
  onRefresh: () => void;
};

/** Toolbar da Hora a hora (filtros + chips de hora) — PR 1/3 do split. */
export function HoraToolbar({
  tab,
  setTab,
  campanha,
  setCampanha,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  search,
  setSearch,
  filtroOn,
  limparFiltro,
  hora,
  setHora,
  refreshing,
  lastRefresh,
  onRefresh,
}: Props) {
  return (
    <div className="card p-4 shadow-sm mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegControl
          value={tab}
          onChange={setTab}
          ariaLabel="Modo hora a hora"
          options={[
            { id: 'live', label: 'Realtime' },
            { id: 'hist', label: 'Histórico' },
          ]}
        />
        <SegControl
          value={campanha}
          onChange={setCampanha}
          ariaLabel="Campanha hora a hora"
          options={CAMPANHA_FILTRO_OPTIONS}
        />
        {tab === 'hist' && (
          <>
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field text-sm py-2 w-36"
            />
            <span className="text-xs text-gray-400">até</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field text-sm py-2 w-36"
            />
          </>
        )}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Gestor ou operador"
            className="input-field text-sm py-2 pl-8 w-52"
          />
        </div>
        {filtroOn && (
          <button type="button" onClick={limparFiltro} className="text-xs font-semibold text-red-600 flex items-center gap-1">
            <X size={12} /> Limpar filtros
          </button>
        )}
        {tab === 'live' && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium ml-2">
            <span className={`w-2 h-2 rounded-full ${refreshing ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-400'}`} />
            Auto 30s · {lastRefresh.toLocaleTimeString('pt-BR')}
          </span>
        )}
        <button type="button" onClick={onRefresh} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3 ml-auto">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3" role="group" aria-label="Filtro por hora">
        <button
          type="button"
          onClick={() => setHora('todas')}
          aria-label="Ver dia inteiro"
          aria-pressed={hora === 'todas'}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${hora === 'todas' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Dia
        </button>
        {HORAS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setHora(h)}
            aria-label={`Filtrar hora ${h}`}
            aria-pressed={hora === h}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${hora === h ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {h}h
          </button>
        ))}
      </div>
    </div>
  );
}
