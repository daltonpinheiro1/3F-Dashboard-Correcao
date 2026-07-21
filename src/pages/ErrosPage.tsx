import { useEffect, useState } from 'react';
import { PieChart } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';

interface ErroEstratificado {
  tipo_erro: string;
  total: number;
  vendedores_afetados: number;
  equipes_afetadas: number;
}

const erroLabels: Record<string, string> = {
  cep_incorreto: 'CEP incorreto',
  logradouro_incorreto: 'Logradouro incorreto',
  logradouro_acentuacao: 'Logradouro (acentuacao)',
  bairro_incorreto: 'Bairro incorreto',
  cidade_incorreta: 'Cidade incorreta',
  uf_incorreta: 'UF incorreta',
  numero_invalido: 'Numero invalido',
  complemento_link: 'Complemento com link',
  complemento_incorreto: 'Complemento incorreto',
  referencia_vazia: 'Referencia vazia',
  referencia_link: 'Referencia com link',
  referencia_tratamento: 'Referencia (tratamento)',
};

const erroColors: Record<string, string> = {
  cep_incorreto: 'bg-red-500',
  logradouro_incorreto: 'bg-orange-500',
  logradouro_acentuacao: 'bg-orange-300',
  bairro_incorreto: 'bg-purple-500',
  cidade_incorreta: 'bg-pink-500',
  uf_incorreta: 'bg-rose-500',
  numero_invalido: 'bg-amber-500',
  complemento_link: 'bg-yellow-500',
  complemento_incorreto: 'bg-yellow-400',
  referencia_vazia: 'bg-teal-500',
  referencia_link: 'bg-cyan-500',
  referencia_tratamento: 'bg-blue-500',
};

export function ErrosPage() {
  const [erros, setErros] = useState<ErroEstratificado[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('estratificacao_erros')
        .select('*');
      setErros((data ?? []) as ErroEstratificado[]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const totalErros = erros.reduce((s, e) => s + e.total, 0);

  return (
    <AdminLayout title="Estratificacao de Erros" subtitle="Tipos de erro por frequencia - ultimos 30 dias">
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-16 skeleton" />)}
        </div>
      ) : erros.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <PieChart size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sem dados de erros no periodo.</p>
        </div>
      ) : (
        <>
          {/* Bar chart visual */}
          <div className="card p-6 shadow-sm mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-4">Distribuicao de erros</h3>
            <div className="space-y-3">
              {erros.map((e) => {
                const pct = totalErros > 0 ? (e.total / totalErros) * 100 : 0;
                return (
                  <div key={e.tipo_erro} className="flex items-center gap-3">
                    <div className="w-36 text-xs font-medium text-gray-600 truncate">
                      {erroLabels[e.tipo_erro] ?? e.tipo_erro}
                    </div>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${erroColors[e.tipo_erro] ?? 'bg-gray-400'}`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <div className="w-16 text-right text-xs font-bold text-gray-700">
                      {e.total} ({pct.toFixed(0)}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed table */}
          <div className="card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-xs">
                  <th className="text-left px-6 py-3 font-medium">Tipo de Erro</th>
                  <th className="text-right px-6 py-3 font-medium">Ocorrencias</th>
                  <th className="text-right px-6 py-3 font-medium">Vendedores</th>
                  <th className="text-right px-6 py-3 font-medium">Equipes</th>
                  <th className="text-right px-6 py-3 font-medium">% do Total</th>
                </tr>
              </thead>
              <tbody>
                {erros.map((e) => (
                  <tr key={e.tipo_erro} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${erroColors[e.tipo_erro] ?? 'bg-gray-400'}`} />
                        <span className="font-medium text-gray-900">
                          {erroLabels[e.tipo_erro] ?? e.tipo_erro}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right font-bold text-gray-900">{e.total}</td>
                    <td className="px-6 py-3 text-right text-gray-600">{e.vendedores_afetados}</td>
                    <td className="px-6 py-3 text-right text-gray-600">{e.equipes_afetadas}</td>
                    <td className="px-6 py-3 text-right">
                      <span className="badge bg-gray-100 text-gray-700">
                        {totalErros > 0 ? ((e.total / totalErros) * 100).toFixed(1) : 0}%
                      </span>
                    </td>
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
