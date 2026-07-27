import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, Calendar, RefreshCw, MessageSquare } from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { supabase } from '../lib/supabase';
import { temErroOperacional } from '../lib/erroClassification';

interface DiaData {
  dia: string;
  total_propostas: number;
  total_corrigidas: number;
  taxa_erro_pct: number;
  tempo_medio_ms: number;
  vendedores_ativos: number;
}

export function EvolucaoPage() {
  const [dados, setDados] = useState<DiaData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const [smsDiario, setSmsDiario] = useState<Record<string, { com: number; sem: number; suc_com: number; suc_sem: number; ins_com: number; ins_sem: number; agd_com: number; agd_sem: number }>>({});

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - dias);
      const limiteStr = dataLimite.toISOString().slice(0, 10);

      const { data } = await supabase
        .from('correcao_logs')
        .select('data_venda, tipos_erro, elapsed_ms, vendedor')
        .gte('data_venda', `${limiteStr}T00:00:00`)
        .order('data_venda', { ascending: false })
        .limit(5000);

      const items = data ?? [];

      // Agrupar por dia (extrair YYYY-MM-DD de data_venda)
      const diaMap: Record<string, { total: number; erros: number; tempoTotal: number; vendedores: Set<string> }> = {};
      items.forEach((l: any) => {
        const dv = l.data_venda || '';
        const dia = dv.slice(0, 10);
        if (!dia || dia.length !== 10) return;

        if (!diaMap[dia]) diaMap[dia] = { total: 0, erros: 0, tempoTotal: 0, vendedores: new Set() };
        diaMap[dia].total += 1;
        if (temErroOperacional(l.tipos_erro ?? [])) diaMap[dia].erros += 1;
        diaMap[dia].tempoTotal += (l.elapsed_ms ?? 0);
        if (l.vendedor) diaMap[dia].vendedores.add(l.vendedor);
      });

      const result: DiaData[] = Object.entries(diaMap)
        .map(([dia, d]) => ({
          dia,
          total_propostas: d.total,
          total_corrigidas: d.erros,
          taxa_erro_pct: d.total > 0 ? Math.round((d.erros / d.total) * 1000) / 10 : 0,
          tempo_medio_ms: d.total > 0 ? Math.round(d.tempoTotal / d.total) : 0,
          vendedores_ativos: d.vendedores.size,
        }))
        .sort((a, b) => b.dia.localeCompare(a.dia));

      setDados(result);
      // SMS Prévio: taxa diária
      const { data: smsData } = await supabase
        .from('sms_eficiencia')
        .select('sms_previo, classificacao, data_venda')
        .gte('data_venda', `${limiteStr}T00:00:00`)
        .limit(5000);
      const smsItems = smsData ?? [];
      const smsDiaMap: Record<string, { com: number; sem: number; suc_com: number; suc_sem: number; ins_com: number; ins_sem: number; agd_com: number; agd_sem: number }> = {};
      smsItems.forEach((s: any) => {
        const dia = (s.data_venda || '').slice(0, 10);
        if (!dia) return;
        if (!smsDiaMap[dia]) smsDiaMap[dia] = { com: 0, sem: 0, suc_com: 0, suc_sem: 0, ins_com: 0, ins_sem: 0, agd_com: 0, agd_sem: 0 };
        const isAguardando = s.classificacao === 'aguardando' || s.classificacao === 'sem_retorno';
        if (s.sms_previo) {
          smsDiaMap[dia].com += 1;
          if (s.classificacao === 'sucesso') smsDiaMap[dia].suc_com += 1;
          else if (s.classificacao === 'insucesso') smsDiaMap[dia].ins_com += 1;
          else if (isAguardando) smsDiaMap[dia].agd_com += 1;
        } else {
          smsDiaMap[dia].sem += 1;
          if (s.classificacao === 'sucesso') smsDiaMap[dia].suc_sem += 1;
          else if (s.classificacao === 'insucesso') smsDiaMap[dia].ins_sem += 1;
          else if (isAguardando) smsDiaMap[dia].agd_sem += 1;
        }
      });
      setSmsDiario(smsDiaMap);

    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [dias]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const dadosOrdenados = [...dados].reverse();
  const maxPropostas = Math.max(...dadosOrdenados.map((d) => d.total_propostas), 1);

  // Tendência: comparar última semana vs anterior
  const ultimaSemana = dados.slice(0, 7);
  const semanaAnterior = dados.slice(7, 14);
  const mediaUltima = ultimaSemana.length > 0
    ? ultimaSemana.reduce((s, d) => s + d.taxa_erro_pct, 0) / ultimaSemana.length
    : 0;
  const mediaAnterior = semanaAnterior.length > 0
    ? semanaAnterior.reduce((s, d) => s + d.taxa_erro_pct, 0) / semanaAnterior.length
    : 0;
  const tendencia = mediaAnterior > 0 ? ((mediaUltima - mediaAnterior) / mediaAnterior) * 100 : 0;
  const melhorou = tendencia < 0;

  return (
    <AdminLayout title="Evolucao" subtitle="Tendencia de qualidade ao longo do tempo">
      {/* Period selector */}
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar size={14} className="text-gray-400" />
          <div className="flex gap-2">
            {[7, 14, 30, 60].map((d) => (
              <button
                key={d}
                onClick={() => setDias(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  dias === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button onClick={fetchData} className="ml-auto btn-secondary flex items-center gap-1.5 text-xs py-2 px-3">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-20 skeleton" />)}
        </div>
      ) : dados.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <TrendingUp size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sem dados no periodo selecionado.</p>
        </div>
      ) : (
        <>
          {/* Tendência cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="card p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Taxa erro (7 dias)</p>
              <p className="text-2xl font-black text-gray-900">{mediaUltima.toFixed(1)}%</p>
              <p className="text-[10px] text-gray-400 mt-1">Apenas erros operacionais reais</p>
            </div>
            <div className="card p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Tendencia vs semana anterior</p>
              <div className={`flex items-center gap-2 text-2xl font-black ${melhorou ? 'text-emerald-600' : tendencia === 0 ? 'text-gray-400' : 'text-red-500'}`}>
                {tendencia === 0 ? (
                  <span className="text-lg">—</span>
                ) : (
                  <>
                    {melhorou ? <TrendingDown size={24} /> : <TrendingUp size={24} />}
                    {Math.abs(tendencia).toFixed(1)}%
                    <span className="text-xs font-medium text-gray-400 ml-1">
                      {melhorou ? 'melhoria' : 'piora'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="card p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Propostas/dia (media 7d)</p>
              <p className="text-2xl font-black text-blue-600">
                {ultimaSemana.length > 0
                  ? Math.round(ultimaSemana.reduce((s, d) => s + d.total_propostas, 0) / ultimaSemana.length)
                  : 0}
              </p>
            </div>
          </div>

          {/* Gráfico de barras */}
          <div className="card p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-700">Volume diario (ultimos {dias} dias)</h3>
              <span className="text-xs text-gray-400">{dados.length} dias com dados</span>
            </div>
            <div className="flex items-end gap-[2px] h-40">
              {dadosOrdenados.map((d, i) => {
                const erroPct = d.total_propostas > 0 ? (d.total_corrigidas / d.total_propostas) * 100 : 0;
                const heightPct = (d.total_propostas / maxPropostas) * 100;
                return (
                  <div key={d.dia} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    <div
                      className="w-full rounded-t-sm relative overflow-hidden transition-all duration-700 ease-out hover:opacity-100 opacity-90 hover:scale-x-110"
                      style={{ height: `${Math.max(heightPct, 2)}%`, transitionDelay: `${i * 20}ms` }}
                    >
                      <div className="absolute inset-0 bg-blue-200" />
                      <div
                        className={`absolute bottom-0 w-full ${erroPct > 40 ? 'bg-red-500' : erroPct > 20 ? 'bg-amber-400' : 'bg-blue-500'}`}
                        style={{ height: `${Math.min(erroPct, 100)}%` }}
                      />
                    </div>
                    <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 tooltip-pop whitespace-nowrap pointer-events-none z-10 shadow-xl border border-gray-700">
                      <strong>{new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</strong>: {d.total_propostas} props · {d.total_corrigidas} erros · {d.taxa_erro_pct}%
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-gray-400">
              <span>{dadosOrdenados[0]?.dia ? new Date(dadosOrdenados[0].dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}</span>
              <span>Hoje</span>
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-200 rounded-sm" /> Total</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm" /> {'<'}20% erro</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-400 rounded-sm" /> 20-40%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-sm" /> {'>'}40%</span>
            </div>
          </div>

          {/* Tabela detalhada */}
          <div className="card shadow-sm overflow-x-auto">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-700">Detalhamento diario</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-xs">
                  <th className="text-left px-6 py-3">Data</th>
                  <th className="text-right px-6 py-3">Propostas</th>
                  <th className="text-right px-6 py-3">Com erro</th>
                  <th className="text-right px-6 py-3">Taxa %</th>
                  <th className="text-right px-6 py-3">Tempo med.</th>
                  <th className="text-right px-6 py-3">Vendedores</th>
                </tr>
              </thead>
              <tbody>
                {dados.map((d) => (
                  <tr key={d.dia} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">
                      {new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-3 text-right">{d.total_propostas}</td>
                    <td className="px-6 py-3 text-right text-amber-600 font-semibold">{d.total_corrigidas}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={`badge ${
                        d.taxa_erro_pct < 20 ? 'bg-emerald-50 text-emerald-600'
                        : d.taxa_erro_pct < 40 ? 'bg-amber-50 text-amber-600'
                        : 'bg-red-50 text-red-600'
                      }`}>
                        {d.taxa_erro_pct}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-500">{(d.tempo_medio_ms / 1000).toFixed(1)}s</td>
                    <td className="px-6 py-3 text-right">{d.vendedores_ativos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* SMS Prévio — Evolução diária */}
          {Object.keys(smsDiario).length > 0 && (() => {
            const entries = Object.entries(smsDiario).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
            const totais = entries.reduce((acc, [, d]) => ({
              com: acc.com + d.com, sem: acc.sem + d.sem,
              suc_com: acc.suc_com + d.suc_com, suc_sem: acc.suc_sem + d.suc_sem,
              ins_com: acc.ins_com + d.ins_com, ins_sem: acc.ins_sem + d.ins_sem,
              agd_com: acc.agd_com + d.agd_com, agd_sem: acc.agd_sem + d.agd_sem,
            }), { com: 0, sem: 0, suc_com: 0, suc_sem: 0, ins_com: 0, ins_sem: 0, agd_com: 0, agd_sem: 0 });
            const totalGeral = totais.com + totais.sem;
            const adesaoGeral = totalGeral > 0 ? (totais.com / totalGeral) * 100 : 0;

            return (
              <div className="card shadow-sm mt-6">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <MessageSquare size={16} className="text-blue-500" />
                    SMS Previo — Evolucao Diaria Completa
                  </h3>
                  <p className="text-xs text-gray-400">Adesao, sucesso, insucesso e aguardando por dia</p>
                </div>
                {/* Resumo do período */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b border-gray-50">
                  <div className="text-center p-3 bg-blue-50 rounded-xl">
                    <p className="text-lg font-black text-blue-600">{totalGeral}</p>
                    <p className="text-[10px] text-blue-700">Total portabilidade</p>
                  </div>
                  <div className="text-center p-3 bg-emerald-50 rounded-xl">
                    <p className="text-lg font-black text-emerald-600">{totais.com}</p>
                    <p className="text-[10px] text-emerald-700">Com SMS ({adesaoGeral.toFixed(0)}%)</p>
                  </div>
                  <div className="text-center p-3 bg-teal-50 rounded-xl">
                    <p className="text-lg font-black text-teal-600">{totais.com > 0 ? ((totais.suc_com / totais.com) * 100).toFixed(1) : '0.0'}%</p>
                    <p className="text-[10px] text-teal-700">Sucesso (Portado) c/ SMS</p>
                  </div>
                  <div className="text-center p-3 bg-amber-50 rounded-xl">
                    <p className="text-lg font-black text-amber-600">{totais.sem > 0 ? ((totais.suc_sem / totais.sem) * 100).toFixed(1) : '0.0'}%</p>
                    <p className="text-[10px] text-amber-700">Sucesso (Portado) s/ SMS</p>
                  </div>
                </div>
                {/* Tabela diária */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-500 text-[10px]">
                        <th className="text-left px-4 py-2">Data</th>
                        <th className="text-right px-3 py-2">Total</th>
                        <th className="text-right px-3 py-2">Com SMS</th>
                        <th className="text-right px-3 py-2">% Adesao</th>
                        <th className="text-right px-3 py-2">Sucesso c/</th>
                        <th className="text-right px-3 py-2">% Suc c/</th>
                        <th className="text-right px-3 py-2">Insucesso c/</th>
                        <th className="text-right px-3 py-2">Aguard. c/</th>
                        <th className="text-right px-3 py-2">Sem SMS</th>
                        <th className="text-right px-3 py-2">Sucesso s/</th>
                        <th className="text-right px-3 py-2">% Suc s/</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(([dia, d]) => {
                        const totalDia = d.com + d.sem;
                        const adesao = totalDia > 0 ? (d.com / totalDia) * 100 : 0;
                        return (
                          <tr key={dia} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium">{new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td className="px-3 py-2 text-right text-blue-600 font-semibold">{totalDia}</td>
                            <td className="px-3 py-2 text-right text-emerald-600 font-semibold">{d.com}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`badge text-[10px] ${adesao > 60 ? 'bg-emerald-50 text-emerald-600' : adesao > 40 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                                {adesao.toFixed(0)}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-teal-600 font-semibold">{d.suc_com}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`badge text-[10px] ${d.com > 0 && (d.suc_com / d.com) > 0.05 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                                {d.com > 0 ? ((d.suc_com / d.com) * 100).toFixed(1) : '0.0'}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-red-500">{d.ins_com}</td>
                            <td className="px-3 py-2 text-right text-amber-500">{d.agd_com}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{d.sem}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{d.suc_sem}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`badge text-[10px] ${d.sem > 0 && (d.suc_sem / d.sem) > 0.05 ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                                {d.sem > 0 ? ((d.suc_sem / d.sem) * 100).toFixed(1) : '0.0'}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </AdminLayout>
  );
}
