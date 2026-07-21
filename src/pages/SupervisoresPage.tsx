import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';

interface SupervisorRanking {
  supervisor: string;
  equipe: string;
  total_vendedores: number;
  total_propostas: number;
  total_corrigidas: number;
  taxa_erro_pct: number;
  score_medio: number;
  erros_cep: number;
  erros_referencia: number;
  erros_bairro: number;
}

export function SupervisoresPage() {
  const [supervisores, setSupervisores] = useState<SupervisorRanking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('ranking_supervisores')
        .select('*')
        .order('taxa_erro_pct', { ascending: false });
      setSupervisores((data ?? []) as SupervisorRanking[]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const getMedal = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}`;
  };

  return (
    <AdminLayout title="Ranking Supervisores" subtitle="Desempenho por equipe - ultimos 30 dias">
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-40 skeleton" />)}
        </div>
      ) : supervisores.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <Trophy size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sem dados de supervisores no periodo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {supervisores.map((s, i) => (
            <div key={`${s.supervisor}-${s.equipe}`} className="card p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getMedal(i)}</span>
                  <div>
                    <p className="font-bold text-gray-900">{s.supervisor || 'Sem supervisor'}</p>
                    <p className="text-xs text-gray-500">{s.equipe || '-'}</p>
                  </div>
                </div>
                <span className={`badge text-sm ${
                  s.taxa_erro_pct > 50 ? 'bg-red-50 text-red-600'
                  : s.taxa_erro_pct > 30 ? 'bg-amber-50 text-amber-600'
                  : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {s.taxa_erro_pct.toFixed(1)}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-gray-400">Vendedores</p>
                  <p className="text-lg font-bold text-gray-900">{s.total_vendedores}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Propostas</p>
                  <p className="text-lg font-bold text-blue-600">{s.total_propostas}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Corrigidas</p>
                  <p className="text-lg font-bold text-amber-600">{s.total_corrigidas}</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Top erros da equipe:</p>
                <div className="flex gap-2 flex-wrap">
                  {s.erros_cep > 0 && (
                    <span className="badge bg-red-50 text-red-600">CEP: {s.erros_cep}</span>
                  )}
                  {s.erros_referencia > 0 && (
                    <span className="badge bg-orange-50 text-orange-600">Ref: {s.erros_referencia}</span>
                  )}
                  {s.erros_bairro > 0 && (
                    <span className="badge bg-purple-50 text-purple-600">Bairro: {s.erros_bairro}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
