import { useEffect, useState, useCallback, useMemo } from 'react';
import { Users, Search, X, Copy, CheckCircle2, Calendar, AlertCircle } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { SortTh } from '../components/SortTh';
import { supabase } from '../lib/supabase';
import { getMonthRange } from '../lib/dateFilter';
import { temErroOperacional, campoLabels } from '../lib/erroClassification';
import { hasSmsInfo, isComSms, isPortadoConsolidado } from '../lib/smsRules';
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
  const defaults = getMonthRange();
  const [operadores, setOperadores] = useState<OperadorRanking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<PropostaDetalhe[]>([]);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);
  const [copiedId, setCopiedId] = useState('');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      // Paginação para buscar TODOS os registros
      let allItems: any[] = [];
      let offset = 0;
      while (true) {
        let query = supabase
          .from('correcao_logs')
          .select('vendedor, equipe, supervisor, campos_alterados, tipos_erro')
          .order('created_at', { ascending: false })
          .range(offset, offset + 999);

        if (dateFrom) query = query.gte('data_venda', `${dateFrom}T00:00:00`);
        if (dateTo) query = query.lte('data_venda', `${dateTo}T23:59:59`);

        const { data, error } = await query;
        if (error) throw error;
        const batch = data ?? [];
        allItems = [...allItems, ...batch];
        if (batch.length < 1000) break;
        offset += 1000;
      }
      const items = allItems;

      // Calcular ranking localmente (mesma lógica da view mas com filtro de data)
      const map: Record<string, OperadorRanking> = {};
      items.forEach((l: any) => {
        const vend = l.vendedor || '';
        if (!vend) return;
        if (!map[vend]) {
          map[vend] = {
            vendedor: vend, equipe: l.equipe || '', supervisor: l.supervisor || '',
            total_propostas: 0, total_corrigidas: 0, taxa_erro_pct: 0,
            erros_cep: 0, erros_logradouro: 0, erros_bairro: 0, erros_cidade: 0,
            erros_uf: 0, erros_numero: 0, erros_complemento: 0, erros_referencia: 0,
            sms_total: 0, sms_com: 0, sms_adesao: 0, sms_suc_com: 0, sms_pct_suc: 0,
          };
        }
        const o = map[vend];
        o.total_propostas += 1;
        const tipos = l.tipos_erro ?? [];
        if (temErroOperacional(tipos)) o.total_corrigidas += 1;
        const campos = l.campos_alterados ?? [];
        if (campos.includes('cep')) o.erros_cep += 1;
        if (campos.includes('logradouro')) o.erros_logradouro += 1;
        if (campos.includes('bairro')) o.erros_bairro += 1;
        if (campos.includes('cidade')) o.erros_cidade += 1;
        if (campos.includes('uf')) o.erros_uf += 1;
        if (campos.includes('numero')) o.erros_numero += 1;
        if (campos.includes('complemento')) o.erros_complemento += 1;
        const tiposRef = tipos.filter((t: string) => t.startsWith('referencia_') && t !== 'referencia_tratamento');
        if (tiposRef.length > 0) o.erros_referencia += 1;
      });

      const ranking = Object.values(map).map((o) => ({
        ...o,
        taxa_erro_pct: o.total_propostas > 0 ? Math.round((o.total_corrigidas / o.total_propostas) * 1000) / 10 : 0,
      }));

      // Buscar SMS Prévio por vendedor — mesmas regras do SmsPage
      let smsItems: any[] = [];
      let smsOff = 0;
      while (true) {
        let sq = supabase
          .from('sms_eficiencia')
          .select('vendedor, sms_previo, classificacao, ticket_status')
          .order('proposta_id', { ascending: true })
          .range(smsOff, smsOff + 999);
        if (dateFrom) sq = sq.gte('data_venda', `${dateFrom}T00:00:00`);
        if (dateTo) sq = sq.lte('data_venda', `${dateTo}T23:59:59`);
        const { data: smsBatch, error: smsErr } = await sq;
        if (smsErr) throw smsErr;
        const batch = smsBatch ?? [];
        smsItems = [...smsItems, ...batch];
        if (batch.length < 1000) break;
        smsOff += 1000;
      }

      const smsVendMap: Record<string, { total: number; com: number; suc_com: number }> = {};
      smsItems.filter((s) => hasSmsInfo(s.sms_previo)).forEach((s: any) => {
        const vend = s.vendedor || '';
        if (!vend) return;
        if (!smsVendMap[vend]) smsVendMap[vend] = { total: 0, com: 0, suc_com: 0 };
        smsVendMap[vend].total += 1;
        if (isComSms(s.sms_previo)) {
          smsVendMap[vend].com += 1;
          if (isPortadoConsolidado(s)) smsVendMap[vend].suc_com += 1;
        }
      });

      ranking.forEach((r) => {
        const sm = smsVendMap[r.vendedor];
        if (sm) {
          r.sms_total = sm.total;
          r.sms_com = sm.com;
          r.sms_adesao = sm.total > 0 ? Math.round((sm.com / sm.total) * 1000) / 10 : 0;
          r.sms_suc_com = sm.suc_com;
          r.sms_pct_suc = sm.com > 0 ? Math.round((sm.suc_com / sm.com) * 1000) / 10 : 0;
        }
      });

      setOperadores(ranking);
    } catch (err) {
      console.error(err);
      setFetchError(err instanceof Error ? err.message : 'Falha ao carregar operadores');
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
    // Realtime: recarregar quando sms_eficiencia mudar
    const channel = supabase
      .channel('sms_operadores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_eficiencia' }, () => {
        fetchData();
      })
      .subscribe();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, [fetchData]);

  const openDetail = async (vendedor: string) => {
    setSelectedVendedor(vendedor);
    setLoadingDetalhes(true);
    let query = supabase
      .from('correcao_logs')
      .select('id, proposta_id, created_at, alteracoes, campos_alterados, tipos_erro, estrategia')
      .eq('vendedor', vendedor)
      .not('campos_alterados', 'eq', '{}')
      .order('created_at', { ascending: false })
      .limit(50);
    if (dateFrom) query = query.gte('data_venda', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte('data_venda', `${dateTo}T23:59:59`);
    const { data } = await query;
    setDetalhes((data ?? []) as PropostaDetalhe[]);
    setLoadingDetalhes(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const filtered = useMemo(
    () =>
      operadores.filter(
        (o) =>
          !search ||
          o.vendedor?.toLowerCase().includes(search.toLowerCase()) ||
          o.equipe?.toLowerCase().includes(search.toLowerCase()) ||
          o.supervisor?.toLowerCase().includes(search.toLowerCase()),
      ),
    [operadores, search],
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
                  onClick={() => o.vendedor && openDetail(o.vendedor)}>
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
          <div className="fixed inset-0 z-[80] flex items-start justify-center pt-10 px-4">
          <div className="fixed inset-0 z-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedVendedor(null)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">{selectedVendedor}</h3>
                <p className="text-xs text-gray-400">Propostas com alterações (azul=IA, vermelho=erro)</p>
              </div>
              <button onClick={() => setSelectedVendedor(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingDetalhes ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}</div>
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
