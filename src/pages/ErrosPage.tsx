import { useEffect, useState } from 'react';
import { PieChart, X, Copy, CheckCircle2, Calendar } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';
import { getDefaultDateRange } from '../lib/dateFilter';

interface ErroEstratificado {
  tipo_erro: string;
  total: number;
  vendedores_afetados: number;
  equipes_afetadas: number;
}

interface PropostaErro {
  id: string;
  proposta_id: string;
  vendedor: string;
  equipe: string;
  created_at: string;
  alteracoes: Record<string, { de: string; para: string }>;
}

const erroLabels: Record<string, string> = {
  cep_incorreto: 'CEP incorreto',
  logradouro_incorreto: 'Logradouro incorreto',
  logradouro_acentuacao: 'Logradouro (acentuação)',
  bairro_incorreto: 'Bairro incorreto',
  cidade_incorreta: 'Cidade incorreta',
  uf_incorreta: 'UF incorreta',
  numero_invalido: 'Número inválido',
  complemento_link: 'Complemento com link',
  complemento_incorreto: 'Complemento incorreto',
  referencia_vazia: 'Referência vazia',
  referencia_link: 'Referência com link',
  referencia_tratamento: 'Referência (tratamento)',
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

const campoLabels: Record<string, string> = {
  cep: 'CEP', logradouro: 'Logradouro', bairro: 'Bairro',
  cidade: 'Cidade', uf: 'UF', numero: 'Número',
  complemento: 'Complemento', referencia: 'Referência',
};

export function ErrosPage() {
  const defaults = getDefaultDateRange();
  const [erros, setErros] = useState<ErroEstratificado[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedErro, setSelectedErro] = useState<string | null>(null);
  const [propostas, setPropostas] = useState<PropostaErro[]>([]);
  const [loadingPropostas, setLoadingPropostas] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);

  useEffect(() => { fetchData(); }, [dateFrom, dateTo]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('correcao_logs')
        .select('tipos_erro, vendedor, equipe')
        .limit(2000);
      if (dateFrom) query = query.gte('data_venda', `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte('data_venda', `${dateTo}T23:59:59`);

      const { data } = await query;
      const items = data ?? [];

      // Calcular estratificação localmente
      const map: Record<string, { total: number; vendedores: Set<string>; equipes: Set<string> }> = {};
      items.forEach((l: any) => {
        (l.tipos_erro ?? []).forEach((tipo: string) => {
          if (!map[tipo]) map[tipo] = { total: 0, vendedores: new Set(), equipes: new Set() };
          map[tipo].total += 1;
          if (l.vendedor) map[tipo].vendedores.add(l.vendedor);
          if (l.equipe) map[tipo].equipes.add(l.equipe);
        });
      });

      const result = Object.entries(map)
        .map(([tipo, d]) => ({
          tipo_erro: tipo,
          total: d.total,
          vendedores_afetados: d.vendedores.size,
          equipes_afetadas: d.equipes.size,
        }))
        .sort((a, b) => b.total - a.total);

      setErros(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const openDetail = async (tipoErro: string) => {
    setSelectedErro(tipoErro);
    setLoadingPropostas(true);
    const { data } = await supabase
      .from('correcao_logs')
      .select('id, proposta_id, vendedor, equipe, created_at, alteracoes')
      .contains('tipos_erro', [tipoErro])
      .order('created_at', { ascending: false })
      .limit(30);
    setPropostas((data ?? []) as PropostaErro[]);
    setLoadingPropostas(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const totalErros = erros.reduce((s, e) => s + e.total, 0);

  return (
    <AdminLayout title="Estratificação de Erros" subtitle="Tipos de erro por frequência - clique para detalhar">
      {/* Date filter */}
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex items-center gap-3">
          <Calendar size={14} className="text-gray-400" />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field text-sm py-2 w-36" />
          <span className="text-xs text-gray-400">até</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field text-sm py-2 w-36" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="card h-16 skeleton" />)}
        </div>
      ) : erros.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <PieChart size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sem dados de erros no período.</p>
        </div>
      ) : (
        <>
          {/* Bar chart visual */}
          <div className="card p-6 shadow-sm mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-4">Distribuição de erros</h3>
            <div className="space-y-3">
              {erros.map((e) => {
                const pct = totalErros > 0 ? (e.total / totalErros) * 100 : 0;
                return (
                  <div
                    key={e.tipo_erro}
                    className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-1 -mx-1 transition-colors"
                    onClick={() => openDetail(e.tipo_erro)}
                  >
                    <div className="w-36 text-xs font-medium text-gray-600 truncate">
                      {erroLabels[e.tipo_erro] ?? e.tipo_erro}
                    </div>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${erroColors[e.tipo_erro] ?? 'bg-gray-400'}`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <div className="w-20 text-right text-xs font-bold text-gray-700">
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
                  <th className="text-right px-6 py-3 font-medium">Ocorrências</th>
                  <th className="text-right px-6 py-3 font-medium">Vendedores</th>
                  <th className="text-right px-6 py-3 font-medium">Equipes</th>
                  <th className="text-right px-6 py-3 font-medium">% do Total</th>
                </tr>
              </thead>
              <tbody>
                {erros.map((e) => (
                  <tr
                    key={e.tipo_erro}
                    className="border-b border-gray-50 hover:bg-blue-50 transition-colors cursor-pointer"
                    onClick={() => openDetail(e.tipo_erro)}
                  >
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

      {/* Detail Modal */}
      {selectedErro && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedErro(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full ${erroColors[selectedErro] ?? 'bg-gray-400'}`} />
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {erroLabels[selectedErro] ?? selectedErro}
                  </h3>
                  <p className="text-xs text-gray-400">Propostas com este tipo de erro</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedErro(null)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {loadingPropostas ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}
                </div>
              ) : propostas.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">Nenhuma proposta encontrada.</p>
                </div>
              ) : (
                propostas.map((p) => (
                  <div key={p.id} className="border border-gray-100 rounded-xl p-4 hover:border-blue-200 transition-colors">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(p.proposta_id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            copiedId === p.proposta_id
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700'
                          }`}
                          title="Copiar"
                        >
                          {copiedId === p.proposta_id ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                          {p.proposta_id}
                        </button>
                        <span className="text-xs text-gray-400">
                          {new Date(p.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{p.vendedor || '-'}</span>
                    </div>

                    {/* Alterações */}
                    <div className="space-y-1.5">
                      {Object.entries(p.alteracoes || {}).map(([campo, mudanca]) => {
                        const isRef = campo === 'referencia';
                        return (
                          <div key={campo} className="flex items-start gap-2 text-xs">
                            <span className={`font-semibold w-20 flex-shrink-0 ${isRef ? 'text-blue-500' : 'text-gray-500'}`}>
                              {campoLabels[campo] ?? campo}
                            </span>
                            <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded font-mono line-through">
                              {(mudanca as any).de || '(vazio)'}
                            </span>
                            <span className="text-gray-400">→</span>
                            <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-mono">
                              {(mudanca as any).para || '(vazio)'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
              {propostas.length} propostas (últimas 30)
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
