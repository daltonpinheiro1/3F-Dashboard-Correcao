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

type ChartRow = { hora: string; total: number; pct_cpc: number; meta: number };

/** Gráfico CPC hora a hora — PR 3/3 do split. */
export function HoraCpcChart({ metaDia, chartHora }: { metaDia: number; chartHora: ChartRow[] }) {
  return (
    <div className="card p-5 shadow-sm mb-6">
      <h3 className="text-sm font-bold text-gray-800 mb-1">CPC hora a hora · meta do dia {metaDia}%</h3>
      <p className="text-xs text-gray-400 mb-3">
        Linha da meta · barras de volume · filtros de data/campanha/gestor recalculam o gráfico
      </p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartHora} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="hora" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 100]} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <Tooltip />
            <Legend />
            <Bar yAxisId="r" dataKey="total" name="Tabuladas" fill="#93c5fd" radius={[4, 4, 0, 0]} />
            <Line yAxisId="l" dataKey="pct_cpc" name="CPC%" stroke="#0f766e" strokeWidth={2} dot={false} />
            <Line yAxisId="l" dataKey="meta" name="Meta" stroke="#dc2626" strokeDasharray="4 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
