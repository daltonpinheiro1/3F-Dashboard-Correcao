import { useEffect, useState, useCallback } from 'react';
import { Trophy, Calendar, MessageSquare, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { fetchCuboOverview } from '../lib/cuboOverview';
import { getMonthRange } from '../lib/dateFilter';

interface SupervisorRanking {
  supervisor: string;
  equipe: string;
  total_vendedores: number;
  total_propostas: number;
  total_corrigidas: number;
  taxa_erro_pct: number;
  erros_cep: number;
  erros_referencia: number;
  erros_bairro: number;
  // SMS
  sms_total: number;
  sms_com: number;
  sms_adesao: number;
  sms_sucesso_com: number;
  sms_sucesso_sem: number;
  sms_pct_suc_com: number;
  sms_pct_suc_sem: number;
}

export function SupervisoresPage() {
  const defaults = getMonthRange();
  const [supervisores, setSupervisores] = useState<SupervisorRanking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const overview = await fetchCuboOverview(dateFrom, dateTo);
      setSupervisores(overview.supervisores as SupervisorRanking[]);
    } catch (err) {
      console.error(err);
      setFetchError(err instanceof Error ? err.message : 'Falha ao carregar supervisores');
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getMedal = (index: number) => `#${index + 1}`;

  return (
    <AdminLayout title="Ranking Supervisores" subtitle="Desempenho por equipe (menor taxa = melhor) · SMS unificado">
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={14} className="text-gray-400" />
          <input id="sup-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Data inicial" className="input-field text-sm py-2 w-36" />
          <span className="text-xs text-gray-400">até</span>
          <input id="sup-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            aria-label="Data final" className="input-field text-sm py-2 w-36" />
          <button type="button" onClick={() => { const r = getMonthRange(); setDateFrom(r.dateFrom); setDateTo(r.dateTo); }}
            className="text-xs text-blue-600 font-semibold">Mês atual</button>
          <p className="text-xs text-gray-400 ml-auto">{supervisores.length} equipes</p>
        </div>
      </div>

      {fetchError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3" role="alert">
          <AlertCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Erro ao carregar</p>
            <p className="text-xs text-red-600 mt-0.5">{fetchError}</p>
            <button type="button" onClick={fetchData} className="mt-2 text-xs font-semibold text-red-700 underline">Tentar novamente</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="card h-40 skeleton" />)}</div>
      ) : supervisores.length === 0 && !fetchError ? (
        <div className="card p-12 text-center text-gray-400">
          <Trophy size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sem dados no período selecionado.</p>
        </div>
      ) : supervisores.length === 0 ? null : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {supervisores.map((s, i) => (
            <div key={`${s.supervisor}-${s.equipe}`} className="card p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getMedal(i)}</span>
                  <div>
                    <p className="font-bold text-gray-900">{s.supervisor}</p>
                    <p className="text-xs text-gray-500">{s.equipe}</p>
                  </div>
                </div>
                <span className={`badge text-sm ${s.taxa_erro_pct < 20 ? 'bg-emerald-50 text-emerald-600' : s.taxa_erro_pct < 40 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                  {s.taxa_erro_pct.toFixed(1)}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><p className="text-xs text-gray-400">Vendedores</p><p className="text-lg font-bold text-gray-900">{s.total_vendedores}</p></div>
                <div><p className="text-xs text-gray-400">Propostas</p><p className="text-lg font-bold text-blue-600">{s.total_propostas}</p></div>
                <div><p className="text-xs text-gray-400">Corrigidas</p><p className="text-lg font-bold text-amber-600">{s.total_corrigidas}</p></div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Top erros:</p>
                <div className="flex gap-2 flex-wrap">
                  {s.erros_cep > 0 && <span className="badge bg-red-50 text-red-600">CEP: {s.erros_cep}</span>}
                  {s.erros_referencia > 0 && <span className="badge bg-orange-50 text-orange-600">Ref: {s.erros_referencia}</span>}
                  {s.erros_bairro > 0 && <span className="badge bg-purple-50 text-purple-600">Bairro: {s.erros_bairro}</span>}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 text-xs font-semibold">
                <Link
                  to={`/operadores?${new URLSearchParams({ supervisor: s.supervisor, equipe: s.equipe, dateFrom, dateTo })}`}
                  className="text-blue-600 hover:underline"
                >
                  Ver operadores
                </Link>
                <Link
                  to={`/sms?${new URLSearchParams({ supervisor: s.supervisor, equipe: s.equipe, dateFrom, dateTo })}`}
                  className="text-purple-600 hover:underline"
                >
                  Ver SMS
                </Link>
              </div>
              {/* SMS Prévio */}
              {s.sms_total > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><MessageSquare size={10} /> SMS Previo</p>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="bg-blue-50 rounded-lg p-1.5">
                      <p className="font-bold text-blue-600">{s.sms_total}</p>
                      <p className="text-blue-700">Port.</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-1.5">
                      <p className="font-bold text-emerald-600">{s.sms_adesao}%</p>
                      <p className="text-emerald-700">Adesao</p>
                    </div>
                    <div className="bg-teal-50 rounded-lg p-1.5">
                      <p className="font-bold text-teal-600">{s.sms_pct_suc_com}%</p>
                      <p className="text-teal-700">Suc c/</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
