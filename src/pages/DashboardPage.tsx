import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3, CheckCircle2, AlertTriangle, TrendingUp,
  Users, Clock, Filter, Calendar, RefreshCw
} from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';

interface DashboardStats {
  totalPropostas: number;
  totalCorrigidas: number;
  taxaErro: number;
  tempoMedio: number;
  topErro: string;
  supervisoresAtivos: number;
}

interface SupervisorResumo {
  supervisor: string;
  equipe: string;
  total_propostas: number;
  total_corrigidas: number;
  taxa_erro_pct: number;
}

import { isErroOperacional, temErroOperacional } from '../lib/erroClassification';

function formatSupervisor(s: string | null): string {
  if (!s || s === '-' || s.trim() === '') return 'Não identificado';
  return s;
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [supervisores, setSupervisores] = useState<SupervisorResumo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setIsRefreshing(true);
    try {
      // Paginação para buscar TODOS os registros
      let allItems: any[] = [];
      let offset = 0;
      while (true) {
        let query = supabase
          .from('correcao_logs')
          .select('id, campos_alterados, elapsed_ms, tipos_erro, supervisor, equipe, data_venda, vendedor')
          .order('created_at', { ascending: false })
          .range(offset, offset + 999);

        if (dateFrom) query = query.gte('data_venda', `${dateFrom}T00:00:00`);
        if (dateTo) query = query.lte('data_venda', `${dateTo}T23:59:59`);

        const { data: logs } = await query;
        const batch = logs ?? [];
        allItems = [...allItems, ...batch];
        if (batch.length < 1000) break;
        offset += 1000;
      }
      const items = allItems;

      const total = items.length;
      // Só conta como "corrigida" se houve erro operacional REAL
      // referencia_tratamento e logradouro_acentuacao NÃO contam
      const corrigidas = items.filter((l) => {
        const tipos = l.tipos_erro ?? [];
        return temErroOperacional(tipos);
      }).length;
      const tempoMedio = total > 0
        ? Math.round(items.reduce((s, l) => s + (l.elapsed_ms ?? 0), 0) / total)
        : 0;

      // Top erro (apenas erros operacionais)
      const erroCounts: Record<string, number> = {};
      items.forEach((l) => {
        (l.tipos_erro ?? []).forEach((e: string) => {
          if (isErroOperacional(e)) {
            erroCounts[e] = (erroCounts[e] || 0) + 1;
          }
        });
      });
      const topErro = Object.entries(erroCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';

      // Supervisores únicos
      const supsUnicos = new Set(items.map((l) => l.supervisor).filter(Boolean));

      setStats({
        totalPropostas: total,
        totalCorrigidas: corrigidas,
        taxaErro: total > 0 ? (corrigidas / total) * 100 : 0,
        tempoMedio,
        topErro,
        supervisoresAtivos: supsUnicos.size,
      });

      // Ranking supervisores — calculado com MESMO filtro de data (não view fixa 30 dias)
      const supMap: Record<string, { supervisor: string; equipe: string; total: number; corrigidas: number }> = {};
      items.forEach((l) => {
        const sup = l.supervisor || 'Não identificado';
        const eq = l.equipe || '-';
        const key = `${sup}|${eq}`;
        if (!supMap[key]) supMap[key] = { supervisor: sup, equipe: eq, total: 0, corrigidas: 0 };
        supMap[key].total += 1;
        const tipos = l.tipos_erro ?? [];
        if (temErroOperacional(tipos)) supMap[key].corrigidas += 1;
      });
      const rankingSups = Object.values(supMap)
        .map((s) => ({
          ...s,
          total_propostas: s.total,
          total_corrigidas: s.corrigidas,
          taxa_erro_pct: s.total > 0 ? Math.round((s.corrigidas / s.total) * 1000) / 10 : 0,
        }))
        .filter((s) => s.supervisor !== 'Não identificado' || s.total > 2)
        .sort((a, b) => a.taxa_erro_pct - b.taxa_erro_pct);
      setSupervisores(rankingSups as SupervisorResumo[]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setLastUpdate(new Date());
    }
  }, [dateFrom, dateTo]);

  // Auto-refresh a cada 10 minutos
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(false), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = () => fetchData(false);

  const metricCards = [
    { icon: BarChart3, label: 'Total propostas', value: stats?.totalPropostas ?? 0, format: (v: number) => v.toString(), color: 'text-blue-600', bg: 'bg-blue-50' },
    { icon: CheckCircle2, label: 'Sem erro', value: (stats?.totalPropostas ?? 0) - (stats?.totalCorrigidas ?? 0), format: (v: number) => v.toString(), color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { icon: AlertTriangle, label: 'Com erro', value: stats?.totalCorrigidas ?? 0, format: (v: number) => v.toString(), color: 'text-amber-600', bg: 'bg-amber-50' },
    { icon: TrendingUp, label: 'Taxa de erro', value: stats?.taxaErro ?? 0, format: (v: number) => `${v.toFixed(1)}%`, color: 'text-red-500', bg: 'bg-red-50' },
    { icon: Clock, label: 'Tempo medio', value: stats?.tempoMedio ?? 0, format: (v: number) => `${(v / 1000).toFixed(1)}s`, color: 'text-purple-600', bg: 'bg-purple-50' },
    { icon: Users, label: 'Supervisores', value: stats?.supervisoresAtivos ?? 0, format: (v: number) => v.toString(), color: 'text-teal-600', bg: 'bg-teal-50' },
  ];

  return (
    <AdminLayout title="Dashboard" subtitle="Visao consolidada - Correção Cadastral">
      {/* Filters */}
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <Filter size={14} className="text-gray-400 flex-shrink-0 hidden sm:block" />
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar size={14} className="text-gray-400 flex-shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-field text-sm py-2 w-full sm:w-40"
              aria-label="Data inicial"
            />
            <span className="text-xs text-gray-400">ate</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-field text-sm py-2 w-full sm:w-40"
              aria-label="Data final"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="text-xs text-blue-600 font-semibold hover:text-blue-700"
            >
              Limpar
            </button>
          )}

          {/* Refresh button */}
          <div className="ml-auto flex items-center gap-2">
            <span className="badge bg-emerald-50 text-emerald-600 hidden sm:inline-flex">
              Auto: 10min
            </span>
            <span className="text-xs text-gray-400 hidden sm:inline">
              {lastUpdate.toLocaleTimeString('pt-BR')}
            </span>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3 disabled:opacity-50"
              title="Atualizar dados"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="card p-6 h-28 skeleton" />)}
        </div>
      ) : error ? (
        <div className="card p-6 shadow-sm text-center">
          <AlertTriangle size={32} className="mx-auto mb-3 text-red-400" />
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <button onClick={handleRefresh} className="btn-primary mt-4 text-sm">
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {metricCards.map((m, i) => (
              <div key={m.label} className="card p-6 shadow-sm hover-lift ring-highlight card-enter" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">{m.label}</span>
                  <div className={`w-9 h-9 ${m.bg} rounded-xl flex items-center justify-center`}>
                    <m.icon size={18} className={m.color} />
                  </div>
                </div>
                <div className={`text-3xl font-black ${m.color}`}>
                  {m.format(m.value)}
                </div>
              </div>
            ))}
          </div>

          {/* Supervisor ranking table */}
          <div className="card shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Ranking Supervisores</h2>
              <p className="text-xs text-gray-400 mt-0.5">Por taxa de erro operacional (menor = melhor)</p>
            </div>
            {supervisores.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-400">
                <Users size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">Sem dados no periodo selecionado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500">
                      <th className="text-left px-6 py-3 font-medium">#</th>
                      <th className="text-left px-6 py-3 font-medium">Supervisor</th>
                      <th className="text-left px-6 py-3 font-medium">Equipe</th>
                      <th className="text-right px-6 py-3 font-medium">Propostas</th>
                      <th className="text-right px-6 py-3 font-medium">Corrigidas</th>
                      <th className="text-right px-6 py-3 font-medium">Taxa Erro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supervisores.map((s, i) => (
                      <tr key={`${s.supervisor}-${s.equipe}`} className="border-b border-gray-50 hover:bg-blue-50/50 transition-all duration-200 fade-slide-up" style={{ animationDelay: `${i * 40 + 200}ms` }}>
                        <td className="px-6 py-3 font-bold text-gray-400">{i + 1}</td>
                        <td className="px-6 py-3 font-semibold text-gray-900">{formatSupervisor(s.supervisor)}</td>
                        <td className="px-6 py-3 text-gray-600">{s.equipe || '-'}</td>
                        <td className="px-6 py-3 text-right">{s.total_propostas}</td>
                        <td className="px-6 py-3 text-right text-amber-600 font-semibold">{s.total_corrigidas}</td>
                        <td className="px-6 py-3 text-right">
                          <span className={`badge ${
                            s.taxa_erro_pct < 50 ? 'bg-emerald-50 text-emerald-600'
                            : s.taxa_erro_pct < 75 ? 'bg-amber-50 text-amber-600'
                            : 'bg-red-50 text-red-600'
                          }`}>
                            {s.taxa_erro_pct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
                  {supervisores.length} supervisores · {supervisores.reduce((s, r) => s + r.total_propostas, 0)} propostas no total
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
}
