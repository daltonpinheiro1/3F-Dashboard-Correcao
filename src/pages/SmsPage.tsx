import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, CheckCircle2, XCircle, X, Calendar, RefreshCw, TrendingUp } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';

interface SmsStats {
  total: number;
  comSms: number;
  semSms: number;
  sucessoComSms: number;
  sucessoSemSms: number;
  insucessoComSms: number;
  insucessoSemSms: number;
  aguardandoComSms: number;
  aguardandoSemSms: number;
  taxaSucessoComSms: number;
  taxaSucessoSemSms: number;
}

interface SupervisorSms {
  supervisor: string;
  equipe: string;
  total: number;
  com_sms: number;
  sem_sms: number;
  taxa_sms: number;
  sucesso_com_sms: number;
  sucesso_sem_sms: number;
  pct_sucesso_com: number;
  pct_sucesso_sem: number;
}

export function SmsPage() {
  const [stats, setStats] = useState<SmsStats | null>(null);
  const [supervisores, setSupervisores] = useState<SupervisorSms[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedSup, setSelectedSup] = useState<string | null>(null);
  const [operadores, setOperadores] = useState<any[]>([]);
  const [loadingOps, setLoadingOps] = useState(false);

  // Dados carregados para reutilização no modal
  const [allData, setAllData] = useState<any[]>([]);

  const openOperadores = (supervisor: string) => {
    setSelectedSup(supervisor);
    // Calcular operadores a partir dos dados já carregados
    const items = allData.filter((i: any) => (i.supervisor || 'Sem supervisor') === supervisor);
    const opMap: Record<string, any> = {};
    items.forEach((i: any) => {
      const vend = i.vendedor || 'Sem vendedor';
      if (!opMap[vend]) opMap[vend] = { vendedor: vend, total: 0, com_sms: 0, sem_sms: 0, sucesso_com: 0, sucesso_sem: 0, taxa_sms: 0 };
      opMap[vend].total += 1;
      if (i.sms_previo) {
        opMap[vend].com_sms += 1;
        if (i.classificacao === 'sucesso') opMap[vend].sucesso_com += 1;
      } else {
        opMap[vend].sem_sms += 1;
        if (i.classificacao === 'sucesso') opMap[vend].sucesso_sem += 1;
      }
    });
    const ops = Object.values(opMap)
      .map((o: any) => ({ ...o, taxa_sms: o.total > 0 ? (o.com_sms / o.total) * 100 : 0 }))
      .sort((a: any, b: any) => b.total - a.total);
    setOperadores(ops);
  };

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      // Paginação para pegar TODOS os dados (Supabase limita a 1000 por request)
      let allItems: any[] = [];
      let offset = 0;
      while (true) {
        let query = supabase
          .from('sms_eficiencia')
          .select('proposta_id, sms_previo, classificacao, supervisor, equipe, vendedor, data_venda')
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
      const total = items.length;
      // Filtrar apenas propostas com informação de SMS (true ou false, excluir null)
      const itemsComInfo = items.filter(i => i.sms_previo === true || i.sms_previo === false);
      const comSms = itemsComInfo.filter(i => i.sms_previo === true).length;
      const semSms = itemsComInfo.filter(i => i.sms_previo === false).length;

      // Classificação baseada APENAS em propostas com informação de SMS
      const sucessoComSms = itemsComInfo.filter(i => i.sms_previo === true && i.classificacao === 'sucesso').length;
      const sucessoSemSms = itemsComInfo.filter(i => i.sms_previo === false && i.classificacao === 'sucesso').length;
      const insucessoComSms = itemsComInfo.filter(i => i.sms_previo === true && i.classificacao === 'insucesso').length;
      const insucessoSemSms = itemsComInfo.filter(i => i.sms_previo === false && i.classificacao === 'insucesso').length;
      const aguardandoComSms = itemsComInfo.filter(i => i.sms_previo === true && (i.classificacao === 'aguardando' || i.classificacao === 'sem_retorno')).length;
      const aguardandoSemSms = itemsComInfo.filter(i => i.sms_previo === false && (i.classificacao === 'aguardando' || i.classificacao === 'sem_retorno')).length;

      const taxaSucessoComSms = comSms > 0 ? (sucessoComSms / comSms) * 100 : 0;
      const taxaSucessoSemSms = semSms > 0 ? (sucessoSemSms / semSms) * 100 : 0;

      setStats({
        total, comSms, semSms,
        sucessoComSms, sucessoSemSms,
        insucessoComSms, insucessoSemSms,
        aguardandoComSms, aguardandoSemSms,
        taxaSucessoComSms, taxaSucessoSemSms,
      });

      // Ranking supervisores — apenas propostas com informação de SMS
      const supMap: Record<string, SupervisorSms> = {};
      itemsComInfo.forEach((i: any) => {
        const sup = i.supervisor || 'Sem supervisor';
        const eq = i.equipe || '-';
        const key = `${sup}|${eq}`;
        if (!supMap[key]) supMap[key] = {
          supervisor: sup, equipe: eq, total: 0, com_sms: 0, sem_sms: 0,
          taxa_sms: 0, sucesso_com_sms: 0, sucesso_sem_sms: 0,
          pct_sucesso_com: 0, pct_sucesso_sem: 0,
        };
        supMap[key].total += 1;
        if (i.sms_previo) {
          supMap[key].com_sms += 1;
          if (i.classificacao === 'sucesso') supMap[key].sucesso_com_sms += 1;
        } else {
          supMap[key].sem_sms += 1;
          if (i.classificacao === 'sucesso') supMap[key].sucesso_sem_sms += 1;
        }
      });

      const ranking = Object.values(supMap)
        .map(s => ({
          ...s,
          taxa_sms: s.total > 0 ? (s.com_sms / s.total) * 100 : 0,
          pct_sucesso_com: s.com_sms > 0 ? (s.sucesso_com_sms / s.com_sms) * 100 : 0,
          pct_sucesso_sem: s.sem_sms > 0 ? (s.sucesso_sem_sms / s.sem_sms) * 100 : 0,
        }))
        .filter(s => s.total >= 5)
        .sort((a, b) => b.taxa_sms - a.taxa_sms);
      setSupervisores(ranking);
      setAllData(itemsComInfo);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setLastUpdate(new Date());
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(false), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <AdminLayout title="SMS Previo" subtitle="Eficiencia do envio de SMS previo na portabilidade">
      {/* Filters */}
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar size={14} className="text-gray-400" />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field text-sm py-2 w-36" />
          <span className="text-xs text-gray-400">ate</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field text-sm py-2 w-36" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs text-blue-600 font-semibold hover:text-blue-700">Limpar</button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">{stats?.total ?? 0} registros</span>
            <span className="text-xs text-gray-300">|</span>
            <span className="text-xs text-gray-400">{lastUpdate.toLocaleTimeString('pt-BR')}</span>
            <button onClick={() => fetchData(false)} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3">
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card p-6 h-28 skeleton" />)}
        </div>
      ) : !stats || stats.total === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <MessageSquare size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sem dados no periodo selecionado.</p>
        </div>
      ) : (
        <>
          {/* Cards principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="card p-6 shadow-sm hover-lift card-enter" style={{ animationDelay: '0ms' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">Total portabilidade</span>
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                  <MessageSquare size={18} className="text-blue-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-blue-600">{stats.total}</div>
            </div>

            <div className="card p-6 shadow-sm hover-lift card-enter" style={{ animationDelay: '80ms' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">Com SMS Previo</span>
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-emerald-600">{stats.comSms}</div>
              <p className="text-xs text-gray-400 mt-1">{stats.total > 0 ? ((stats.comSms / stats.total) * 100).toFixed(1) : 0}% do total</p>
            </div>

            <div className="card p-6 shadow-sm hover-lift card-enter" style={{ animationDelay: '160ms' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">Taxa sucesso COM SMS</span>
                <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center">
                  <TrendingUp size={18} className="text-teal-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-teal-600">{stats.taxaSucessoComSms.toFixed(1)}%</div>
              <p className="text-xs text-gray-400 mt-1">{stats.sucessoComSms} portados de {stats.comSms}</p>
            </div>

            <div className="card p-6 shadow-sm hover-lift card-enter" style={{ animationDelay: '240ms' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-500">Taxa sucesso SEM SMS</span>
                <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
                  <XCircle size={18} className="text-amber-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-amber-600">{stats.taxaSucessoSemSms.toFixed(1)}%</div>
              <p className="text-xs text-gray-400 mt-1">{stats.sucessoSemSms} portados de {stats.semSms}</p>
            </div>
          </div>

          {/* Comparativo visual */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* COM SMS */}
            <div className="card p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-500" />
                COM SMS Previo ({stats.comSms})
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Sucesso (Portado)', value: stats.sucessoComSms, color: 'bg-emerald-500', pct: stats.comSms > 0 ? (stats.sucessoComSms / stats.comSms) * 100 : 0 },
                  { label: 'Insucesso (Sem Resposta)', value: stats.insucessoComSms, color: 'bg-red-500', pct: stats.comSms > 0 ? (stats.insucessoComSms / stats.comSms) * 100 : 0 },
                  { label: 'Aguardando (Atualização ABR)', value: stats.aguardandoComSms, color: 'bg-amber-400', pct: stats.comSms > 0 ? (stats.aguardandoComSms / stats.comSms) * 100 : 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-48 truncate">{item.label}</span>
                    <div className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${item.color} transition-all duration-700`} style={{ width: `${Math.max(item.pct, 1)}%` }} />
                    </div>
                    <span className="text-xs font-bold text-gray-700 w-20 text-right">{item.value} ({item.pct.toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SEM SMS */}
            <div className="card p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <XCircle size={16} className="text-amber-500" />
                SEM SMS Previo ({stats.semSms})
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Sucesso (Portado)', value: stats.sucessoSemSms, color: 'bg-emerald-500', pct: stats.semSms > 0 ? (stats.sucessoSemSms / stats.semSms) * 100 : 0 },
                  { label: 'Insucesso (Sem Resposta)', value: stats.insucessoSemSms, color: 'bg-red-500', pct: stats.semSms > 0 ? (stats.insucessoSemSms / stats.semSms) * 100 : 0 },
                  { label: 'Aguardando (Atualização ABR)', value: stats.aguardandoSemSms, color: 'bg-amber-400', pct: stats.semSms > 0 ? (stats.aguardandoSemSms / stats.semSms) * 100 : 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-48 truncate">{item.label}</span>
                    <div className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${item.color} transition-all duration-700`} style={{ width: `${Math.max(item.pct, 1)}%` }} />
                    </div>
                    <span className="text-xs font-bold text-gray-700 w-20 text-right">{item.value} ({item.pct.toFixed(0)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Ranking supervisores */}
          <div className="card shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700">Ranking por Supervisor — Adesao e Eficiencia SMS Previo</h3>
              <p className="text-xs text-gray-400">Min. 5 propostas no periodo</p>
            </div>
            {supervisores.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Sem dados suficientes</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500 text-xs">
                      <th className="text-left px-4 py-3">#</th>
                      <th className="text-left px-4 py-3">Supervisor</th>
                      <th className="text-left px-4 py-3">Equipe</th>
                      <th className="text-right px-4 py-3">Total</th>
                      <th className="text-right px-4 py-3">Com SMS</th>
                      <th className="text-right px-4 py-3">% Adesao</th>
                      <th className="text-right px-4 py-3">Portado c/ SMS</th>
                      <th className="text-right px-4 py-3">% Sucesso c/ SMS</th>
                      <th className="text-right px-4 py-3">Portado s/ SMS</th>
                      <th className="text-right px-4 py-3">% Sucesso s/ SMS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supervisores.map((s, i) => (
                      <tr
                        key={`${s.supervisor}-${s.equipe}`}
                        className="border-b border-gray-50 hover:bg-blue-50/50 transition-all cursor-pointer fade-slide-up"
                        style={{ animationDelay: `${i * 40}ms` }}
                        onClick={() => openOperadores(s.supervisor)}
                      >
                        <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-blue-700 underline decoration-dotted">{s.supervisor}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{s.equipe}</td>
                        <td className="px-4 py-3 text-right">{s.total}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-semibold">{s.com_sms}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`badge ${s.taxa_sms > 70 ? 'bg-emerald-50 text-emerald-600' : s.taxa_sms > 40 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                            {s.taxa_sms.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-teal-600 font-semibold">{s.sucesso_com_sms}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`badge text-[10px] ${s.pct_sucesso_com > 5 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                            {s.pct_sucesso_com.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{s.sucesso_sem_sms}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`badge text-[10px] ${s.pct_sucesso_sem > 5 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                            {s.pct_sucesso_sem.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Modal operadores */}
          {selectedSup && (
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 px-4">
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedSup(null)} />
              <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Operadores — {selectedSup}</h3>
                    <p className="text-xs text-gray-400">Detalhamento individual por vendedor</p>
                  </div>
                  <button onClick={() => setSelectedSup(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} className="text-gray-400" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  {operadores.length === 0 ? (
                    <p className="text-center text-gray-400 py-8">Nenhum operador encontrado</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-gray-500 text-xs">
                          <th className="text-left px-4 py-2">Vendedor</th>
                          <th className="text-right px-4 py-2">Total</th>
                          <th className="text-right px-4 py-2">Com SMS</th>
                          <th className="text-right px-4 py-2">% Adesao</th>
                          <th className="text-right px-4 py-2">Portado c/ SMS</th>
                          <th className="text-right px-4 py-2">% Suc c/ SMS</th>
                          <th className="text-right px-4 py-2">Portado s/ SMS</th>
                          <th className="text-right px-4 py-2">% Suc s/ SMS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operadores.map((op: any) => (
                          <tr key={op.vendedor} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-900 truncate max-w-[180px]">{op.vendedor}</td>
                            <td className="px-4 py-2 text-right">{op.total}</td>
                            <td className="px-4 py-2 text-right text-emerald-600 font-semibold">{op.com_sms}</td>
                            <td className="px-4 py-2 text-right">
                              <span className={`badge text-[10px] ${op.taxa_sms > 70 ? 'bg-emerald-50 text-emerald-600' : op.taxa_sms > 40 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                                {op.taxa_sms.toFixed(0)}%
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-teal-600">{op.sucesso_com}</td>
                            <td className="px-4 py-2 text-right text-xs">{op.com_sms > 0 ? ((op.sucesso_com / op.com_sms) * 100).toFixed(1) : '0.0'}%</td>
                            <td className="px-4 py-2 text-right text-gray-500">{op.sucesso_sem}</td>
                            <td className="px-4 py-2 text-right text-xs">{op.sem_sms > 0 ? ((op.sucesso_sem / op.sem_sms) * 100).toFixed(1) : '0.0'}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400">
                  {operadores.length} operadores
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
