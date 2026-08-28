import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Calendar, Clock, Download, FileCheck, FileX, FolderOpen } from 'lucide-react';
import { KpiCard } from '../ui/KpiCard';
import { agregarGerencialAno } from '../../lib/atestadosGerencial';
import { exportAtestadosExcel, exportGerencialResumo } from '../../lib/atestadosExport';
import { TIPO_LABELS, type Atestado, type AtestadoTipo } from '../../lib/atestadosEscala';

export function GerencialPanel({
  rows,
  ano,
  onAnoChange,
}: {
  rows: Atestado[];
  ano: number;
  onAnoChange: (y: number) => void;
}) {
  const g = useMemo(() => agregarGerencialAno(rows, ano), [rows, ano]);
  const anoRows = useMemo(
    () =>
      rows.filter((r) => {
        const ref = r.data_inicio || r.created_at?.slice(0, 10) || '';
        return ref.startsWith(String(ano));
      }),
    [rows, ano],
  );

  const anos = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const r of rows) {
      const ref = r.data_inicio || r.created_at?.slice(0, 10);
      if (ref) set.add(Number(ref.slice(0, 4)));
    }
    return [...set].sort((a, b) => b - a);
  }, [rows]);

  const tiposOrdenados = (Object.keys(g.por_tipo) as AtestadoTipo[])
    .filter((t) => g.por_tipo[t].count > 0)
    .sort((a, b) => g.por_tipo[b].count - g.por_tipo[a].count);

  const chartData = g.por_mes.map((m) => ({
    name: m.label,
    atestados: m.count,
    dias: m.dias,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <label className="text-sm text-gray-600 flex items-center gap-2">
          <Calendar size={14} />
          Ano
          <select
            className="input text-sm"
            value={ano}
            onChange={(e) => onAnoChange(Number(e.target.value))}
          >
            {anos.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1"
            onClick={() => exportGerencialResumo(anoRows, ano, g)}
          >
            <Download size={12} /> Resumo mensal
          </button>
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1"
            onClick={() => exportAtestadosExcel(anoRows, ano)}
          >
            <Download size={12} /> Exportar detalhado
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total protocolados" value={g.total} icon={FolderOpen} />
        <KpiCard label="Aprovados / arquivados" value={g.aprovados} icon={FileCheck} warn={g.protocolados > 0} />
        <KpiCard label="Dias de afastamento" value={g.total_dias} icon={Calendar} />
        <KpiCard label="Horas (comparecimento)" value={g.total_horas} icon={Clock} />
      </div>

      <div className="card p-4 h-64">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Atestados por mês ({ano})</h3>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="atestados" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Atestados" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <BarChart3 size={14} /> Por tipo ({ano})
          </h3>
          {tiposOrdenados.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum atestado neste ano.</p>
          ) : (
            <ul className="space-y-2">
              {tiposOrdenados.map((t) => {
                const slot = g.por_tipo[t];
                const pct = g.total ? Math.round((slot.count / g.total) * 100) : 0;
                return (
                  <li key={t} className="text-sm">
                    <div className="flex justify-between mb-1">
                      <span>{TIPO_LABELS[t]}</span>
                      <span className="text-gray-500">
                        {slot.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {slot.dias > 0 ? `${slot.dias} dia(s)` : ''}
                      {slot.dias > 0 && slot.horas > 0 ? ' · ' : ''}
                      {slot.horas > 0 ? `${slot.horas}h` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Evolução mensal</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-left py-2">Mês</th>
                  <th className="text-right py-2">Qtd</th>
                  <th className="text-right py-2">Dias</th>
                  <th className="text-right py-2">Horas</th>
                </tr>
              </thead>
              <tbody>
                {g.por_mes.map((m) => (
                  <tr key={m.mes} className={m.count ? '' : 'text-gray-300'}>
                    <td className="py-1.5">{m.label}</td>
                    <td className="text-right">{m.count}</td>
                    <td className="text-right">{m.dias || '—'}</td>
                    <td className="text-right">{m.horas || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(g.recusados > 0 || g.em_analise > 0) && (
            <div className="mt-4 flex gap-4 text-xs text-gray-600">
              {g.em_analise > 0 && <span>Em análise: {g.em_analise}</span>}
              {g.recusados > 0 && (
                <span className="text-red-600 flex items-center gap-1">
                  <FileX size={12} /> Recusados: {g.recusados}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
