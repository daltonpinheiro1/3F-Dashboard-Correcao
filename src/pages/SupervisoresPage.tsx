import { useEffect, useState, useCallback } from 'react';
import { Trophy, Calendar } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';
import { getDefaultDateRange } from '../lib/dateFilter';

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
}

export function SupervisoresPage() {
  const defaults = getDefaultDateRange();
  const [supervisores, setSupervisores] = useState<SupervisorRanking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('correcao_logs')
        .select('vendedor, equipe, supervisor, campos_alterados')
        .limit(2000);
      if (dateFrom) query = query.gte('data_venda', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('data_venda', `${dateTo}T23:59:59`);

      const { data } = await query;
      const items = data ?? [];

      // Calcular ranking por supervisor
      const map: Record<string, { supervisor: string; equipe: string; vendedores: Set<string>; total: number; corrigidas: number; cep: number; ref: number; bairro: number }> = {};
      items.forEach((l: any) => {
        const sup = l.supervisor || 'Sem supervisor';
        const eq = l.equipe || '-';
        const key = `${sup}|${eq}`;
        if (!map[key]) map[key] = { supervisor: sup, equipe: eq, vendedores: new Set(), total: 0, corrigidas: 0, cep: 0, ref: 0, bairro: 0 };
        const m = map[key];
        m.total += 1;
        if (l.vendedor) m.vendedores.add(l.vendedor);
        const campos = l.campos_alterados ?? [];
        const reais = campos.filter((c: string) => c !== 'referencia');
        if (reais.length > 0) m.corrigidas += 1;
        if (campos.includes('cep')) m.cep += 1;
        if (campos.includes('referencia')) m.ref += 1;
        if (campos.includes('bairro')) m.bairro += 1;
      });

      const ranking = Object.values(map)
        .map((s) => ({
          supervisor: s.supervisor,
          equipe: s.equipe,
          total_vendedores: s.vendedores.size,
          total_propostas: s.total,
          total_corrigidas: s.corrigidas,
          taxa_erro_pct: s.total > 0 ? Math.round((s.corrigidas / s.total) * 1000) / 10 : 0,
          erros_cep: s.cep,
          erros_referencia: s.ref,
          erros_bairro: s.bairro,
        }))
        .filter((s) => s.supervisor !== 'Sem supervisor' || s.total_propostas > 2)
        .sort((a, b) => a.taxa_erro_pct - b.taxa_erro_pct);

      setSupervisores(ranking);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getMedal = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}`;
  };

  return (
    <AdminLayout title="Ranking Supervisores" subtitle="Desempenho por equipe (menor taxa = melhor)">
      {/* Date filter */}
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex items-center gap-3">
          <Calendar size={14} className="text-gray-400" />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field text-sm py-2 w-36" />
          <span className="text-xs text-gray-400">até</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field text-sm py-2 w-36" />
          <p className="text-xs text-gray-400 ml-auto">{supervisores.length} equipes</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="card h-40 skeleton" />)}</div>
      ) : supervisores.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <Trophy size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sem dados no período selecionado.</p>
        </div>
      ) : (
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
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
