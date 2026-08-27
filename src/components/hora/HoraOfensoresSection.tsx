import { AlertCircle, Users, X } from 'lucide-react';
import { SegControl } from '../ui';
import { SortTh } from '../SortTh';
import { MiniKpi } from './HoraKpis';
import { fmtHms, fmtPerda, isTabNaoCpc } from '../../lib/evaDash';
import { motivoSourceClass, motivoSourceLabel, type NowcastSup } from '../../lib/horaPageData';
import type { SortDir } from '../../lib/tableSort';

type DropRate = { _drop_rate?: number };
type RankingSup = {
  supervisor: string;
  total: number;
  pct_cpc: number;
  meta: number;
  gap: number;
  sucesso?: number;
} & DropRate;
type MotivoRow = {
  hora?: string;
  nome: string;
  campanha_op?: string;
  total: number;
  pct_cpc: number;
  tma_seg?: number;
} & DropRate;
type DrillOp = {
  login: string;
  hora?: string;
  operador: string;
  total: number;
  pct_cpc: number;
  tma_seg?: number;
  _drop_rate?: number;
  _motivo_label?: string;
};
type OfensorRow = {
  login: string;
  hora?: string;
  campanha_op?: string;
  operador: string;
  supervisor: string;
  total: number;
  pct_cpc: number;
  tma_seg?: number;
  motivo?: string | null;
  motivo_source?: string;
  motivo_pct?: number;
  _drop_rate?: number;
  impacto_perda?: number;
};

type Perdas = {
  tempo_deslogue_seg: number;
  tempo_pausa_excedente_seg: number;
  tempo_total_seg: number;
  tma_seg: number;
  chamadas_perdidas: number;
  vendas_perdidas: number;
  vb_perdidas: number;
  conversao_pct: number;
  conversao_vb_pct: number;
};

type Props = {
  metaDia: number;
  tab: 'live' | 'hist';
  hora: string;
  pausa: number;
  perdas: Perdas;
  // supervisores / motivos
  rankingSupSorted: RankingSup[];
  rkSupKey: string | null;
  rkSupDir: SortDir;
  toggleRkSup: (c: string) => void;
  motivosSorted: MotivoRow[];
  motKey: string | null;
  motDir: SortDir;
  toggleMot: (c: string) => void;
  // drill
  supDrill: string | null;
  setSupDrill: (v: string | null) => void;
  nowcastSupRows: NowcastSup[];
  drillOpSorted: DrillOp[];
  drillOpKey: string | null;
  drillOpDir: SortDir;
  toggleDrillOp: (c: string) => void;
  drillMotSorted: MotivoRow[];
  drillMotKey: string | null;
  drillMotDir: SortDir;
  toggleDrillMot: (c: string) => void;
  supMotivosLen: number;
  // operadores ofensores
  opViewDia: boolean;
  setOpViewDia: (v: boolean) => void;
  motivoSourceSummary: Record<string, number>;
  supFilter: string;
  setSupFilter: (v: string) => void;
  motivoFilter: string;
  setMotivoFilter: (v: string) => void;
  sourceFilter: string;
  setSourceFilter: (v: string) => void;
  supOptions: string[];
  motivoOptions: string[];
  ofensorSorted: OfensorRow[];
  ofKey: string | null;
  ofDir: SortDir;
  toggleOf: (c: string) => void;
  operadoresFiltradosLen: number;
  operadoresLen: number;
  operadoresBaseCount: number;
  jornadaBaseCount: number;
  operadoresRawLen: number;
};

/** Tabelas de ofensores/supervisores/drill — PR 3/3 do split HoraPage. */
export function HoraOfensoresSection(p: Props) {
  const {
    metaDia,
    tab,
    hora,
    pausa,
    perdas,
    rankingSupSorted,
    rkSupKey,
    rkSupDir,
    toggleRkSup,
    motivosSorted,
    motKey,
    motDir,
    toggleMot,
    supDrill,
    setSupDrill,
    nowcastSupRows,
    drillOpSorted,
    drillOpKey,
    drillOpDir,
    toggleDrillOp,
    drillMotSorted,
    drillMotKey,
    drillMotDir,
    toggleDrillMot,
    supMotivosLen,
    opViewDia,
    setOpViewDia,
    motivoSourceSummary,
    supFilter,
    setSupFilter,
    motivoFilter,
    setMotivoFilter,
    sourceFilter,
    setSourceFilter,
    supOptions,
    motivoOptions,
    ofensorSorted,
    ofKey,
    ofDir,
    toggleOf,
    operadoresFiltradosLen,
    operadoresLen,
    operadoresBaseCount,
    jornadaBaseCount,
    operadoresRawLen,
  } = p;

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="card shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800">Supervisores ofensores no intervalo</h3>
            <p className="text-xs text-gray-400">Pior CPC primeiro · meta individual · DROP% = Agente Desligou (dia)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <SortTh label="Supervisor" col="supervisor" sortKey={rkSupKey} sortDir={rkSupDir} onSort={toggleRkSup} align="left" className="px-4" />
                  <SortTh label="Quantidade" col="total" sortKey={rkSupKey} sortDir={rkSupDir} onSort={toggleRkSup} align="right" />
                  <SortTh label="CPC%" col="pct_cpc" sortKey={rkSupKey} sortDir={rkSupDir} onSort={toggleRkSup} align="right" />
                  <SortTh label="DROP%" col="_drop_rate" sortKey={rkSupKey} sortDir={rkSupDir} onSort={toggleRkSup} align="right" title="Agente Desligou ÷ tabs (dia)" />
                  <SortTh label="Meta" col="meta" sortKey={rkSupKey} sortDir={rkSupDir} onSort={toggleRkSup} align="right" />
                  <SortTh label="Gap" col="gap" sortKey={rkSupKey} sortDir={rkSupDir} onSort={toggleRkSup} align="right" />
                </tr>
              </thead>
              <tbody>
                {rankingSupSorted.map((s) => (
                  <tr
                    key={s.supervisor}
                    onClick={() => setSupDrill(supDrill === s.supervisor ? null : s.supervisor)}
                    className={`border-t border-gray-50 cursor-pointer hover:bg-gray-50 ${s.pct_cpc < s.meta ? 'bg-red-50/40' : ''} ${supDrill === s.supervisor ? 'ring-2 ring-indigo-400' : ''}`}
                  >
                    <td className="px-4 py-2 font-medium">{s.supervisor}</td>
                    <td className="px-3 py-2 text-right">{s.total}</td>
                    <td className={`px-3 py-2 text-right font-bold ${s.pct_cpc < s.meta ? 'text-red-600' : 'text-teal-700'}`}>
                      {s.pct_cpc.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${(s._drop_rate || 0) >= 25 ? 'text-red-600' : 'text-gray-700'}`}>
                      {Number(s._drop_rate || 0).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right">{s.meta}%</td>
                    <td className={`px-3 py-2 text-right ${s.gap < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{s.gap.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800">Tabulações · onde perdeu CPC</h3>
            <p className="text-xs text-gray-400">Quantidade · CPC% · DROP% Agente Desligou · TMA · n/CPC em cinza</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <SortTh label="Tabulação" col="nome" sortKey={motKey} sortDir={motDir} onSort={toggleMot} align="left" className="px-4" />
                  <SortTh label="Quantidade" col="total" sortKey={motKey} sortDir={motDir} onSort={toggleMot} align="right" />
                  <SortTh label="CPC%" col="pct_cpc" sortKey={motKey} sortDir={motDir} onSort={toggleMot} align="right" />
                  <SortTh label="DROP%" col="_drop_rate" sortKey={motKey} sortDir={motDir} onSort={toggleMot} align="right" title="Agente Desligou ÷ tabs desta tabulação" />
                  <SortTh label="TMA" col="tma_seg" sortKey={motKey} sortDir={motDir} onSort={toggleMot} align="right" />
                </tr>
              </thead>
              <tbody>
                {motivosSorted.map((m, idx) => (
                  <tr key={`${idx}-${m.hora}-${m.nome}-${m.campanha_op}`} className="border-t border-gray-50">
                    <td className="px-4 py-2 truncate max-w-[200px]">{m.nome}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.total}</td>
                    <td
                      className={`px-3 py-2 text-right font-bold tabular-nums ${
                        isTabNaoCpc(m.nome) ? 'text-gray-400' : m.pct_cpc < metaDia ? 'text-red-600' : 'text-teal-700'
                      }`}
                    >
                      {m.pct_cpc.toFixed(1)}%{isTabNaoCpc(m.nome) ? ' n/CPC' : ''}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${(m._drop_rate || 0) >= 25 ? 'text-red-600' : 'text-gray-700'}`}>
                      {Number(m._drop_rate || 0).toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{m.tma_seg ? fmtHms(m.tma_seg) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card p-5 shadow-sm mb-6">
        <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
          <AlertCircle size={14} /> Decomposição de perdas estimadas
        </h3>
        <p className="text-xs text-gray-400 mb-3">Tempo improdutivo × TMA → chamadas e vendas que a operação deixou de entregar</p>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 text-center">
          <MiniKpi label="Deslogue" value={fmtHms(perdas.tempo_deslogue_seg)} sub="seg improdutivos" />
          <MiniKpi label="Pausa excedente" value={fmtHms(perdas.tempo_pausa_excedente_seg)} sub={`pausa tot. ${fmtHms(pausa)}`} />
          <MiniKpi label="Tempo total perdido" value={fmtHms(perdas.tempo_total_seg)} warn={perdas.tempo_total_seg > 1800} />
          <MiniKpi label="TMA médio" value={fmtHms(perdas.tma_seg)} />
          <MiniKpi label="Cham. perdidas" value={fmtPerda(perdas.chamadas_perdidas)} warn={perdas.chamadas_perdidas >= 5} />
          <MiniKpi label="Vendas perdidas" value={fmtPerda(perdas.vendas_perdidas)} warn={perdas.vendas_perdidas >= 0.5} sub={`conv ${perdas.conversao_pct}%`} />
          <MiniKpi label="VB perdidas" value={fmtPerda(perdas.vb_perdidas)} warn={perdas.vb_perdidas >= 0.5} sub={`conv VB ${perdas.conversao_vb_pct}%`} />
        </div>
      </div>

      {supDrill && (
        <div className="card p-5 shadow-sm mb-6 border-l-4 border-indigo-500">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800">Drill-down: {supDrill}</h3>
            <button type="button" onClick={() => setSupDrill(null)} className="text-xs text-red-600 flex items-center gap-1">
              <X size={12} /> Fechar
            </button>
          </div>
          {(() => {
            const row = nowcastSupRows.find((s) => s.supervisor === supDrill);
            if (!row) return null;
            const gapLbl = `${row.gapSup > 0 ? '+' : ''}${row.gapSup}`;
            return (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <MiniKpi label="Vendido" value={row.vendidoAteAgora} sub="até agora" />
                <MiniKpi label="Meta dia" value={row.metaDiaSup} sub="intervalo" />
                <MiniKpi label="Gap" value={gapLbl} warn={row.gapSup < 0} />
                <MiniKpi label="Faltam" value={row.metaRestante} sub="meta restante" />
                <MiniKpi label="un./hora" value={row.metaPorHoraRestante} sub="ritmo p/ fechar" />
              </div>
            );
          })()}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Operadores do supervisor</p>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <SortTh label="Operador" col="operador" sortKey={drillOpKey} sortDir={drillOpDir} onSort={toggleDrillOp} align="left" className="px-3 py-1.5" />
                      <SortTh label="Quantidade" col="total" sortKey={drillOpKey} sortDir={drillOpDir} onSort={toggleDrillOp} align="right" className="px-3 py-1.5" />
                      <SortTh label="CPC%" col="pct_cpc" sortKey={drillOpKey} sortDir={drillOpDir} onSort={toggleDrillOp} align="right" className="px-3 py-1.5" />
                      <SortTh label="DROP%" col="_drop_rate" sortKey={drillOpKey} sortDir={drillOpDir} onSort={toggleDrillOp} align="right" className="px-3 py-1.5" title="Agente Desligou ÷ tabs (dia)" />
                      <SortTh label="TMA" col="_tma_seg" sortKey={drillOpKey} sortDir={drillOpDir} onSort={toggleDrillOp} align="right" className="px-3 py-1.5" />
                      <SortTh label="Motivo principal" col="_motivo_label" sortKey={drillOpKey} sortDir={drillOpDir} onSort={toggleDrillOp} align="left" className="px-3 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {drillOpSorted.map((o) => (
                      <tr key={`${o.login}-${o.hora}`} className="border-t border-gray-50">
                        <td className="px-3 py-1.5 truncate max-w-[140px]">{o.operador}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{o.total}</td>
                        <td className={`px-3 py-1.5 text-right font-bold ${o.pct_cpc < metaDia ? 'text-red-600' : 'text-teal-700'}`}>
                          {o.pct_cpc.toFixed(1)}%
                        </td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${(o._drop_rate || 0) >= 25 ? 'text-red-600' : 'text-gray-700'}`}>
                          {Number(o._drop_rate || 0).toFixed(1)}%
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{o.tma_seg ? fmtHms(o.tma_seg) : '—'}</td>
                        <td className="px-3 py-1.5 text-xs text-gray-500 truncate max-w-[140px]">{o._motivo_label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Top motivos do supervisor</p>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <SortTh label="Tabulação" col="nome" sortKey={drillMotKey} sortDir={drillMotDir} onSort={toggleDrillMot} align="left" className="px-3 py-1.5" />
                      <SortTh label="Quantidade" col="total" sortKey={drillMotKey} sortDir={drillMotDir} onSort={toggleDrillMot} align="right" className="px-3 py-1.5" />
                      <SortTh label="CPC%" col="pct_cpc" sortKey={drillMotKey} sortDir={drillMotDir} onSort={toggleDrillMot} align="right" className="px-3 py-1.5" />
                      <SortTh label="TMA" col="tma_seg" sortKey={drillMotKey} sortDir={drillMotDir} onSort={toggleDrillMot} align="right" className="px-3 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {drillMotSorted.map((m, idx) => (
                      <tr key={`${idx}-${m.hora}-${m.nome}-${m.campanha_op || ''}`} className="border-t border-gray-50">
                        <td className="px-3 py-1.5 truncate max-w-[160px]">{m.nome}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{m.total}</td>
                        <td
                          className={`px-3 py-1.5 text-right font-bold ${
                            isTabNaoCpc(m.nome) ? 'text-gray-400' : m.pct_cpc < metaDia ? 'text-red-600' : 'text-teal-700'
                          }`}
                        >
                          {m.pct_cpc.toFixed(1)}%{isTabNaoCpc(m.nome) ? ' n/CPC' : ''}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{m.tma_seg ? fmtHms(m.tma_seg) : '—'}</td>
                      </tr>
                    ))}
                    {supMotivosLen === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-center text-gray-400 text-xs">
                          Sem dados hora_sup_motivo no payload
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-800">
              Operadores ofensores · {opViewDia && hora !== 'todas' ? 'dia todo' : hora === 'todas' ? 'dia' : `${hora}h`}
            </h3>
            <p className="text-xs text-gray-400">
              Pior CPC primeiro · DROP% = Agente Desligou (dia) · motivo principal · TMA
              {supDrill ? ` · filtrado por ${supDrill}` : ''}
            </p>
            <p
              className="text-[11px] text-gray-500 mt-1"
              title="Motivo principal é calculado pelo maior impacto de perda do colaborador no recorte, priorizando tabulações fora de CPC (n/CPC) e maior volume."
            >
              Motivo principal = maior perda do colaborador (prioriza n/CPC e volume)
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Fonte motivo: Op {motivoSourceSummary.operador_payload || 0} · Est {motivoSourceSummary.operador_estimado || 0} · Sup{' '}
              {motivoSourceSummary.supervisor_fallback || 0} · Global {motivoSourceSummary.global_fallback || 0}
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 flex-wrap">
            {hora !== 'todas' && (
              <SegControl
                value={opViewDia ? 'dia' : 'hora'}
                onChange={(v) => setOpViewDia(v === 'dia')}
                ariaLabel="Recorte ofensores hora ou dia"
                options={[
                  { id: 'hora', label: `${hora}h` },
                  { id: 'dia', label: 'Dia todo' },
                ]}
              />
            )}
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-500 whitespace-nowrap">Supervisor</label>
              <select
                value={supFilter}
                onChange={(e) => setSupFilter(e.target.value)}
                disabled={supOptions.length === 0}
                className="border border-gray-200 rounded px-2 py-1 text-xs bg-white text-gray-700"
              >
                <option value="">Todos</option>
                {supOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-500 whitespace-nowrap">Motivo</label>
              <select
                value={motivoFilter}
                onChange={(e) => setMotivoFilter(e.target.value)}
                disabled={motivoOptions.length === 0}
                className="border border-gray-200 rounded px-2 py-1 text-xs bg-white text-gray-700"
              >
                <option value="">Todos</option>
                {motivoOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-gray-500 whitespace-nowrap">Fonte</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-xs bg-white text-gray-700"
              >
                <option value="">Todas</option>
                <option value="operador_payload">Operador</option>
                <option value="operador_estimado">Estimado op.</option>
                <option value="supervisor_fallback">Fallback sup.</option>
                <option value="global_fallback">Fallback global</option>
                <option value="indisponivel">Indisponível</option>
              </select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
              <tr>
                <SortTh label="Operador" col="operador" sortKey={ofKey} sortDir={ofDir} onSort={toggleOf} align="left" className="px-4" />
                <SortTh label="Supervisor" col="supervisor" sortKey={ofKey} sortDir={ofDir} onSort={toggleOf} align="left" className="px-3" />
                <SortTh label="Quantidade" col="total" sortKey={ofKey} sortDir={ofDir} onSort={toggleOf} align="right" className="px-3" />
                <SortTh label="CPC%" col="pct_cpc" sortKey={ofKey} sortDir={ofDir} onSort={toggleOf} align="right" className="px-3" />
                <SortTh label="DROP%" col="_drop_rate" sortKey={ofKey} sortDir={ofDir} onSort={toggleOf} align="right" className="px-3" title="Agente Desligou (EVA) ÷ tabs do dia" />
                <SortTh label="Impacto" col="_impacto" sortKey={ofKey} sortDir={ofDir} onSort={toggleOf} align="right" className="px-3" title="Score de impacto da perda: tabuladas × (100 - CPC%)" />
                <SortTh label="TMA" col="_tma_seg" sortKey={ofKey} sortDir={ofDir} onSort={toggleOf} align="right" className="px-3" />
                <SortTh label="Motivo principal" col="motivo" sortKey={ofKey} sortDir={ofDir} onSort={toggleOf} align="left" className="px-3" title="Maior motivo de perda estimado para o operador no recorte" />
                <SortTh label="Fonte" col="_fonte" sortKey={ofKey} sortDir={ofDir} onSort={toggleOf} align="left" className="px-3" />
                <SortTh label="Mot.%" col="_motivo_pct" sortKey={ofKey} sortDir={ofDir} onSort={toggleOf} align="right" className="px-3" title="% de participação do motivo principal sobre as chamadas do operador no recorte" />
              </tr>
            </thead>
            <tbody>
              {ofensorSorted.map((o) => (
                <tr
                  key={`${o.login}-${o.hora}-${o.campanha_op}`}
                  className={`border-t border-gray-50 ${o.total >= 5 && o.pct_cpc < metaDia ? 'bg-red-50/40' : ''}`}
                >
                  <td className="px-4 py-2 font-medium truncate max-w-[160px]">{o.operador}</td>
                  <td className="px-3 py-2 text-gray-500 truncate max-w-[120px]">{o.supervisor}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o.total}</td>
                  <td className={`px-3 py-2 text-right font-bold ${o.total >= 5 && o.pct_cpc < metaDia ? 'text-red-600' : 'text-teal-700'}`}>
                    {o.pct_cpc.toFixed(1)}%
                  </td>
                  <td className={`px-3 py-2 text-right font-semibold ${(o._drop_rate || 0) >= 25 ? 'text-red-600' : 'text-gray-700'}`}>
                    {Number(o._drop_rate || 0).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{Number(o.impacto_perda || 0).toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{o.tma_seg ? fmtHms(o.tma_seg) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 truncate max-w-[160px]">{o.motivo || '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 ${motivoSourceClass(o.motivo_source)}`}>
                      {motivoSourceLabel(o.motivo_source)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                    {o.motivo ? `${Number(o.motivo_pct || 0).toFixed(1)}%` : ''}
                  </td>
                </tr>
              ))}
              {operadoresFiltradosLen === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center">
                    <Users size={28} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm text-gray-400">
                      {operadoresLen === 0
                        ? 'Sem dados de operadores para o intervalo selecionado'
                        : 'Sem operadores após aplicar filtros (Supervisor/Motivo)'}
                    </p>
                    <p className="text-xs text-gray-300 mt-1">
                      {tab === 'live'
                        ? `Realtime: payload hora_operador=${operadoresBaseCount} · payload jornada=${jornadaBaseCount} · após filtro campanha=${operadoresRawLen}. Tente 'Dia' ou aguarde o próximo auto-refresh.`
                        : `Ajuste o filtro de hora/campanha.`}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
