import { useEffect, useState } from 'react';
import { Users, Search, ArrowUpDown } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';

interface OperadorRanking {
  vendedor: string;
  equipe: string;
  supervisor: string;
  total_propostas: number;
  total_corrigidas: number;
  taxa_erro_pct: number;
  erros_cep: number;
  erros_logradouro: number;
  erros_bairro: number;
  erros_cidade: number;
  erros_uf: number;
  erros_numero: number;
  erros_complemento: number;
  erros_referencia: number;
}

type SortField = 'taxa_erro_pct' | 'total_corrigidas' | 'erros_cep' | 'erros_referencia';

export function OperadoresPage() {
  const [operadores, setOperadores] = useState<OperadorRanking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('taxa_erro_pct');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('ranking_operadores')
        .select('*')
        .order('taxa_erro_pct', { ascending: false });
      setOperadores((data ?? []) as OperadorRanking[]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = operadores
    .filter((o) =>
      !search || o.vendedor?.toLowerCase().includes(search.toLowerCase())
      || o.equipe?.toLowerCase().includes(search.toLowerCase())
      || o.supervisor?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0));

  return (
    <AdminLayout title="Ranking Operadores" subtitle="Quem mais erra, por campo">
      {/* Search + Sort */}
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field text-sm py-2 pl-9"
              placeholder="Buscar vendedor, equipe ou supervisor..."
            />
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown size={14} className="text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="input-field text-sm py-2 w-44"
            >
              <option value="taxa_erro_pct">Taxa de erro</option>
              <option value="total_corrigidas">Total corrigidas</option>
              <option value="erros_cep">Erros de CEP</option>
              <option value="erros_referencia">Erros de referencia</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => <div key={i} className="card h-16 skeleton" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p>Nenhum operador encontrado.</p>
        </div>
      ) : (
        <div className="card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 text-xs">
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Vendedor</th>
                <th className="text-left px-4 py-3 font-medium">Equipe</th>
                <th className="text-left px-4 py-3 font-medium">Supervisor</th>
                <th className="text-right px-4 py-3 font-medium">Props</th>
                <th className="text-right px-4 py-3 font-medium">Corrig</th>
                <th className="text-right px-4 py-3 font-medium">Taxa%</th>
                <th className="text-right px-4 py-3 font-medium">CEP</th>
                <th className="text-right px-4 py-3 font-medium">Logr</th>
                <th className="text-right px-4 py-3 font-medium">Bairro</th>
                <th className="text-right px-4 py-3 font-medium">Num</th>
                <th className="text-right px-4 py-3 font-medium">Ref</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <tr key={`${o.vendedor}-${i}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900 max-w-[160px] truncate">{o.vendedor || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{o.equipe || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{o.supervisor || '-'}</td>
                  <td className="px-4 py-3 text-right">{o.total_propostas}</td>
                  <td className="px-4 py-3 text-right text-amber-600 font-semibold">{o.total_corrigidas}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`badge ${
                      o.taxa_erro_pct > 60 ? 'bg-red-50 text-red-600'
                      : o.taxa_erro_pct > 40 ? 'bg-amber-50 text-amber-600'
                      : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {o.taxa_erro_pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-red-500 font-medium">{o.erros_cep || '-'}</td>
                  <td className="px-4 py-3 text-right">{o.erros_logradouro || '-'}</td>
                  <td className="px-4 py-3 text-right">{o.erros_bairro || '-'}</td>
                  <td className="px-4 py-3 text-right">{o.erros_numero || '-'}</td>
                  <td className="px-4 py-3 text-right text-orange-500 font-medium">{o.erros_referencia || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
