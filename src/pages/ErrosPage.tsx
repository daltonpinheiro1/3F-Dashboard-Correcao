import { useEffect, useMemo, useState } from 'react';
import { PieChart, X, Copy, CheckCircle2, Calendar } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { SortTh } from '../components/SortTh';
import { supabase } from '../lib/supabase';
import { getDefaultDateRange } from '../lib/dateFilter';
import { erroLabels, erroColors, campoLabels, isErroOperacional } from '../lib/erroClassification';
import { useTableSortFields } from '../lib/tableSort';

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
  const [modalSearch, setModalSearch] = useState('');
  const [modalPage, setModalPage] = useState(1);
  const [hasLoadedAll, setHasLoadedAll] = useState(false);

  useEffect(() => { fetchData(); }, [dateFrom, dateTo]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Paginação para buscar TODOS os registros
      let allItems: any[] = [];
      let offset = 0;
      while (true) {
        let query = supabase
          .from('correcao_logs')
          .select('tipos_erro, vendedor, equipe')
          .order('created_at', { ascending: false })
          .range(offset, offset + 999);
        if (dateFrom) query = query.gte('data_venda', `${dateFrom}T00:00:00`);
        if (dateTo) query = query.lte('data_venda', `${dateTo}T23:59:59`);

        const { data } = await query;
        const batch = data ?? [];
        allItems = [...allItems, ...batch];
        if (batch.length < 1000) break;
        offset += 1000;
      }
      const items = allItems;

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
    setPropostas([]);
    setModalSearch('');
    setModalPage(1);
    setHasLoadedAll(false);
    // Load first 100 items
    let allItems: PropostaErro[] = [];
    let offset = 0;
    let hasMore = true;
    while (hasMore && offset < 200) {
      const count = await loadMorePropostas(tipoErro, offset, allItems);
      if (count < 20) hasMore = false;
      offset += 20;
    }
    setHasLoadedAll(!hasMore);
    setLoadingPropostas(false);
  };

  const loadMorePropostas = async (tipoErro: string, offset: number, accumulator?: PropostaErro[]) => {
    let query = supabase
      .from('correcao_logs')
      .select('id, proposta_id, vendedor, equipe, created_at, alteracoes')
      .contains('tipos_erro', [tipoErro])
      .order('created_at', { ascending: false })
      .range(offset, offset + 19);
    if (dateFrom) query = query.gte('data_venda', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte('data_venda', `${dateTo}T23:59:59`);
    const { data } = await query;
    const newItems = (data ?? []) as PropostaErro[];
    if (accumulator) {
      accumulator.push(...newItems);
      setPropostas([...accumulator]);
    } else {
      setPropostas((prev) => [...prev, ...newItems]);
    }
    return newItems.length;
  };

  // Filter propostas by search term
  const filteredPropostas = propostas.filter((p) => {
    if (!modalSearch) return true;
    const s = modalSearch.toLowerCase();
    return (
      (p.proposta_id || '').toLowerCase().includes(s) ||
      (p.vendedor || '').toLowerCase().includes(s) ||
      (p.equipe || '').toLowerCase().includes(s)
    );
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const totalErros = erros.filter((e) => isErroOperacional(e.tipo_erro)).reduce((s, e) => s + e.total, 0);
  const errosOperacionais = erros.filter((e) => isErroOperacional(e.tipo_erro));
  const errosTratamento = erros.filter((e) => !isErroOperacional(e.tipo_erro));

  const erroRows = useMemo(
    () =>
      erros.map((e) => ({
        ...e,
        _label: erroLabels[e.tipo_erro] ?? e.tipo_erro,
        _pct: totalErros > 0 ? Math.round((e.total / totalErros) * 1000) / 10 : 0,
        _tipo: isErroOperacional(e.tipo_erro) ? 'Erro' : 'Tratamento',
      })),
    [erros, totalErros],
  );
  const {
    sorted: errosSorted,
    sortKey: erroKey,
    sortDir: erroDir,
    toggleSort: toggleErro,
  } = useTableSortFields(erroRows, 'total', 'desc');

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
          {/* Bar chart visual - ERROS OPERACIONAIS */}
          <div className="card p-6 shadow-sm mb-6 card-enter">
            <h3 className="text-sm font-bold text-gray-700 mb-4">Erros Operacionais (contam no ranking)</h3>
            <div className="space-y-3">
              {errosOperacionais.map((e, i) => {
                const pct = totalErros > 0 ? (e.total / totalErros) * 100 : 0;
                return (
                  <div
                    key={e.tipo_erro}
                    className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-1.5 -mx-1.5 transition-all duration-200 fade-slide-up"
                    style={{ animationDelay: `${i * 60}ms` }}
                    onClick={() => openDetail(e.tipo_erro)}
                  >
                    <div className="w-36 text-xs font-medium text-gray-600 truncate">
                      {erroLabels[e.tipo_erro] ?? e.tipo_erro}
                    </div>
                    <div className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${erroColors[e.tipo_erro] ?? 'bg-gray-400'}`}
                        style={{ width: `${Math.max(pct, 2)}%`, transition: `width 0.8s cubic-bezier(0.4, 0, 0.2, 1) ${i * 80}ms` }}
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

          {/* Tratamentos automáticos (NÃO contam como erro) */}
          {errosTratamento.length > 0 && (
            <div className="card p-6 shadow-sm mb-6 opacity-70">
              <h3 className="text-sm font-bold text-gray-400 mb-4">Tratamentos Automáticos (não contam como erro)</h3>
              <div className="space-y-2">
                {errosTratamento.map((e) => (
                  <div
                    key={e.tipo_erro}
                    className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-1 -mx-1 transition-colors"
                    onClick={() => openDetail(e.tipo_erro)}
                  >
                    <div className="w-36 text-xs font-medium text-gray-400 truncate">
                      {erroLabels[e.tipo_erro] ?? e.tipo_erro}
                    </div>
                    <div className="flex-1 h-5 bg-gray-50 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-blue-200" style={{ width: '100%' }} />
                    </div>
                    <div className="w-16 text-right text-xs text-gray-400">
                      {e.total}x
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed table */}
          <div className="card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-xs">
                  <SortTh label="Tipo de Erro" col="_label" sortKey={erroKey} sortDir={erroDir} onSort={toggleErro} align="left" className="px-6 py-3 font-medium" />
                  <SortTh label="Ocorrências" col="total" sortKey={erroKey} sortDir={erroDir} onSort={toggleErro} align="right" className="px-6 py-3 font-medium" />
                  <SortTh label="Vendedores" col="vendedores_afetados" sortKey={erroKey} sortDir={erroDir} onSort={toggleErro} align="right" className="px-6 py-3 font-medium" />
                  <SortTh label="Equipes" col="equipes_afetadas" sortKey={erroKey} sortDir={erroDir} onSort={toggleErro} align="right" className="px-6 py-3 font-medium" />
                  <SortTh label="% do Total" col="_pct" sortKey={erroKey} sortDir={erroDir} onSort={toggleErro} align="right" className="px-6 py-3 font-medium" />
                  <SortTh label="Tipo" col="_tipo" sortKey={erroKey} sortDir={erroDir} onSort={toggleErro} align="center" className="px-6 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(errosSorted as typeof erroRows).map((e) => (
                  <tr
                    key={e.tipo_erro}
                    className={`border-b border-gray-50 hover:bg-blue-50 transition-colors cursor-pointer ${!isErroOperacional(e.tipo_erro) ? 'opacity-50' : ''}`}
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
                    <td className="px-6 py-3 text-center">
                      <span className={`badge text-[10px] ${isErroOperacional(e.tipo_erro) ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-500'}`}>
                        {isErroOperacional(e.tipo_erro) ? 'Erro' : 'Tratamento'}
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
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-6 px-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedErro(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
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

            {/* Filters inside modal */}
            <div className="px-6 py-3 border-b border-gray-50 flex items-center gap-3 flex-wrap">
              <input
                type="text"
                placeholder="Buscar vendedor ou proposta..."
                className="input-field text-xs py-2 flex-1 min-w-[180px]"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
              />
              <span className="text-xs text-gray-400">
                {filteredPropostas.length} de {propostas.length}
              </span>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {loadingPropostas ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}
                </div>
              ) : filteredPropostas.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-sm">Nenhuma proposta encontrada.</p>
                </div>
              ) : (
                <>
                  {filteredPropostas.slice(0, modalPage * 20).map((p) => (
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
                  ))}

                  {/* Load more / pagination */}
                  {modalPage * 20 < filteredPropostas.length && (
                    <button
                      onClick={() => setModalPage((p) => p + 1)}
                      className="w-full py-3 text-center text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                    >
                      Carregar mais ({filteredPropostas.length - modalPage * 20} restantes)
                    </button>
                  )}

                  {/* Load more from server if there might be more */}
                  {propostas.length >= modalPage * 20 && !hasLoadedAll && (
                    <button
                      onClick={async () => {
                        const count = await loadMorePropostas(selectedErro, propostas.length);
                        if (count < 20) setHasLoadedAll(true);
                      }}
                      className="w-full py-3 text-center text-sm font-medium text-purple-600 hover:bg-purple-50 rounded-xl transition-colors border border-dashed border-purple-200"
                    >
                      Buscar mais do servidor...
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Exibindo {Math.min(modalPage * 20, filteredPropostas.length)} de {filteredPropostas.length} propostas
              </span>
              <span className="text-xs text-gray-300">
                {propostas.length} carregadas do servidor
              </span>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
