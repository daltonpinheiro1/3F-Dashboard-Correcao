import { BarChart2, TrendingUp } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SortTh } from '../SortTh';
import { MiniKpi } from './HoraKpis';
import { diaAtualEhSabado, type NowcastRow, type NowcastSup } from '../../lib/horaPageData';
import type { MetaAprovadasResumo } from '../../lib/metasAprovadas';
import type { SortDir } from '../../lib/tableSort';

type ChartRow = { hora: string; meta_acum: number; realizado: number };

type Props = {
  metaVendasMes: number;
  expedienteHoras: number;
  dataRef: string;
  metaAprovadas: MetaAprovadasResumo;
  monthMissing: number;
  historico: boolean;
  ritmoEmAprovadas: boolean;
  nowcast: {
    metaDia: number;
    metaHora: number;
    vendasTotal: number;
    gapAcum: number;
    gapPct: number;
    metaRestanteTotal: number;
    horasDecorridas: number;
    horasRestantes: number;
    metaHoraRestante: number;
    rows: NowcastRow[];
    supRows: NowcastSup[];
  };
  chartNowcast: ChartRow[];
  ncRowsSorted: NowcastRow[];
  ncKey: string | null;
  ncDir: SortDir;
  toggleNc: (col: string) => void;
  ncSupSorted: NowcastSup[];
  ncSupKey: string | null;
  ncSupDir: SortDir;
  toggleNcSup: (col: string) => void;
};

/** Nowcasting + redistribuição de meta — PR 2/3 do split HoraPage. */
export function HoraNowcastPanel({
  metaVendasMes,
  expedienteHoras,
  dataRef,
  metaAprovadas,
  monthMissing,
  historico,
  ritmoEmAprovadas,
  nowcast,
  chartNowcast,
  ncRowsSorted,
  ncKey,
  ncDir,
  toggleNc,
  ncSupSorted,
  ncSupKey,
  ncSupDir,
  toggleNcSup,
}: Props) {
  return (
    <>
      <div className="card p-5 shadow-sm mb-6 border-l-4 border-indigo-500">
        <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
          <TrendingUp size={14} className="text-indigo-600" /> Meta mensal sobre aprovadas
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Corte em {dataRef} · {metaAprovadas.diasComDados} dia(s) com dados
          {monthMissing > 0 ? ` · ${monthMissing} dia(s) sem snapshot` : ''}
          {historico ? ' · fechamento histórico' : ' · mês até agora'}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <MiniKpi label="Meta mensal" value={metaAprovadas.metaMensal} sub="aprovadas" />
          <MiniKpi label="Aprovadas MTD" value={metaAprovadas.aprovadasMes} />
          <MiniKpi
            label="Atingimento"
            value={`${metaAprovadas.atingimentoPct}%`}
            warn={metaAprovadas.atingimentoPct < 100 && metaAprovadas.pesoRestante === 0}
          />
          <MiniKpi label="Faltam no mês" value={metaAprovadas.necessidadeMensal} />
          <MiniKpi
            label="Necessidade/dia"
            value={metaAprovadas.necessidadePorDia}
            sub={`meta-base ${metaAprovadas.metaBaseDia}`}
          />
          <MiniKpi
            label="Necessidade/hora"
            value={historico ? 'Fechado' : metaAprovadas.necessidadePorHora}
            sub={historico ? `${metaAprovadas.aprovadasDia} aprovadas no dia` : 'ritmo restante hoje'}
          />
        </div>
      </div>

      <div className="card p-5 shadow-sm mb-6 border-l-4 border-amber-400">
        <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
          <BarChart2 size={14} className="text-amber-600" /> Ritmo hora a hora de {ritmoEmAprovadas ? 'aprovadas' : 'sucessos EVA'}
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          {ritmoEmAprovadas ? 'Aprovadas da origem comercial' : 'Sucessos EVA como proxy enquanto o detalhe horário comercial não está disponível'}
          {' · '}Referência mensal {metaVendasMes} un. · Meta dia {nowcast.metaDia} un. (
          {diaAtualEhSabado(dataRef) ? 'sábado ×0,5' : 'dia útil ×1,0'}) · {nowcast.metaHora} un./hora · Expediente{' '}
          {expedienteHoras}h
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
          <MiniKpi label={ritmoEmAprovadas ? 'Aprovadas realizadas' : 'Sucessos realizados'} value={nowcast.vendasTotal} />
          <MiniKpi
            label="Meta projetada agora"
            value={Math.round(nowcast.metaHora * nowcast.horasDecorridas * 10) / 10}
            sub={`${nowcast.horasDecorridas}h decorridas`}
          />
          <MiniKpi
            label="Gap acumulado"
            value={`${nowcast.gapAcum > 0 ? '+' : ''}${nowcast.gapAcum} un.`}
            warn={nowcast.gapAcum < 0}
            sub={`${nowcast.gapPct > 0 ? '+' : ''}${nowcast.gapPct}%`}
          />
          <MiniKpi
            label="Meta restante"
            value={`${nowcast.metaRestanteTotal} un.`}
            warn={nowcast.metaRestanteTotal > nowcast.metaDia * 0.6}
            sub={`${nowcast.horasRestantes}h restantes`}
          />
          <MiniKpi
            label="Ritmo necessário"
            value={`${nowcast.metaHoraRestante} un./h`}
            warn={nowcast.metaHoraRestante > nowcast.metaHora * 1.3}
            sub={`baseline ${nowcast.metaHora} un./h`}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Projeção hora a hora (acumulado)</p>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartNowcast} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hora" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="meta_acum" name="Meta acum." stroke="#dc2626" strokeDasharray="4 4" dot={false} strokeWidth={2} />
                  <Bar dataKey="realizado" name={`${ritmoEmAprovadas ? 'Aprovadas' : 'Sucessos'} acum.`} fill="#34d399" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Tabela hora a hora</p>
            <div className="overflow-x-auto max-h-52 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <SortTh label="Hora" col="hora" sortKey={ncKey} sortDir={ncDir} onSort={toggleNc} align="left" className="px-2 py-1" />
                    <SortTh label="Meta acum." col="metaAcum" sortKey={ncKey} sortDir={ncDir} onSort={toggleNc} align="right" className="px-2 py-1" />
                    <SortTh label="Realizado" col="realizado" sortKey={ncKey} sortDir={ncDir} onSort={toggleNc} align="right" className="px-2 py-1" />
                    <SortTh label="Gap" col="gap" sortKey={ncKey} sortDir={ncDir} onSort={toggleNc} align="right" className="px-2 py-1" />
                    <SortTh label="Gap%" col="gapPct" sortKey={ncKey} sortDir={ncDir} onSort={toggleNc} align="right" className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {ncRowsSorted.map((r) => (
                    <tr
                      key={r.hora}
                      className={`border-t border-gray-50 ${r.gap < 0 ? 'bg-red-50/50' : r.gap > 0 ? 'bg-emerald-50/50' : ''}`}
                    >
                      <td className="px-2 py-1 font-medium">{r.hora}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{r.metaAcum}</td>
                      <td className="px-2 py-1 text-right tabular-nums font-bold">{r.realizado}</td>
                      <td className={`px-2 py-1 text-right tabular-nums font-bold ${r.gap < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {r.gap > 0 ? '+' : ''}
                        {r.gap}
                      </td>
                      <td className={`px-2 py-1 text-right tabular-nums ${r.gap < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {r.gapPct > 0 ? '+' : ''}
                        {r.gapPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {nowcast.supRows.length > 0 && (
        <div className="card shadow-sm overflow-hidden mb-6 border-l-4 border-amber-400">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp size={14} className="text-amber-600" /> Redistribuição de meta de vendas por supervisor
            </h3>
            <p className="text-xs text-gray-400">
              Meta restante para fechar o dia + gap · nova meta/hora para as {nowcast.horasRestantes}h restantes
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <SortTh label="Supervisor" col="supervisor" sortKey={ncSupKey} sortDir={ncSupDir} onSort={toggleNcSup} align="left" className="px-4" />
                  <SortTh label="Vendido" col="vendidoAteAgora" sortKey={ncSupKey} sortDir={ncSupDir} onSort={toggleNcSup} align="right" />
                  <SortTh label="Meta dia" col="metaDiaSup" sortKey={ncSupKey} sortDir={ncSupDir} onSort={toggleNcSup} align="right" />
                  <SortTh label="Gap" col="gapSup" sortKey={ncSupKey} sortDir={ncSupDir} onSort={toggleNcSup} align="right" />
                  <SortTh label="Faltam" col="metaRestante" sortKey={ncSupKey} sortDir={ncSupDir} onSort={toggleNcSup} align="right" />
                  <SortTh label="un./hora" col="metaPorHoraRestante" sortKey={ncSupKey} sortDir={ncSupDir} onSort={toggleNcSup} align="right" />
                </tr>
              </thead>
              <tbody>
                {ncSupSorted.map((s) => (
                  <tr key={s.supervisor} className={`border-t border-gray-50 ${s.gapSup < 0 ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-2 font-medium">{s.supervisor}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{s.vendidoAteAgora}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.metaDiaSup}</td>
                    <td className={`px-3 py-2 text-right font-bold ${s.gapSup < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {s.gapSup > 0 ? '+' : ''}
                      {s.gapSup}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.metaRestante}</td>
                    <td
                      className={`px-3 py-2 text-right font-bold tabular-nums ${
                        s.metaPorHoraRestante > (nowcast.metaHora / (nowcast.supRows.length || 1)) * 1.3
                          ? 'text-red-600'
                          : 'text-teal-700'
                      }`}
                    >
                      {s.metaPorHoraRestante}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
