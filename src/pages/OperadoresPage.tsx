import { useEffect, useState } from 'react';
import { Users, Search, ArrowUpDown, X, Copy, CheckCircle2 } from 'lucide-react';
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

interface PropostaDetalhe {
  id: string;
  proposta_id: string;
  created_at: string;
  alteracoes: Record<string, { de: string; para: string }>;
  campos_alterados: string[];
  tipos_erro: string[];
  estrategia: string;
}

type SortField = 'taxa_erro_pct' | 'total_corrigidas' | 'erros_cep' | 'erros_referencia';

const campoLabels: Record<string, string> = {
  cep: 'CEP', logradouro: 'Logradouro', bairro: 'Bairro',
  cidade: 'Cidade', uf: 'UF', numero: 'Número',
  complemento: 'Complemento', referencia: 'Referência',
};

export function OperadoresPage() {
  const [operadores, setOperadores] = useState<OperadorRanking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('taxa_erro_pct');
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<PropostaDetalhe[]>([]);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);
  const [copiedId, setCopiedId] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('ranking_operadores')
      .select('*');
    setOperadores((data ?? []) as OperadorRanking[]);
    setIsLoading(false);
  };

  const openDetail = async (vendedor: string) => {
    setSelectedVendedor(vendedor);
    setLoadingDetalhes(true);
    // Buscar propostas desse vendedor que tiveram alteração REAL (excluindo só referencia)
    const { data } = await supabase
      .from('correcao_logs')
      .select('id, proposta_id, created_at, alteracoes, campos_alterados, tipos_erro, estrategia')
      .eq('vendedor', vendedor)
      .order('created_at', { ascending: false })
      .limit(50);

    // Filtrar: só mostrar onde houve alteração real (não apenas referência)
    const filtered = (data ?? []).filter((d: any) => {
      const campos = d.campos_alterados ?? [];
      const camposReais = campos.filter((c: string) => c !== 'referencia');
      return camposReais.length > 0;
    });

    setDetalhes(filtered as PropostaDetalhe[]);
    setLoadingDetalhes(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const filtered = operadores
    .filter((o) =>
      !search || o.vendedor?.toLowerCase().includes(search.toLowerCase())
      || o.equipe?.toLowerCase().includes(search.toLowerCase())
      || o.supervisor?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      // Para taxa_erro: MAIOR % = pior = primeiro (ranking de quem mais erra)
      return (b[sortBy] ?? 0) - (a[sortBy] ?? 0);
    });

  return (
    <AdminLayout title="Ranking Operadores" subtitle="Quem mais erra, por campo - ultimos 30 dias">
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
          <p className="text-xs text-gray-400 ml-auto">{filtered.length} operadores</p>
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
                <tr
                  key={`${o.vendedor}-${i}`}
                  className="border-b border-gray-50 hover:bg-blue-50 transition-colors cursor-pointer"
                  onClick={() => o.vendedor && openDetail(o.vendedor)}
                >
                  <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold text-blue-700 max-w-[160px] truncate underline decoration-dotted">{o.vendedor || '-'}</td>
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

      {/* Detail Modal */}
      {selectedVendedor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedVendedor(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">{selectedVendedor}</h3>
                <p className="text-xs text-gray-400">Propostas com correção real (exceto apenas ref.)</p>
              </div>
              <button
                onClick={() => setSelectedVendedor(null)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingDetalhes ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}
                </div>
              ) : detalhes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CheckCircle2 size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhuma correção real encontrada para este operador.</p>
                </div>
              ) : (
                detalhes.map((d) => (
                  <div key={d.id} className="border border-gray-100 rounded-xl p-4 hover:border-blue-200 transition-colors">
                    {/* Proposta header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(d.proposta_id); }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            copiedId === d.proposta_id
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                          }`}
                          title="Clique para copiar"
                        >
                          {copiedId === d.proposta_id ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                          {d.proposta_id}
                        </button>
                        <span className="text-xs text-gray-400">
                          {new Date(d.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <span className="badge bg-blue-50 text-blue-600">{d.estrategia || '-'}</span>
                    </div>

                    {/* Alterações antes/depois */}
                    <div className="space-y-2">
                      {Object.entries(d.alteracoes || {}).map(([campo, mudanca]) => {
                        if (campo === 'referencia') return null; // Não mostrar ref como "erro"
                        return (
                          <div key={campo} className="flex items-start gap-2 text-xs">
                            <span className="font-semibold text-gray-500 w-20 flex-shrink-0 pt-0.5">
                              {campoLabels[campo] ?? campo}
                            </span>
                            <div className="flex-1 flex flex-col sm:flex-row gap-1">
                              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded font-mono line-through">
                                {(mudanca as any).de || '(vazio)'}
                              </span>
                              <span className="text-gray-400">→</span>
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-mono">
                                {(mudanca as any).para || '(vazio)'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Tipos de erro badges */}
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {(d.tipos_erro ?? [])
                        .filter((t) => !t.startsWith('referencia'))
                        .map((tipo) => (
                          <span key={tipo} className="badge bg-gray-100 text-gray-600 text-[10px]">
                            {tipo.replace(/_/g, ' ')}
                          </span>
                        ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
              {detalhes.length} propostas com correção real
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
