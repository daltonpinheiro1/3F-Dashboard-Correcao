import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';

interface DiaData {
  dia: string;
  total_propostas: number;
  total_corrigidas: number;
  taxa_erro_pct: number;
  tempo_medio_s: number;
  vendedores_ativos: number;
}

export function EvolucaoPage() {
  const [dados, setDados] = useState<DiaData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('evolucao_diaria')
      .select('*')
      .order('dia', { ascending: false })
      .limit(30);
    setDados((data ?? []) as DiaData[]);
    setIsLoading(false);
  };

  const dadosOrdenados = [...dados].reverse();
  const maxPropostas = Math.max(...dadosOrdenados.map(d => d.total_propostas), 1);

  // Tendência: comparar última semana vs anterior
  const ultimaSemana = dados.slice(0, 7);
  const semanaAnterior = dados.slice(7, 14);
  const mediaUltima = ultimaSemana.length > 0
    ? ultimaSemana.reduce((s, d) => s + d.taxa_erro_pct, 0) / ultimaSemana.length
    : 0;
  const mediaAnterior = semanaAnterior.length > 0
    ? semanaAnterior.reduce((s, d) => s + d.taxa_erro_pct, 0) / semanaAnterior.length
    : 0;
  const tendencia = mediaAnterior > 0 ? ((mediaUltima - mediaAnterior) / mediaAnterior) * 100 : 0;
  const melhorou = tendencia < 0;

  return (
    <AdminLayout title="Evolucao" subtitle="Tendencia de qualidade ao longo do tempo">
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-20 skeleton" />)}
        </div>
      ) : (
        <>
          {/* Tendência card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="card p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Taxa erro (7 dias)</p>
              <p className="text-2xl font-black text-gray-900">{mediaUltima.toFixed(1)}%</p>
            </div>
            <div className="card p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Tendencia vs semana anterior</p>
              <div className={`flex items-center gap-2 text-2xl font-black ${melhorou ? 'text-emerald-600' : 'text-red-500'}`}>
                {melhorou ? <TrendingDown size={24} /> : <TrendingUp size={24} />}
                {Math.abs(tendencia).toFixed(1)}%
                <span className="text-xs font-medium text-gray-400 ml-1">
                  {melhorou ? 'melhoria' : 'piora'}
                </span>
              </div>
            </div>
            <div className="card p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Propostas/dia (media 7d)</p>
              <p className="text-2xl font-black text-blue-600">
                {ultimaSemana.length > 0
                  ? Math.round(ultimaSemana.reduce((s, d) => s + d.total_propostas, 0) / ultimaSemana.length)
                  : 0}
              </p>
            </div>
          </div>

          {/* Gráfico de barras (CSS puro) */}
          <div className="card p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-700">Volume diario (ultimos 30 dias)</h3>
              <Calendar size={14} className="text-gray-400" />
            </div>
            <div className="flex items-end gap-1 h-40">
              {dadosOrdenados.map((d) => (
                <div key={d.dia} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full bg-blue-500 rounded-t-sm hover:bg-blue-600 transition-colors cursor-default"
                    style={{ height: `${(d.total_propostas / maxPropostas) * 100}%`, minHeight: '2px' }}
                    title={`${d.dia}: ${d.total_propostas} propostas, ${d.taxa_erro_pct}% erro`}
                  />
                  {/* Tooltip on hover */}
                  <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                    {new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    : {d.total_propostas} props · {d.taxa_erro_pct}%
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-gray-400">
              <span>{dadosOrdenados[0]?.dia ? new Date(dadosOrdenados[0].dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}</span>
              <span>Hoje</span>
            </div>
          </div>

          {/* Tabela detalhada */}
          <div className="card shadow-sm overflow-x-auto">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700">Detalhamento diario</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-xs">
                  <th className="text-left px-6 py-3">Data</th>
                  <th className="text-right px-6 py-3">Propostas</th>
                  <th className="text-right px-6 py-3">Corrigidas</th>
                  <th className="text-right px-6 py-3">Taxa %</th>
                  <th className="text-right px-6 py-3">Tempo med.</th>
                  <th className="text-right px-6 py-3">Vendedores</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((d) => (
                  <tr key={d.dia} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">
                      {new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-3 text-right">{d.total_propostas}</td>
                    <td className="px-6 py-3 text-right text-amber-600 font-semibold">{d.total_corrigidas}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={`badge ${
                        d.taxa_erro_pct < 50 ? 'bg-emerald-50 text-emerald-600'
                        : d.taxa_erro_pct < 75 ? 'bg-amber-50 text-amber-600'
                        : 'bg-red-50 text-red-600'
                      }`}>
                        {d.taxa_erro_pct}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-500">{d.tempo_medio_s}s</td>
                    <td className="px-6 py-3 text-right">{d.vendedores_ativos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
