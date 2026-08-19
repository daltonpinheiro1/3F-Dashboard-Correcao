import { useEffect, useState, useCallback } from 'react';
import { Trophy, Calendar, MessageSquare, AlertCircle } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';
import { getMonthRange } from '../lib/dateFilter';
import { temErroOperacional } from '../lib/erroClassification';
import { hasSmsInfo, isComSms, isPortadoConsolidado, isSemSms } from '../lib/smsRules';

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
  // SMS
  sms_total: number;
  sms_com: number;
  sms_adesao: number;
  sms_sucesso_com: number;
  sms_sucesso_sem: number;
  sms_pct_suc_com: number;
  sms_pct_suc_sem: number;
}

export function SupervisoresPage() {
  const defaults = getMonthRange();
  const [supervisores, setSupervisores] = useState<SupervisorRanking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      let allItems: any[] = [];
      let offset = 0;
      while (true) {
        let q = supabase
          .from('correcao_logs')
          .select('vendedor, equipe, supervisor, campos_alterados, tipos_erro')
          .order('created_at', { ascending: false })
          .range(offset, offset + 999);
        if (dateFrom) q = q.gte('data_venda', `${dateFrom}T00:00:00`);
        if (dateTo) q = q.lte('data_venda', `${dateTo}T23:59:59`);

        const { data, error } = await q;
        if (error) throw error;
        const batch = data ?? [];
        allItems = [...allItems, ...batch];
        if (batch.length < 1000) break;
        offset += 1000;
      }
      const items = allItems;

      const map: Record<string, { supervisor: string; equipe: string; vendedores: Set<string>; total: number; corrigidas: number; cep: number; ref: number; bairro: number }> = {};
      items.forEach((l: any) => {
        const sup = l.supervisor || 'Sem supervisor';
        const eq = l.equipe || '-';
        const key = `${sup}|${eq}`;
        if (!map[key]) map[key] = { supervisor: sup, equipe: eq, vendedores: new Set(), total: 0, corrigidas: 0, cep: 0, ref: 0, bairro: 0 };
        const m = map[key];
        m.total += 1;
        if (l.vendedor) m.vendedores.add(l.vendedor);
        const tipos = l.tipos_erro ?? [];
        if (temErroOperacional(tipos)) m.corrigidas += 1;
        const campos = l.campos_alterados ?? [];
        if (campos.includes('cep')) m.cep += 1;
        const tiposRef = tipos.filter((t: string) => t.startsWith('referencia_') && t !== 'referencia_tratamento');
        if (tiposRef.length > 0) m.ref += 1;
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
          sms_total: 0, sms_com: 0, sms_adesao: 0,
          sms_sucesso_com: 0, sms_sucesso_sem: 0, sms_pct_suc_com: 0, sms_pct_suc_sem: 0,
        }))
        .filter((s) => s.supervisor !== 'Sem supervisor' || s.total_propostas > 2)
        .sort((a, b) => a.taxa_erro_pct - b.taxa_erro_pct);

      let smsItems: any[] = [];
      let smsOff = 0;
      while (true) {
        let sq = supabase
          .from('sms_eficiencia')
          .select('supervisor, sms_previo, classificacao, ticket_status')
          .order('created_at', { ascending: false })
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

      const smsMap: Record<string, { total: number; com: number; sem: number; suc_com: number; suc_sem: number }> = {};
      smsItems.filter((s) => hasSmsInfo(s.sms_previo)).forEach((s: any) => {
        const sup = s.supervisor || 'Sem supervisor';
        if (!smsMap[sup]) smsMap[sup] = { total: 0, com: 0, sem: 0, suc_com: 0, suc_sem: 0 };
        smsMap[sup].total += 1;
        if (isComSms(s.sms_previo)) {
          smsMap[sup].com += 1;
          if (isPortadoConsolidado(s)) smsMap[sup].suc_com += 1;
        } else if (isSemSms(s.sms_previo)) {
          smsMap[sup].sem += 1;
          if (isPortadoConsolidado(s)) smsMap[sup].suc_sem += 1;
        }
      });

      ranking.forEach((r) => {
        const sm = smsMap[r.supervisor];
        if (sm) {
          r.sms_total = sm.total;
          r.sms_com = sm.com;
          r.sms_adesao = sm.total > 0 ? Math.round((sm.com / sm.total) * 1000) / 10 : 0;
          r.sms_sucesso_com = sm.suc_com;
          r.sms_sucesso_sem = sm.suc_sem;
          r.sms_pct_suc_com = sm.com > 0 ? Math.round((sm.suc_com / sm.com) * 1000) / 10 : 0;
          r.sms_pct_suc_sem = sm.sem > 0 ? Math.round((sm.suc_sem / sm.sem) * 1000) / 10 : 0;
        }
      });

      setSupervisores(ranking);
    } catch (err) {
      console.error(err);
      setFetchError(err instanceof Error ? err.message : 'Falha ao carregar supervisores');
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
    // Realtime: recarregar quando sms_eficiencia mudar
    const channel = supabase
      .channel('sms_supervisores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_eficiencia' }, () => {
        fetchData();
      })
      .subscribe();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, [fetchData]);

  const getMedal = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}`;
  };

  return (
    <AdminLayout title="Ranking Supervisores" subtitle="Desempenho por equipe (menor taxa = melhor) · SMS unificado">
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={14} className="text-gray-400" />
          <input id="sup-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Data inicial" className="input-field text-sm py-2 w-36" />
          <span className="text-xs text-gray-400">até</span>
          <input id="sup-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            aria-label="Data final" className="input-field text-sm py-2 w-36" />
          <button type="button" onClick={() => { const r = getMonthRange(); setDateFrom(r.dateFrom); setDateTo(r.dateTo); }}
            className="text-xs text-blue-600 font-semibold">Mês atual</button>
          <p className="text-xs text-gray-400 ml-auto">{supervisores.length} equipes</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="card h-40 skeleton" />)}</div>
      ) : supervisores.length === 0 && !fetchError ? (
        <div className="card p-12 text-center text-gray-400">
          <Trophy size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sem dados no período selecionado.</p>
        </div>
      ) : supervisores.length === 0 ? null : (
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
              {/* SMS Prévio */}
              {s.sms_total > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><MessageSquare size={10} /> SMS Previo</p>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="bg-blue-50 rounded-lg p-1.5">
                      <p className="font-bold text-blue-600">{s.sms_total}</p>
                      <p className="text-blue-700">Port.</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-1.5">
                      <p className="font-bold text-emerald-600">{s.sms_adesao}%</p>
                      <p className="text-emerald-700">Adesao</p>
                    </div>
                    <div className="bg-teal-50 rounded-lg p-1.5">
                      <p className="font-bold text-teal-600">{s.sms_pct_suc_com}%</p>
                      <p className="text-teal-700">Suc c/</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
