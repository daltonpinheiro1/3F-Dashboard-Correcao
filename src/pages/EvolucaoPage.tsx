import { useEffect, useState, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, Calendar, RefreshCw, MessageSquare, AlertCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../components/AdminLayout';
import { SortTh } from '../components/SortTh';
import { queryCubo, type CuboFilter } from '../lib/cuboQuery';
import { consolidarPorProposta } from '../../shared/correcaoPropostas';
import { temErroOperacional } from '../lib/erroClassification';
import {
  hasSmsInfo,
  isAguardando,
  isComSms,
  isPortadoConsolidado,
  isSemSms,
  smsDataVendaBounds,
  dedupeSmsPorProposta,
} from '../lib/smsRules';
import { dataBrtIso } from '../lib/brt';
import { ehVendedorRobo } from '../lib/toutboxVisao';
import { useTableSortFields } from '../lib/tableSort';
import {
  janelasEvolucao,
  naJanela,
  restringirAoUniverso,
  resumoJanela,
  somarSmsDias,
  tendenciaPct,
  type Janela,
  type SmsDiaContagem,
} from '../lib/evolucaoJanela';

interface DiaData {
  dia: string;
  total_propostas: number;
  total_corrigidas: number;
  taxa_erro_pct: number;
  tempo_medio_ms: number;
  vendedores_ativos: number;
}

type EvolucaoLogRow = {
  proposta_id?: string | null;
  data_venda?: string | null;
  tipos_erro?: string[] | null;
  elapsed_ms?: number | null;
  vendedor?: string | null;
};

type EvolucaoSmsRow = {
  proposta_id?: string | null;
  sms_previo?: boolean | null;
  classificacao?: string | null;
  ticket_status?: string | null;
  order_status?: string | null;
  data_venda?: string | null;
};

export function EvolucaoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dados, setDados] = useState<DiaData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dias, setDias] = useState(() => {
    const value = Number(searchParams.get('dias'));
    return [7, 14, 30, 60].includes(value) ? value : 30;
  });
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [smsDiario, setSmsDiario] = useState<Record<string, SmsDiaContagem>>({});
  const [tbxDiario, setTbxDiario] = useState<Record<string, { entregue: number; rota: number; ins: number }>>({});
  const [janelas, setJanelas] = useState<{ atual: Janela; anterior: Janela }>(() => janelasEvolucao(dataBrtIso(), dias));

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const hoje = dataBrtIso();
      const { atual, anterior } = janelasEvolucao(hoje, dias);
      const vendaBounds = smsDataVendaBounds(atual.de, atual.ate);
      const fluxoFilter: CuboFilter = { column: 'fluxo', op: 'in', value: ['portabilidade', 'esim'] };
      const filters: CuboFilter[] = [];
      if (vendaBounds.gte) filters.push({ column: 'data_venda', op: 'gte', value: vendaBounds.gte });
      if (vendaBounds.lte) filters.push({ column: 'data_venda', op: 'lte', value: vendaBounds.lte });
      filters.push(fluxoFilter);
      // Correção busca também a janela anterior, só para a tendência.
      const logsBounds = smsDataVendaBounds(anterior.de, atual.ate);
      const logFilters: CuboFilter[] = [];
      if (logsBounds.gte) logFilters.push({ column: 'data_venda', op: 'gte', value: logsBounds.gte });
      if (logsBounds.lte) logFilters.push({ column: 'data_venda', op: 'lte', value: logsBounds.lte });
      logFilters.push(fluxoFilter);

      // Paginação para buscar todos os registros
      let allItems: EvolucaoLogRow[] = [];
      let pageOffset = 0;
      while (true) {
        const batch = await queryCubo<EvolucaoLogRow>({
          table: 'correcao_logs',
          select: ['proposta_id', 'data_venda', 'tipos_erro', 'elapsed_ms', 'vendedor'],
          filters: logFilters,
          order: { column: 'id', ascending: true },
          from: pageOffset,
          to: pageOffset + 999,
        });
        allItems = [...allItems, ...batch];
        if (batch.length < 1000) break;
        pageOffset += 1000;
      }
      const items = consolidarPorProposta(allItems);

      // Agrupar por dia (extrair YYYY-MM-DD de data_venda)
      const diaMap: Record<string, { total: number; erros: number; tempoTotal: number; passagens: number; vendedores: Set<string> }> = {};
      const diaDe = (l: EvolucaoLogRow) => {
        const dia = (l.data_venda || '').slice(0, 10);
        if (!dia || dia.length !== 10) return null;
        if (!diaMap[dia]) diaMap[dia] = { total: 0, erros: 0, tempoTotal: 0, passagens: 0, vendedores: new Set() };
        return diaMap[dia];
      };
      items.forEach((l) => {
        const d = diaDe(l);
        if (!d) return;
        d.total += 1;
        if (temErroOperacional(l.tipos_erro ?? [])) d.erros += 1;
        if (l.vendedor && !ehVendedorRobo(l.vendedor)) d.vendedores.add(l.vendedor);
      });
      allItems.forEach((l) => {
        const d = diaDe(l);
        if (!d) return;
        d.passagens += 1;
        d.tempoTotal += (l.elapsed_ms ?? 0);
      });

      const result: DiaData[] = Object.entries(diaMap)
        .map(([dia, d]) => ({
          dia,
          total_propostas: d.total,
          total_corrigidas: d.erros,
          taxa_erro_pct: d.total > 0 ? Math.round((d.erros / d.total) * 1000) / 10 : 0,
          tempo_medio_ms: d.passagens > 0 ? Math.round(d.tempoTotal / d.passagens) : 0,
          vendedores_ativos: d.vendedores.size,
        }))
        .sort((a, b) => b.dia.localeCompare(a.dia));

      const universo = new Set(
        items
          .filter((l) => naJanela((l.data_venda || '').slice(0, 10), atual))
          .map((l) => String(l.proposta_id || '').trim())
          .filter(Boolean),
      );
      setJanelas({ atual, anterior });
      setDados(result);
      // SMS Prévio: taxa diária (paginado)
      let smsItems: EvolucaoSmsRow[] = [];
      let smsOffset = 0;
      while (true) {
        const batch = await queryCubo<EvolucaoSmsRow>({
          table: 'sms_eficiencia',
          select: ['proposta_id', 'sms_previo', 'classificacao', 'ticket_status', 'order_status', 'data_venda'],
          filters,
          order: { column: 'proposta_id', ascending: true },
          from: smsOffset,
          to: smsOffset + 999,
        });
        smsItems = [...smsItems, ...batch];
        if (batch.length < 1000) break;
        smsOffset += 1000;
      }
      const smsDiaMap: Record<string, SmsDiaContagem> = {};
      dedupeSmsPorProposta(smsItems).filter((s) => hasSmsInfo(s.sms_previo)).forEach((s) => {
        const dia = (s.data_venda || '').slice(0, 10);
        if (!dia) return;
        if (!smsDiaMap[dia]) smsDiaMap[dia] = { com: 0, sem: 0, suc_com: 0, suc_sem: 0, ins_com: 0, ins_sem: 0, agd_com: 0, agd_sem: 0 };
        if (isComSms(s.sms_previo)) {
          smsDiaMap[dia].com += 1;
          if (isPortadoConsolidado(s)) smsDiaMap[dia].suc_com += 1;
          else if (s.classificacao === 'insucesso') smsDiaMap[dia].ins_com += 1;
          else if (isAguardando(s.classificacao)) smsDiaMap[dia].agd_com += 1;
        } else if (isSemSms(s.sms_previo)) {
          smsDiaMap[dia].sem += 1;
          if (isPortadoConsolidado(s)) smsDiaMap[dia].suc_sem += 1;
          else if (s.classificacao === 'insucesso') smsDiaMap[dia].ins_sem += 1;
          else if (isAguardando(s.classificacao)) smsDiaMap[dia].agd_sem += 1;
        }
      });
      setSmsDiario(smsDiaMap);
      const tbxFilters: CuboFilter[] = [];
      if (vendaBounds.gte) tbxFilters.push({ column: 'data_venda', op: 'gte', value: vendaBounds.gte });
      if (vendaBounds.lte) tbxFilters.push({ column: 'data_venda', op: 'lte', value: vendaBounds.lte });
      let tbxItems: Array<{ proposta_id?: string; status?: string; data_venda?: string }> = [];
      try {
        let off = 0;
        while (true) {
          const batch = await queryCubo<{ proposta_id?: string; status?: string; data_venda?: string }>({
            table: 'toutbox_entrega',
            select: ['proposta_id', 'status', 'data_venda'],
            filters: tbxFilters,
            order: { column: 'proposta_id', ascending: true },
            from: off,
            to: off + 999,
          });
          tbxItems = [...tbxItems, ...batch];
          if (batch.length < 1000) break;
          off += 1000;
        }
      } catch {
        tbxItems = [];
      }
      const tbxMap: Record<string, { entregue: number; rota: number; ins: number }> = {};
      // toutbox_entrega não tem fluxo: restringe às propostas Port/eSIM da tabela.
      for (const r of restringirAoUniverso(tbxItems, universo)) {
        const dia = (r.data_venda || '').slice(0, 10);
        if (!dia) continue;
        if (!tbxMap[dia]) tbxMap[dia] = { entregue: 0, rota: 0, ins: 0 };
        if (r.status === 'entregue') tbxMap[dia].entregue += 1;
        else if (r.status === 'em_rota') tbxMap[dia].rota += 1;
        else if (r.status === 'insucesso') tbxMap[dia].ins += 1;
      }
      setTbxDiario(tbxMap);

    } catch (err) {
      console.error(err);
      setFetchError(err instanceof Error ? err.message : 'Falha ao carregar evolução');
    } finally {
      setIsLoading(false);
    }
  }, [dias]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const value = Number(searchParams.get('dias'));
    if ([7, 14, 30, 60].includes(value) && value !== dias) setDias(value);
  }, [searchParams, dias]);

  const dadosJanela = useMemo(
    () => dados.filter((d) => naJanela(d.dia, janelas.atual)).sort((a, b) => b.dia.localeCompare(a.dia)),
    [dados, janelas],
  );
  const dadosOrdenados = [...dadosJanela].reverse();
  const maxPropostas = Math.max(...dadosOrdenados.map((d) => d.total_propostas), 1);

  const resumoAtual = useMemo(() => resumoJanela(dados, janelas.atual), [dados, janelas]);
  const resumoAnterior = useMemo(() => resumoJanela(dados, janelas.anterior), [dados, janelas]);
  const tendencia = tendenciaPct(resumoAtual, resumoAnterior);
  const melhorou = tendencia !== null && tendencia < 0;
  const fmtDia = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  const {
    sorted: dadosSorted,
    sortKey: diaKey,
    sortDir: diaDir,
    toggleSort: toggleDia,
  } = useTableSortFields(dadosJanela, 'dia', 'desc');

  const smsRows = useMemo(() => {
    return Object.entries(smsDiario)
      .map(([dia, d]) => {
        const totalDia = d.com + d.sem;
        const adesao = totalDia > 0 ? Math.round((d.com / totalDia) * 1000) / 10 : 0;
        const pct_suc_com = d.com > 0 ? Math.round((d.suc_com / d.com) * 1000) / 10 : 0;
        const pct_suc_sem = d.sem > 0 ? Math.round((d.suc_sem / d.sem) * 1000) / 10 : 0;
        return {
          dia,
          ...d,
          _total: totalDia,
          _adesao: adesao,
          _pct_suc_com: pct_suc_com,
          _pct_suc_sem: pct_suc_sem,
        };
      })
      .sort((a, b) => b.dia.localeCompare(a.dia));
  }, [smsDiario]);

  const {
    sorted: smsSorted,
    sortKey: smsKey,
    sortDir: smsDir,
    toggleSort: toggleSms,
  } = useTableSortFields(smsRows, 'dia', 'desc');

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
                onClick={() => {
                  setDias(d);
                  setSearchParams((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set('dias', String(d));
                    return next;
                  }, { replace: true });
                }}
                aria-pressed={dias === d}
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

      {fetchError ? (
        <div className="card p-6 shadow-sm text-center" role="alert">
          <AlertCircle size={32} className="mx-auto mb-3 text-red-500" />
          <p className="text-sm font-semibold text-red-700">Erro ao carregar evolução</p>
          <p className="text-xs text-red-600 mt-1">{fetchError}</p>
          <button type="button" onClick={fetchData} className="btn-primary mt-4 text-sm">Tentar novamente</button>
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card h-20 skeleton" />)}
        </div>
      ) : dadosJanela.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <TrendingUp size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sem dados no periodo selecionado.</p>
        </div>
      ) : (
        <>
          {/* Tendência cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="card p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Taxa erro ({dias} dias)</p>
              <p className="text-2xl font-black text-gray-900">{resumoAtual.taxaPct.toFixed(1)}%</p>
              <p className="text-[10px] text-gray-400 mt-1">
                {resumoAtual.erros} com erro operacional de {resumoAtual.propostas} propostas · {fmtDia(janelas.atual.de)} a {fmtDia(janelas.atual.ate)}
              </p>
            </div>
            <div className="card p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Tendencia vs {dias} dias anteriores</p>
              <div className={`flex items-center gap-2 text-2xl font-black ${melhorou ? 'text-emerald-600' : !tendencia ? 'text-gray-400' : 'text-red-500'}`}>
                {!tendencia ? (
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
              <p className="text-[10px] text-gray-400 mt-1">
                {resumoAnterior.propostas > 0
                  ? `${fmtDia(janelas.anterior.de)} a ${fmtDia(janelas.anterior.ate)}: ${resumoAnterior.taxaPct.toFixed(1)}% de ${resumoAnterior.propostas} propostas`
                  : `Sem dados de ${fmtDia(janelas.anterior.de)} a ${fmtDia(janelas.anterior.ate)}`}
              </p>
            </div>
            <div className="card p-5 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Propostas/dia (media {dias}d)</p>
              <p className="text-2xl font-black text-blue-600">{Math.round(resumoAtual.mediaPorDia)}</p>
              <p className="text-[10px] text-gray-400 mt-1">Media por dia com venda ({resumoAtual.diasComDados} dias)</p>
            </div>
          </div>

          {/* Gráfico de barras */}
          <div className="card p-6 shadow-sm mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-700">Volume diario (ultimos {dias} dias)</h3>
              <span className="text-xs text-gray-400">{dadosJanela.length} dias com dados</span>
            </div>
            <div className="flex items-end gap-[2px] h-40">
              {dadosOrdenados.map((d, i) => {
                const erroPct = d.total_propostas > 0 ? (d.total_corrigidas / d.total_propostas) * 100 : 0;
                const heightPct = (d.total_propostas / maxPropostas) * 100;
                return (
                  <div
                    key={d.dia}
                    className="flex-1 flex flex-col items-center group relative h-full justify-end focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-sm"
                    tabIndex={0}
                    role="img"
                    aria-label={`${new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR')}: ${d.total_propostas} propostas, ${d.total_corrigidas} erros, taxa de ${d.taxa_erro_pct}%`}
                  >
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
                    <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 tooltip-pop whitespace-nowrap pointer-events-none z-10 shadow-xl border border-gray-700">
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
              <p className="text-xs text-gray-400">Entregue/Rota/Ins.chip: Toutbox so das propostas Port/eSIM desta tabela</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 text-xs">
                  <SortTh label="Data" col="dia" sortKey={diaKey} sortDir={diaDir} onSort={toggleDia} align="left" className="px-6 py-3" />
                  <SortTh label="Propostas" col="total_propostas" sortKey={diaKey} sortDir={diaDir} onSort={toggleDia} align="right" className="px-6 py-3" />
                  <SortTh label="Com erro" col="total_corrigidas" sortKey={diaKey} sortDir={diaDir} onSort={toggleDia} align="right" className="px-6 py-3" />
                  <SortTh label="Taxa %" col="taxa_erro_pct" sortKey={diaKey} sortDir={diaDir} onSort={toggleDia} align="right" className="px-6 py-3" />
                  <SortTh label="Tempo med." col="tempo_medio_ms" sortKey={diaKey} sortDir={diaDir} onSort={toggleDia} align="right" className="px-6 py-3" />
                  <SortTh label="Vendedores" col="vendedores_ativos" sortKey={diaKey} sortDir={diaDir} onSort={toggleDia} align="right" className="px-6 py-3" />
                  <th className="text-right px-3 py-3 text-teal-600">Entregue</th>
                  <th className="text-right px-3 py-3 text-indigo-600">Rota</th>
                  <th className="text-right px-3 py-3 text-rose-600">Ins.chip</th>
                </tr>
              </thead>
              <tbody>
                {(dadosSorted as typeof dadosJanela).map((d) => (
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
                    <td className="px-3 py-3 text-right text-teal-700">{tbxDiario[d.dia]?.entregue || '—'}</td>
                    <td className="px-3 py-3 text-right text-indigo-700">{tbxDiario[d.dia]?.rota || '—'}</td>
                    <td className="px-3 py-3 text-right text-rose-700">{tbxDiario[d.dia]?.ins || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* SMS Prévio — Evolução diária */}
          {smsRows.length > 0 && (() => {
            const totais = somarSmsDias(smsRows);
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
                        <SortTh label="Data" col="dia" sortKey={smsKey} sortDir={smsDir} onSort={toggleSms} align="left" className="px-4 py-2" />
                        <SortTh label="Total" col="_total" sortKey={smsKey} sortDir={smsDir} onSort={toggleSms} align="right" className="px-3 py-2" />
                        <SortTh label="Com SMS" col="com" sortKey={smsKey} sortDir={smsDir} onSort={toggleSms} align="right" className="px-3 py-2" />
                        <SortTh label="% Adesao" col="_adesao" sortKey={smsKey} sortDir={smsDir} onSort={toggleSms} align="right" className="px-3 py-2" />
                        <SortTh label="Sucesso c/" col="suc_com" sortKey={smsKey} sortDir={smsDir} onSort={toggleSms} align="right" className="px-3 py-2" />
                        <SortTh label="% Suc c/" col="_pct_suc_com" sortKey={smsKey} sortDir={smsDir} onSort={toggleSms} align="right" className="px-3 py-2" />
                        <SortTh label="Insucesso c/" col="ins_com" sortKey={smsKey} sortDir={smsDir} onSort={toggleSms} align="right" className="px-3 py-2" />
                        <SortTh label="Aguard. c/" col="agd_com" sortKey={smsKey} sortDir={smsDir} onSort={toggleSms} align="right" className="px-3 py-2" />
                        <SortTh label="Sem SMS" col="sem" sortKey={smsKey} sortDir={smsDir} onSort={toggleSms} align="right" className="px-3 py-2" />
                        <SortTh label="Sucesso s/" col="suc_sem" sortKey={smsKey} sortDir={smsDir} onSort={toggleSms} align="right" className="px-3 py-2" />
                        <SortTh label="% Suc s/" col="_pct_suc_sem" sortKey={smsKey} sortDir={smsDir} onSort={toggleSms} align="right" className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {(smsSorted as typeof smsRows).map((d) => {
                        const totalDia = d._total;
                        const adesao = d._adesao;
                        return (
                          <tr key={d.dia} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium">{new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
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
