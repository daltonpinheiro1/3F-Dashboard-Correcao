import { useEffect, useState, useCallback, useMemo } from 'react';
import { Users, Search, X, Copy, CheckCircle2, Calendar, AlertCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { SortTh } from '../components/SortTh';
import { queryCubo, type CuboFilter } from '../lib/cuboQuery';
import { fetchCuboOverview } from '../lib/cuboOverview';
import { getMonthRange } from '../lib/dateFilter';
import { campoLabels } from '../lib/erroClassification';
import { smsDataVendaBounds } from '../lib/smsRules';
import { useTableSortFields } from '../lib/tableSort';

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
  // SMS
  sms_total: number;
  sms_com: number;
  sms_adesao: number;
  sms_suc_com: number;
  sms_pct_suc: number;
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

export function OperadoresPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaults = getMonthRange();
  const [operadores, setOperadores] = useState<OperadorRanking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get('vendedor') || searchParams.get('supervisor') || searchParams.get('equipe') || '');
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('dateFrom') || defaults.dateFrom);
  const [dateTo, setDateTo] = useState(() => searchParams.get('dateTo') || defaults.dateTo);
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<PropostaDetalhe[]>([]);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [detailError, setDetailError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const overview = await fetchCuboOverview(dateFrom, dateTo);
      setOperadores(overview.operadores as OperadorRanking[]);
    } catch (err) {
      console.error(err);
      setFetchError(err instanceof Error ? err.message : 'Falha ao carregar operadores');
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

  const openDetail = async (vendedor: string) => {
    setSelectedVendedor(vendedor);
    setLoadingDetalhes(true);
    setDetailError(null);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('vendedor', vendedor);
      return next;
    }, { replace: true });
    const vendaBounds = smsDataVendaBounds(dateFrom, dateTo);
    const filters: CuboFilter[] = [
      { column: 'vendedor', op: 'eq', value: vendedor },
      { column: 'campos_alterados', op: 'neq', value: '{}' },
    ];
    if (vendaBounds.gte) filters.push({ column: 'data_venda', op: 'gte', value: vendaBounds.gte });
    if (vendaBounds.lte) filters.push({ column: 'data_venda', op: 'lte', value: vendaBounds.lte });
    try {
      const data = await queryCubo<PropostaDetalhe>({
        table: 'correcao_logs',
        select: ['id', 'proposta_id', 'created_at', 'alteracoes', 'campos_alterados', 'tipos_erro', 'estrategia'],
        filters,
        order: { column: 'created_at', ascending: false },
        from: 0,
        to: 49,
      });
      setDetalhes(data);
    } catch (err) {
      console.error(err);
      setDetalhes([]);
      setDetailError(err instanceof Error ? err.message : 'Falha ao carregar detalhes');
    } finally {
      setLoadingDetalhes(false);
    }
  };

  const closeDetail = () => {
    setSelectedVendedor(null);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete('vendedor');
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    const vendedor = searchParams.get('vendedor');
    if (vendedor && vendedor !== selectedVendedor) void openDetail(vendedor);
  // O parâmetro é a fonte do deep link; openDetail sincroniza o estado.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const filtered = useMemo(
    () => {
      const supervisor = (searchParams.get('supervisor') || '').toLowerCase();
      const equipe = (searchParams.get('equipe') || '').toLowerCase();
      return operadores.filter(
        (o) => {
          const matchesSearch =
          !search ||
          o.vendedor?.toLowerCase().includes(search.toLowerCase()) ||
          o.equipe?.toLowerCase().includes(search.toLowerCase()) ||
          o.supervisor?.toLowerCase().includes(search.toLowerCase());
          return matchesSearch
            && (!supervisor || o.supervisor.toLowerCase().includes(supervisor))
            && (!equipe || o.equipe.toLowerCase().includes(equipe));
        },
      );
    },
    [operadores, search, searchParams],
  );
  const {
    sorted: opsSorted,
    sortKey: opKey,
    sortDir: opDir,
    toggleSort: toggleOp,
  } = useTableSortFields(filtered, 'taxa_erro_pct', 'desc');

  return (
    <AdminLayout title="Ranking Operadores" subtitle="Quem mais erra, por campo · SMS com regras unificadas">
      {/* Filters */}
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              className="input-field text-sm py-2 pl-9" placeholder="Buscar vendedor..." />
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <input id="ops-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              aria-label="Data inicial" className="input-field text-sm py-2 w-36" />
            <span className="text-xs text-gray-400">até</span>
            <input id="ops-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              aria-label="Data final" className="input-field text-sm py-2 w-36" />
            <button type="button" onClick={() => { const r = getMonthRange(); setDateFrom(r.dateFrom); setDateTo(r.dateTo); }}
              className="text-xs text-blue-600 font-semibold">Mês atual</button>
          </div>
          <p className="text-xs text-gray-400 ml-auto">{filtered.length} operadores</p>
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
        <div className="space-y-3">{[...Array(8)].map((_, i) => <div key={i} className="card h-16 skeleton" />)}</div>
      ) : filtered.length === 0 && !fetchError ? (
        <div className="card p-12 text-center text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p>Nenhum operador encontrado no período.</p>
        </div>
      ) : filtered.length === 0 ? null : (
        <div className="card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 text-xs">
                <th className="text-left px-4 py-3">#</th>
                <SortTh label="Vendedor" col="vendedor" sortKey={opKey} sortDir={opDir} onSort={toggleOp} align="left" className="px-4 py-3" />
                <SortTh label="Equipe" col="equipe" sortKey={opKey} sortDir={opDir} onSort={toggleOp} align="left" className="px-4 py-3" />
                <SortTh label="Supervisor" col="supervisor" sortKey={opKey} sortDir={opDir} onSort={toggleOp} align="left" className="px-4 py-3" />
                <SortTh label="Props" col="total_propostas" sortKey={opKey} sortDir={opDir} onSort={toggleOp} align="right" className="px-4 py-3" />
                <SortTh label="Corrig" col="total_corrigidas" sortKey={opKey} sortDir={opDir} onSort={toggleOp} align="right" className="px-4 py-3" />
                <SortTh label="Taxa%" col="taxa_erro_pct" sortKey={opKey} sortDir={opDir} onSort={toggleOp} align="right" className="px-4 py-3" />
                <SortTh label="CEP" col="erros_cep" sortKey={opKey} sortDir={opDir} onSort={toggleOp} align="right" className="px-4 py-3" />
                <SortTh label="Ref" col="erros_referencia" sortKey={opKey} sortDir={opDir} onSort={toggleOp} align="right" className="px-4 py-3" />
                <SortTh label="SMS" col="sms_total" sortKey={opKey} sortDir={opDir} onSort={toggleOp} align="right" className="px-3 py-3 text-blue-500" />
                <SortTh label="%Ades" col="sms_adesao" sortKey={opKey} sortDir={opDir} onSort={toggleOp} align="right" className="px-3 py-3 text-emerald-500" />
                <SortTh label="%Suc" col="sms_pct_suc" sortKey={opKey} sortDir={opDir} onSort={toggleOp} align="right" className="px-3 py-3 text-teal-500" />
              </tr>
            </thead>
            <tbody>
              {(opsSorted as OperadorRanking[]).map((o, i) => (
                <tr key={`${o.vendedor}-${i}`}
                  className="border-b border-gray-50 hover:bg-blue-50 transition-colors cursor-pointer"
                  onClick={() => o.vendedor && openDetail(o.vendedor)}
                  onKeyDown={(event) => {
                    if (o.vendedor && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      void openDetail(o.vendedor);
                    }
                  }}
                  tabIndex={0}>
                  <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold text-blue-700 max-w-[160px] truncate underline decoration-dotted">{o.vendedor}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{o.equipe || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{o.supervisor || '-'}</td>
                  <td className="px-4 py-3 text-right">{o.total_propostas}</td>
                  <td className="px-4 py-3 text-right text-amber-600 font-semibold">{o.total_corrigidas}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`badge ${o.taxa_erro_pct > 60 ? 'bg-red-50 text-red-600' : o.taxa_erro_pct > 40 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {o.taxa_erro_pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-red-500 font-medium">{o.erros_cep || '-'}</td>
                  <td className="px-4 py-3 text-right text-orange-500 font-medium">{o.erros_referencia || '-'}</td>
                  <td className="px-3 py-3 text-right text-blue-600 font-medium">{o.sms_total || '-'}</td>
                  <td className="px-3 py-3 text-right">
                    {o.sms_total > 0 ? (
                      <span className={`badge text-[10px] ${o.sms_adesao > 60 ? 'bg-emerald-50 text-emerald-600' : o.sms_adesao > 40 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                        {o.sms_adesao}%
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {o.sms_com > 0 ? (
                      <span className={`badge text-[10px] ${o.sms_pct_suc > 5 ? 'bg-teal-50 text-teal-600' : 'bg-gray-100 text-gray-500'}`}>
                        {o.sms_pct_suc}%
                      </span>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selectedVendedor && (
          <div className="fixed inset-0 z-[80] flex items-start justify-center pt-10 px-4" style={{ left: 'var(--sidebar-w, 0px)' }}>
          <div className="absolute inset-0 z-0 bg-black/50 backdrop-blur-sm" onClick={closeDetail} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-labelledby="operador-detail-title">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 id="operador-detail-title" className="text-base font-bold text-gray-900">{selectedVendedor}</h3>
                <p className="text-xs text-gray-400">Propostas com alterações (azul=IA, vermelho=erro)</p>
              </div>
              <button onClick={closeDetail} className="p-2 hover:bg-gray-100 rounded-xl" aria-label="Fechar detalhes"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingDetalhes ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}</div>
              ) : detailError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center" role="alert">
                  <AlertCircle size={24} className="mx-auto mb-2 text-red-500" />
                  <p className="text-sm font-semibold text-red-700">Erro ao carregar detalhes</p>
                  <p className="text-xs text-red-600 mt-1">{detailError}</p>
                  <button type="button" onClick={() => openDetail(selectedVendedor)} className="mt-3 text-xs font-semibold text-red-700 underline">Tentar novamente</button>
                </div>
              ) : detalhes.length === 0 ? (
                <div className="text-center py-8 text-gray-400"><CheckCircle2 size={32} className="mx-auto mb-2 opacity-40" /><p className="text-sm">Nenhuma alteração no período.</p></div>
              ) : (
                detalhes.map((d) => (
                  <div key={d.id} className="border border-gray-100 rounded-xl p-4 hover:border-blue-200 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); copyToClipboard(d.proposta_id); }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${copiedId === d.proposta_id ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-700'}`}>
                          {copiedId === d.proposta_id ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                          {d.proposta_id}
                        </button>
                        <span className="text-xs text-gray-400">{new Date(d.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                      <span className="badge bg-blue-50 text-blue-600">{d.estrategia || '-'}</span>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(d.alteracoes || {}).map(([campo, mudanca]) => {
                        const isRef = campo === 'referencia';
                        return (
                          <div key={campo} className="flex items-start gap-2 text-xs">
                            <span className={`font-semibold w-20 flex-shrink-0 pt-0.5 ${isRef ? 'text-blue-500' : 'text-gray-500'}`}>
                              {campoLabels[campo] ?? campo}{isRef && <span className="text-[9px] ml-0.5">(IA)</span>}
                            </span>
                            <div className="flex-1 flex flex-col sm:flex-row gap-1">
                              <span className={`px-2 py-0.5 rounded font-mono ${isRef ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-700 line-through'}`}>{(mudanca as any).de || '(vazio)'}</span>
                              <span className="text-gray-400">→</span>
                              <span className={`px-2 py-0.5 rounded font-mono ${isRef ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{(mudanca as any).para || '(vazio)'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {(d.tipos_erro ?? []).map((tipo) => (
                        <span key={tipo} className={`badge text-[10px] ${tipo.startsWith('referencia') ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>{tipo.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">{detalhes.length} propostas</div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
