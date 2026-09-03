import { useEffect, useState, useCallback } from 'react';
import { Clock, Award, AlertOctagon, TrendingDown, Calendar, RefreshCw, MessageSquare } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';
import { getMonthRange } from '../lib/dateFilter';
import { isErroOperacional, temErroOperacional, formatErroLabel } from '../lib/erroClassification';
import { hasSmsInfo, isComSms, isPortadoConsolidado, isSemSms, isAguardando } from '../lib/smsRules';

interface HoraData {
  hora: number;
  total_propostas: number;
  total_com_erro: number;
  taxa_erro_pct: number;
}

interface Reincidente {
  vendedor: string;
  supervisor: string;
  equipe: string;
  tipo_erro: string;
  vezes: number;
}

interface TopQualidade {
  vendedor: string;
  equipe: string;
  supervisor: string;
  total_propostas: number;
  total_erros: number;
  taxa_erro_pct: number;
}

interface PiorVendedor {
  vendedor: string;
  equipe: string;
  supervisor: string;
  total_propostas: number;
  total_erros: number;
  taxa_erro_pct: number;
  top_erro: string;
}

export function InsightsPage() {
  const defaults = getMonthRange();
  const [horas, setHoras] = useState<HoraData[]>([]);
  const [reincidentes, setReincidentes] = useState<Reincidente[]>([]);
  const [topQualidade, setTopQualidade] = useState<TopQualidade[]>([]);
  const [pioresVendedores, setPioresVendedores] = useState<PiorVendedor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [totalPropostas, setTotalPropostas] = useState(0);
  const [totalComErro, setTotalComErro] = useState(0);
  const [smsStats, setSmsStats] = useState<{ total: number; comSms: number; semSms: number; taxaComSms: number; taxaSemSms: number; insucessoCom: number; insucessoSem: number; aguardandoCom: number; aguardandoSem: number; sucessoCom: number; sucessoSem: number } | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      // Paginação para buscar TODOS os registros (Supabase limita a 1000 por request)
      let allItems: any[] = [];
      let offset = 0;
      while (true) {
        let query = supabase
          .from('correcao_logs')
          .select('vendedor, equipe, supervisor, tipos_erro, data_venda, created_at')
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

      setTotalPropostas(items.length);
      const comErro = items.filter((l: any) => temErroOperacional(l.tipos_erro ?? []));
      setTotalComErro(comErro.length);

      // --- 1. Erros por hora ---
      const horaMap: Record<number, { total: number; erros: number }> = {};
      for (let h = 0; h < 24; h++) horaMap[h] = { total: 0, erros: 0 };
      items.forEach((l: any) => {
        const ts = l.data_venda || l.created_at || '';
        const match = ts.match(/T(\d{2}):/);
        if (match) {
          const hora = parseInt(match[1], 10);
          horaMap[hora].total += 1;
          if (temErroOperacional(l.tipos_erro ?? [])) horaMap[hora].erros += 1;
        }
      });
      const horasCalc: HoraData[] = Object.entries(horaMap)
        .map(([h, d]) => ({
          hora: parseInt(h, 10),
          total_propostas: d.total,
          total_com_erro: d.erros,
          taxa_erro_pct: d.total > 0 ? Math.round((d.erros / d.total) * 1000) / 10 : 0,
        }))
        .filter((h) => h.total_propostas > 0);
      setHoras(horasCalc);

      // --- 2. Reincidência (vendedor + tipo_erro >= 3x) ---
      const reincMap: Record<string, { vendedor: string; supervisor: string; equipe: string; tipo_erro: string; vezes: number }> = {};
      items.forEach((l: any) => {
        const vend = l.vendedor || '';
        if (!vend) return;
        (l.tipos_erro ?? []).forEach((tipo: string) => {
          if (!isErroOperacional(tipo)) return;
          const key = `${vend}|${tipo}`;
          if (!reincMap[key]) reincMap[key] = { vendedor: vend, supervisor: l.supervisor || '', equipe: l.equipe || '', tipo_erro: tipo, vezes: 0 };
          reincMap[key].vezes += 1;
        });
      });
      const reincCalc = Object.values(reincMap)
        .filter((r) => r.vezes >= 3)
        .sort((a, b) => b.vezes - a.vezes)
        .slice(0, 15);
      setReincidentes(reincCalc);

      // --- 3. Top Qualidade (melhores — menor taxa erro, min 5 propostas) ---
      const vendMap: Record<string, { vendedor: string; equipe: string; supervisor: string; total: number; erros: number; erroTipos: Record<string, number> }> = {};
      items.forEach((l: any) => {
        const vend = l.vendedor || '';
        if (!vend) return;
        if (!vendMap[vend]) vendMap[vend] = { vendedor: vend, equipe: l.equipe || '', supervisor: l.supervisor || '', total: 0, erros: 0, erroTipos: {} };
        vendMap[vend].total += 1;
        const tipos = (l.tipos_erro ?? []).filter((t: string) => isErroOperacional(t));
        if (tipos.length > 0) {
          vendMap[vend].erros += 1;
          tipos.forEach((t: string) => { vendMap[vend].erroTipos[t] = (vendMap[vend].erroTipos[t] || 0) + 1; });
        }
      });

      const vendedoresCalc = Object.values(vendMap).filter((v) => v.total >= 5);
      const topCalc = vendedoresCalc
        .map((v) => ({
          vendedor: v.vendedor,
          equipe: v.equipe,
          supervisor: v.supervisor,
          total_propostas: v.total,
          total_erros: v.erros,
          taxa_erro_pct: Math.round((v.erros / v.total) * 1000) / 10,
        }))
        .sort((a, b) => a.taxa_erro_pct - b.taxa_erro_pct)
        .slice(0, 5);
      setTopQualidade(topCalc);

      // --- 4. Piores vendedores (maior taxa erro, min 5 propostas) ---
      const pioresCalc = vendedoresCalc
        .map((v) => {
          const topErro = Object.entries(v.erroTipos).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
          return {
            vendedor: v.vendedor,
            equipe: v.equipe,
            supervisor: v.supervisor,
            total_propostas: v.total,
            total_erros: v.erros,
            taxa_erro_pct: Math.round((v.erros / v.total) * 1000) / 10,
            top_erro: topErro,
          };
        })
        .sort((a, b) => b.taxa_erro_pct - a.taxa_erro_pct)
        .slice(0, 5);
      setPioresVendedores(pioresCalc);
      // --- SMS Prévio: mesmas regras do SmsPage ---
      let smsItems: any[] = [];
      let smsOffset = 0;
      while (true) {
        let smsQuery = supabase
          .from('sms_eficiencia')
          .select('sms_previo, classificacao, ticket_status, order_status, supervisor')
          .order('proposta_id', { ascending: true })
          .range(smsOffset, smsOffset + 999);
        if (dateFrom) smsQuery = smsQuery.gte('data_venda', `${dateFrom}T00:00:00`);
        if (dateTo) smsQuery = smsQuery.lte('data_venda', `${dateTo}T23:59:59`);
        const { data: smsBatch, error: smsErr } = await smsQuery;
        if (smsErr) throw smsErr;
        const batch = smsBatch ?? [];
        smsItems = [...smsItems, ...batch];
        if (batch.length < 1000) break;
        smsOffset += 1000;
      }
      const comInfo = smsItems.filter((i: any) => hasSmsInfo(i.sms_previo));
      const comSms = comInfo.filter((i: any) => isComSms(i.sms_previo));
      const semSms = comInfo.filter((i: any) => isSemSms(i.sms_previo));
      const sucessoCom = comSms.filter((i: any) => isPortadoConsolidado(i)).length;
      const sucessoSem = semSms.filter((i: any) => isPortadoConsolidado(i)).length;
      const insucessoCom = comSms.filter((i: any) => i.classificacao === 'insucesso').length;
      const insucessoSem = semSms.filter((i: any) => i.classificacao === 'insucesso').length;
      const aguardandoCom = comSms.filter((i: any) => isAguardando(i.classificacao)).length;
      const aguardandoSem = semSms.filter((i: any) => isAguardando(i.classificacao)).length;
      const taxaSucessoComSms = comSms.length > 0 ? (sucessoCom / comSms.length) * 100 : 0;
      const taxaSucessoSemSms = semSms.length > 0 ? (sucessoSem / semSms.length) * 100 : 0;
      setSmsStats({
        total: smsItems.length,
        comSms: comSms.length,
        semSms: semSms.length,
        taxaComSms: taxaSucessoComSms,
        taxaSemSms: taxaSucessoSemSms,
        insucessoCom,
        insucessoSem,
        aguardandoCom,
        aguardandoSem,
        sucessoCom,
        sucessoSem,
      });

    } catch (err) {
      console.error(err);
      setFetchError(err instanceof Error ? err.message : 'Falha ao carregar insights');
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const maxHora = Math.max(...horas.map((h) => h.total_propostas), 1);
  const picoHora = horas.reduce((max, h) => (h.taxa_erro_pct > (max?.taxa_erro_pct ?? 0) ? h : max), horas[0]);

  return (
    <AdminLayout title="Insights" subtitle="Analise inteligente - padroes, reincidencia e destaques">
      {/* Date filter */}
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar size={14} className="text-gray-400" />
          <input id="ins-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Data inicial" className="input-field text-sm py-2 w-36" />
          <span className="text-xs text-gray-400">ate</span>
          <input id="ins-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Data final" className="input-field text-sm py-2 w-36" />
          <button type="button" onClick={() => { const r = getMonthRange(); setDateFrom(r.dateFrom); setDateTo(r.dateTo); }} className="text-xs text-blue-600 font-semibold">Mês atual</button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-400">{totalPropostas} propostas · {totalComErro} com erro ({totalPropostas > 0 ? ((totalComErro / totalPropostas) * 100).toFixed(1) : 0}%)</span>
            <button onClick={fetchAll} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
          <p className="text-sm font-semibold text-red-700">Erro ao carregar</p>
          <p className="text-xs text-red-600 mt-0.5">{fetchError}</p>
          <button type="button" onClick={fetchAll} className="mt-2 text-xs font-semibold text-red-700 underline">Tentar novamente</button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-40 skeleton" />)}
        </div>
      ) : (
        <>
          {/* Horário de pico */}
          <div className="card p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <Clock size={16} className="text-purple-500" />
                  Erros por Horario de Venda
                </h3>
                {picoHora && (
                  <p className="text-xs text-gray-400 mt-1">
                    Pico de erros: <span className="font-semibold text-red-500">{picoHora.hora}h</span> ({picoHora.taxa_erro_pct}% taxa)
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Apenas erros operacionais</p>
                <p className="text-[10px] text-gray-300">Excl. ref. tratada e acentuacao</p>
              </div>
            </div>
            <div className="flex items-end gap-1 h-36">
              {horas.map((h, i) => {
                const heightPct = maxHora > 0 ? (h.total_propostas / maxHora) * 100 : 0;
                return (
                  <div key={h.hora} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    <div
                      className="w-full rounded-t-sm relative overflow-hidden transition-all duration-700 ease-out hover:opacity-100 opacity-90 hover:scale-x-110"
                      style={{ height: `${Math.max(heightPct, 3)}%`, transitionDelay: `${i * 25}ms` }}
                    >
                      <div className="absolute inset-0 bg-gray-200" />
                      <div
                        className={`absolute bottom-0 w-full ${
                          h.taxa_erro_pct > 40 ? 'bg-red-500' : h.taxa_erro_pct > 20 ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                        style={{ height: `${Math.min(h.taxa_erro_pct, 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-gray-400 mt-1">{h.hora}h</span>
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 tooltip-pop whitespace-nowrap pointer-events-none z-10 shadow-xl border border-gray-700">
                      <strong>{h.hora}h</strong>: {h.total_propostas} props · {h.total_com_erro} erros · {h.taxa_erro_pct}%
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-200 rounded-sm" /> Total</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-sm" /> {'>'} 40% erro</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-400 rounded-sm" /> 20-40%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-400 rounded-sm" /> {'<'} 20%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Top Qualidade (melhores vendedores) */}
            <div className="card shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <Award size={16} className="text-emerald-500" />
                  Destaque Qualidade
                </h3>
                <p className="text-xs text-gray-400">Menor taxa de erro operacional (min. 5 propostas)</p>
              </div>
              {topQualidade.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Dados insuficientes</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {topQualidade.map((v, i) => (
                    <div key={v.vendedor} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-lg w-8 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{v.vendedor}</p>
                          <p className="text-xs text-gray-400">{v.equipe} · {v.supervisor}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="badge bg-emerald-50 text-emerald-600 font-bold">{v.taxa_erro_pct}%</span>
                        <p className="text-[10px] text-gray-400 mt-0.5">{v.total_erros}/{v.total_propostas}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Piores vendedores (maior taxa) */}
            <div className="card shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                  <TrendingDown size={16} className="text-red-500" />
                  Atenção Necessaria
                </h3>
                <p className="text-xs text-gray-400">Maior taxa de erro operacional (min. 5 propostas)</p>
              </div>
              {pioresVendedores.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Dados insuficientes</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {pioresVendedores.map((v, i) => (
                    <div key={v.vendedor} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-red-400 w-8 text-center">{i + 1}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{v.vendedor}</p>
                          <p className="text-xs text-gray-400">{v.equipe} · {v.supervisor}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="badge bg-red-50 text-red-600 font-bold">{v.taxa_erro_pct}%</span>
                        <p className="text-[10px] text-gray-400 mt-0.5">{v.total_erros}/{v.total_propostas} · {formatErroLabel(v.top_erro)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Reincidência (vendedores que repetem o MESMO erro) */}
          <div className="card shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <AlertOctagon size={16} className="text-orange-500" />
                Reincidencia (mesmo erro 3+ vezes)
              </h3>
              <p className="text-xs text-gray-400">Vendedores que precisam de feedback direcionado — apenas erros operacionais reais</p>
            </div>
            {reincidentes.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Nenhuma reincidencia detectada no periodo</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-50">
                {reincidentes.slice(0, 12).map((r) => (
                  <div key={`${r.vendedor}-${r.tipo_erro}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.vendedor}</p>
                      <p className="text-[10px] text-gray-400 truncate">{r.equipe} · {r.supervisor}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="badge bg-orange-50 text-orange-600 text-[10px]">
                        {formatErroLabel(r.tipo_erro)}
                      </span>
                      <span className="text-sm font-black text-red-600">{r.vezes}x</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* SMS Prévio — Insight de eficiência */}
          {smsStats && smsStats.total > 0 && (
            <div className="card p-6 shadow-sm mt-6">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <MessageSquare size={16} className="text-blue-500" />
                SMS Previo — Eficiencia na Portabilidade
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-xl">
                  <p className="text-xl font-black text-blue-600">{smsStats.total}</p>
                  <p className="text-[10px] text-blue-700">Total portabilidade</p>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-xl">
                  <p className="text-xl font-black text-emerald-600">{smsStats.comSms}</p>
                  <p className="text-[10px] text-emerald-700">Com SMS ({smsStats.total > 0 ? ((smsStats.comSms / smsStats.total) * 100).toFixed(0) : 0}%)</p>
                </div>
                <div className="text-center p-3 bg-teal-50 rounded-xl">
                  <p className="text-xl font-black text-teal-600">{smsStats.taxaComSms.toFixed(1)}%</p>
                  <p className="text-[10px] text-teal-700">Sucesso (Portado) c/ SMS</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-xl">
                  <p className="text-xl font-black text-amber-600">{smsStats.taxaSemSms.toFixed(1)}%</p>
                  <p className="text-[10px] text-amber-700">Sucesso (Portado) s/ SMS</p>
                </div>
              </div>
              {/* Barras comparativas COM vs SEM */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-600 mb-2">COM SMS ({smsStats.comSms})</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Sucesso', value: smsStats.sucessoCom, color: 'bg-emerald-500', pct: smsStats.comSms > 0 ? (smsStats.sucessoCom / smsStats.comSms) * 100 : 0 },
                      { label: 'Insucesso', value: smsStats.insucessoCom, color: 'bg-red-500', pct: smsStats.comSms > 0 ? (smsStats.insucessoCom / smsStats.comSms) * 100 : 0 },
                      { label: 'Aguardando', value: smsStats.aguardandoCom, color: 'bg-amber-400', pct: smsStats.comSms > 0 ? (smsStats.aguardandoCom / smsStats.comSms) * 100 : 0 },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-16">{item.label}</span>
                        <div className="flex-1 h-5 bg-white rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${item.color} transition-all duration-700`} style={{ width: `${Math.max(item.pct, 1)}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-600 w-16 text-right">{item.value} ({item.pct.toFixed(0)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-600 mb-2">SEM SMS ({smsStats.semSms})</p>
                  <div className="space-y-2">
                    {[
                      { label: 'Sucesso', value: smsStats.sucessoSem, color: 'bg-emerald-500', pct: smsStats.semSms > 0 ? (smsStats.sucessoSem / smsStats.semSms) * 100 : 0 },
                      { label: 'Insucesso', value: smsStats.insucessoSem, color: 'bg-red-500', pct: smsStats.semSms > 0 ? (smsStats.insucessoSem / smsStats.semSms) * 100 : 0 },
                      { label: 'Aguardando', value: smsStats.aguardandoSem, color: 'bg-amber-400', pct: smsStats.semSms > 0 ? (smsStats.aguardandoSem / smsStats.semSms) * 100 : 0 },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-16">{item.label}</span>
                        <div className="flex-1 h-5 bg-white rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${item.color} transition-all duration-700`} style={{ width: `${Math.max(item.pct, 1)}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-600 w-16 text-right">{item.value} ({item.pct.toFixed(0)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
