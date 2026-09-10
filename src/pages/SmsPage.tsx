import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  Calendar,
  Download,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  Users,
  Target,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { AdminLayout } from '../components/AdminLayout';
import { SortTh } from '../components/SortTh';
import { queryCubo, type CuboFilter } from '../lib/cuboQuery';
import { dataBrtIso } from '../lib/brt';
import { getMonthRange } from '../lib/dateFilter';
import {
  dedupeSmsPorProposta,
  hasSmsInfo,
  isAguardando,
  isComSms,
  isPortadoComBilhete,
  isPortadoConsolidado,
  isSemSms,
  pickSmsMaisRecente,
  smsDataVendaBounds,
  startOfTodayBrtIso,
  buildSmsSerieDiaria,
  type SmsDiaSerie,
} from '../lib/smsRules';
import { useTableSortFields } from '../lib/tableSort';
import { ModalShell } from '../components/ui';
import { downloadCsv } from '../lib/pageCsv';

interface SmsRow {
  proposta_id: string;
  sms_previo: boolean | null;
  classificacao: string | null;
  supervisor: string | null;
  equipe: string | null;
  vendedor: string | null;
  data_venda: string | null;
  ticket_status: string | null;
  order_status?: string | null;
  retorno_atualizado_em: string | null;
}

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
  /** Portados consolidados no período do filtro. */
  totalSucesso: number;
  /** Portados sem sms_previo true/false (fora do comparativo COM/SEM). */
  sucessoSemInfo: number;
  pctPortadosConsolidado: number;
  totalAguardando: number;
  totalInsucesso: number;
  /** Portados com bilhete (Portado/FP/Antigo/Ativo) no retorno de hoje BRT. */
  portadosHoje: number;
  portadosHojeComSms: number;
  portadosHojeSemSms: number;
  portadosHojeSemInfo: number;
  portadosHojeBreakdown: string;
  /** Propostas com retorno TIM hoje que passam no consolidado (incl. OS sem ticket). */
  propostasRetornoHoje: number;
  osSemBilheteHoje: number;
  /** % do universo com supervisor preenchido. */
  coberturaMeta: number;
  comSupervisor: number;
  /** Vendas únicas Port/eSIM na correção no mesmo período (não exige OS). */
  vendasCorrecao: number;
}

type DiaSerie = SmsDiaSerie;

function VolumeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: DiaSerie }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1.5 font-semibold text-slate-700">{label}</p>
      <p className="text-slate-600">Vendas com OS: {d.total}</p>
      <p className="text-emerald-600">Portados: {d.portados}</p>
      <p className="text-amber-600">Aguardando: {d.aguardando}</p>
      <p className="text-slate-500">Insucesso: {d.insucesso}</p>
      <p className="mt-1 font-semibold text-teal-700">% Portados: {d.pctPortados}%</p>
    </div>
  );
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

function periodoLabel(from: string, to: string): string {
  if (!from && !to) return 'todo o histórico';
  const fmt = (s: string) => {
    if (!s) return '…';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  };
  if (from && to) return `${fmt(from)} → ${fmt(to)}`;
  if (from) return `a partir de ${fmt(from)}`;
  return `até ${fmt(to)}`;
}

export function SmsPage() {
  const defaults = getMonthRange();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState<SmsStats | null>(null);
  const [serieDiaria, setSerieDiaria] = useState<DiaSerie[]>([]);
  const [supervisores, setSupervisores] = useState<SupervisorSms[]>([]);
  const [semSupervisor, setSemSupervisor] = useState<SupervisorSms | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('dateFrom') || defaults.dateFrom);
  const [dateTo, setDateTo] = useState(() => searchParams.get('dateTo') || defaults.dateTo);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedSup, setSelectedSup] = useState<string | null>(null);
  const [operadores, setOperadores] = useState<
    {
      vendedor: string;
      total: number;
      com_sms: number;
      sem_sms: number;
      sucesso_com: number;
      sucesso_sem: number;
      taxa_sms: number;
    }[]
  >([]);
  const [allData, setAllData] = useState<SmsRow[]>([]);

  const openOperadores = (supervisor: string) => {
    setSelectedSup(supervisor);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('supervisor', supervisor);
      if (dateFrom) next.set('dateFrom', dateFrom);
      if (dateTo) next.set('dateTo', dateTo);
      return next;
    }, { replace: true });
    const items = allData.filter((i) => (i.supervisor || 'Sem supervisor') === supervisor);
    const opMap: Record<
      string,
      {
        vendedor: string;
        total: number;
        com_sms: number;
        sem_sms: number;
        sucesso_com: number;
        sucesso_sem: number;
        taxa_sms: number;
      }
    > = {};
    items.forEach((i) => {
      const vend = i.vendedor || 'Sem vendedor';
      if (!opMap[vend]) {
        opMap[vend] = {
          vendedor: vend,
          total: 0,
          com_sms: 0,
          sem_sms: 0,
          sucesso_com: 0,
          sucesso_sem: 0,
          taxa_sms: 0,
        };
      }
      opMap[vend].total += 1;
      if (isComSms(i.sms_previo)) {
        opMap[vend].com_sms += 1;
        if (isPortadoComBilhete(i)) opMap[vend].sucesso_com += 1;
      } else if (isSemSms(i.sms_previo)) {
        opMap[vend].sem_sms += 1;
        if (isPortadoComBilhete(i)) opMap[vend].sucesso_sem += 1;
      }
    });
    setOperadores(
      Object.values(opMap)
        .map((o) => ({ ...o, taxa_sms: o.total > 0 ? (o.com_sms / o.total) * 100 : 0 }))
        .sort((a, b) => b.total - a.total),
    );
  };

  const closeOperadores = useCallback(() => {
    setSelectedSup(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('supervisor');
      next.delete('equipe');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const fetchData = useCallback(
    async (showLoading = true) => {
      if (showLoading) setIsLoading(true);
      setFetchError(null);
      try {
        const vendaBounds = smsDataVendaBounds(dateFrom, dateTo);
        const periodFilters: CuboFilter[] = [];
        if (vendaBounds.gte) periodFilters.push({ column: 'data_venda', op: 'gte', value: vendaBounds.gte });
        if (vendaBounds.lte) periodFilters.push({ column: 'data_venda', op: 'lte', value: vendaBounds.lte });
        periodFilters.push({ column: 'fluxo', op: 'in', value: ['portabilidade', 'esim'] });
        let allItems: SmsRow[] = [];
        let offset = 0;
        while (true) {
          const batch = await queryCubo<SmsRow>({
            table: 'sms_eficiencia',
            select: ['proposta_id', 'sms_previo', 'classificacao', 'supervisor', 'equipe', 'vendedor', 'data_venda', 'ticket_status', 'order_status', 'retorno_atualizado_em'],
            filters: periodFilters,
            order: { column: 'proposta_id', ascending: true },
            from: offset,
            to: offset + 999,
          });
          allItems = [...allItems, ...batch];
          if (batch.length < 1000) break;
          offset += 1000;
        }

        const hojeIso = startOfTodayBrtIso();
        const hojeYmd = dataBrtIso();
        let atualizadosHoje: SmsRow[] = [];
        let offHoje = 0;
        while (true) {
          const batch = await queryCubo<SmsRow>({
            table: 'sms_eficiencia',
            select: ['proposta_id', 'sms_previo', 'classificacao', 'ticket_status', 'order_status', 'retorno_atualizado_em', 'data_venda'],
            filters: [{ column: 'retorno_atualizado_em', op: 'gte', value: hojeIso }],
            order: { column: 'proposta_id', ascending: true },
            from: offHoje,
            to: offHoje + 999,
          });
          atualizadosHoje = [...atualizadosHoje, ...batch];
          if (batch.length < 1000) break;
          offHoje += 1000;
        }

        const vendaIds = new Set<string>();
        try {
          const vendaFilters: CuboFilter[] = [
            { column: 'fluxo', op: 'in', value: ['portabilidade', 'esim'] },
            ...periodFilters,
          ];
          let offVenda = 0;
          while (true) {
            const vb = await queryCubo<{ proposta_id?: string }>({
              table: 'correcao_logs',
              select: ['proposta_id'],
              filters: vendaFilters,
              order: { column: 'proposta_id', ascending: true },
              from: offVenda,
              to: offVenda + 999,
            });
            for (const row of vb) {
              const pid = String((row as { proposta_id?: string }).proposta_id || '').trim();
              if (pid) vendaIds.add(pid);
            }
            if (vb.length < 1000) break;
            offVenda += 1000;
          }
        } catch {
          /* cobertura é informativa — não derruba o cubo SMS */
        }

        const items = dedupeSmsPorProposta(allItems);
        const hojeByPid = new Map<string, SmsRow>();
        for (const row of [...atualizadosHoje, ...items.filter((i) => (i.data_venda || '').slice(0, 10) === hojeYmd)]) {
          const pid = String(row.proposta_id || '');
          if (!pid) continue;
          const prev = hojeByPid.get(pid);
          hojeByPid.set(pid, prev ? pickSmsMaisRecente(prev, row) : row);
        }
        const retornoHojeItems = [...hojeByPid.values()].filter(isPortadoConsolidado);
        const portadosHojeItems = retornoHojeItems.filter(isPortadoComBilhete);
        const osSemBilheteHoje = retornoHojeItems.length - portadosHojeItems.length;
        const propostasRetornoHoje = retornoHojeItems.length;
        const portadosHoje = portadosHojeItems.length;
        const portadosHojeComSms = portadosHojeItems.filter((i) => isComSms(i.sms_previo)).length;
        const portadosHojeSemSms = portadosHojeItems.filter((i) => isSemSms(i.sms_previo)).length;
        const portadosHojeSemInfo = Math.max(
          0,
          portadosHoje - portadosHojeComSms - portadosHojeSemSms,
        );
        const brMap: Record<string, number> = {};
        for (const i of portadosHojeItems) {
          const k = (i.ticket_status || '').trim() || 'sem ticket';
          brMap[k] = (brMap[k] || 0) + 1;
        }
        const portadosHojeBreakdown =
          Object.entries(brMap)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${k} ${v}`)
            .join(' · ') || '—';

        const total = items.length;
        const itemsComInfo = items.filter((i) => hasSmsInfo(i.sms_previo));
        const comSms = itemsComInfo.filter((i) => isComSms(i.sms_previo)).length;
        const semSms = itemsComInfo.filter((i) => isSemSms(i.sms_previo)).length;

        const sucessoComSms = itemsComInfo.filter(
          (i) => isComSms(i.sms_previo) && isPortadoComBilhete(i),
        ).length;
        const sucessoSemSms = itemsComInfo.filter(
          (i) => isSemSms(i.sms_previo) && isPortadoComBilhete(i),
        ).length;
        const sucessoSemInfo = items.filter(
          (i) => isPortadoComBilhete(i) && !hasSmsInfo(i.sms_previo),
        ).length;
        const insucessoComSms = itemsComInfo.filter(
          (i) => isComSms(i.sms_previo) && i.classificacao === 'insucesso',
        ).length;
        const insucessoSemSms = itemsComInfo.filter(
          (i) => isSemSms(i.sms_previo) && i.classificacao === 'insucesso',
        ).length;
        const aguardandoComSms = itemsComInfo.filter(
          (i) => isComSms(i.sms_previo) && isAguardando(i.classificacao),
        ).length;
        const aguardandoSemSms = itemsComInfo.filter(
          (i) => isSemSms(i.sms_previo) && isAguardando(i.classificacao),
        ).length;

        const taxaSucessoComSms = comSms > 0 ? (sucessoComSms / comSms) * 100 : 0;
        const taxaSucessoSemSms = semSms > 0 ? (sucessoSemSms / semSms) * 100 : 0;

        // Visão consolidada do período = acompanha o filtro
        const totalSucesso = items.filter(isPortadoComBilhete).length;
        const pctPortadosConsolidado = total > 0 ? (totalSucesso / total) * 100 : 0;
        const totalAguardando = items.filter((i) => isAguardando(i.classificacao)).length;
        const totalInsucesso = items.filter((i) => i.classificacao === 'insucesso').length;

        const comSupervisor = items.filter((i) => (i.supervisor || '').trim()).length;
        const coberturaMeta = total > 0 ? (comSupervisor / total) * 100 : 0;

        setStats({
          total,
          comSms,
          semSms,
          sucessoComSms,
          sucessoSemSms,
          insucessoComSms,
          insucessoSemSms,
          aguardandoComSms,
          aguardandoSemSms,
          taxaSucessoComSms,
          taxaSucessoSemSms,
          pctPortadosConsolidado,
          totalSucesso,
          sucessoSemInfo,
          totalAguardando,
          totalInsucesso,
          portadosHoje,
          portadosHojeComSms,
          portadosHojeSemSms,
          portadosHojeSemInfo,
          portadosHojeBreakdown,
          propostasRetornoHoje,
          osSemBilheteHoje,
          coberturaMeta,
          comSupervisor,
          vendasCorrecao: vendaIds.size,
        });

        setSerieDiaria(buildSmsSerieDiaria(items, dateFrom, dateTo));

        const supMap: Record<string, SupervisorSms> = {};
        items.forEach((i) => {
          const sup = i.supervisor || 'Sem supervisor';
          const eq = i.equipe || '-';
          const key = `${sup}|${eq}`;
          if (!supMap[key]) {
            supMap[key] = {
              supervisor: sup,
              equipe: eq,
              total: 0,
              com_sms: 0,
              sem_sms: 0,
              taxa_sms: 0,
              sucesso_com_sms: 0,
              sucesso_sem_sms: 0,
              pct_sucesso_com: 0,
              pct_sucesso_sem: 0,
            };
          }
          supMap[key].total += 1;
          if (isComSms(i.sms_previo)) {
            supMap[key].com_sms += 1;
            if (isPortadoComBilhete(i)) supMap[key].sucesso_com_sms += 1;
          } else if (isSemSms(i.sms_previo)) {
            supMap[key].sem_sms += 1;
            if (isPortadoComBilhete(i)) supMap[key].sucesso_sem_sms += 1;
          }
        });

        const rankingAll = Object.values(supMap)
          .map((s) => ({
            ...s,
            taxa_sms: s.total > 0 ? (s.com_sms / s.total) * 100 : 0,
            pct_sucesso_com: s.com_sms > 0 ? (s.sucesso_com_sms / s.com_sms) * 100 : 0,
            pct_sucesso_sem: s.sem_sms > 0 ? (s.sucesso_sem_sms / s.sem_sms) * 100 : 0,
          }))
          .filter((s) => s.total >= 5)
          .sort((a, b) => b.taxa_sms - a.taxa_sms);

        const semSupRow =
          rankingAll.find((s) => s.supervisor === 'Sem supervisor') ||
          Object.values(supMap)
            .map((s) => ({
              ...s,
              taxa_sms: s.total > 0 ? (s.com_sms / s.total) * 100 : 0,
              pct_sucesso_com: s.com_sms > 0 ? (s.sucesso_com_sms / s.com_sms) * 100 : 0,
              pct_sucesso_sem: s.sem_sms > 0 ? (s.sucesso_sem_sms / s.sem_sms) * 100 : 0,
            }))
            .find((s) => s.supervisor === 'Sem supervisor') ||
          null;

        setSemSupervisor(semSupRow);
        // Ranking só com meta — "Sem supervisor" não compete no #1…N
        setSupervisores(rankingAll.filter((s) => s.supervisor !== 'Sem supervisor'));
        setAllData(items);
      } catch (err) {
        console.error(err);
        setFetchError(err instanceof Error ? err.message : 'Falha ao carregar dados SMS');
      } finally {
        setIsLoading(false);
        setLastUpdate(new Date());
      }
    },
    [dateFrom, dateTo],
  );

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (!document.hidden) fetchData(false);
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [fetchData]);

  useEffect(() => {
    const supervisor = searchParams.get('supervisor');
    if (!supervisor || allData.length === 0) return;
    if (selectedSup !== supervisor) openOperadores(supervisor);
  }, [allData, searchParams, selectedSup]);

  const lift = useMemo(() => {
    if (!stats) return 0;
    return stats.taxaSucessoComSms - stats.taxaSucessoSemSms;
  }, [stats]);

  /** Portados extras se SEM SMS tivesse a mesma taxa do COM. */
  const oportunidade = useMemo(() => {
    if (!stats || stats.semSms === 0) return 0;
    const potencial = (stats.taxaSucessoComSms / 100) * stats.semSms;
    return Math.max(0, Math.round(potencial - stats.sucessoSemSms));
  }, [stats]);

  /** Top equipes SEM SMS com volume (coaching). */
  const topSemSms = useMemo(() => {
    return supervisores
      .filter((s) => s.sem_sms >= 5)
      .map((s) => ({
        ...s,
        gap: s.pct_sucesso_com - s.pct_sucesso_sem,
      }))
      .sort((a, b) => b.sem_sms - a.sem_sms)
      .slice(0, 5);
  }, [supervisores]);

  const {
    sorted: supSmsSorted,
    sortKey: supSmsKey,
    sortDir: supSmsDir,
    toggleSort: toggleSupSms,
  } = useTableSortFields(supervisores, 'taxa_sms', 'desc');

  const exportarRanking = useCallback(() => {
    downloadCsv(
      `ranking_sms_${dateFrom || 'inicio'}_${dateTo || 'fim'}.csv`,
      ['supervisor', 'equipe', 'total', 'com_sms', 'sem_sms', 'adesao_pct', 'portado_com_sms', 'sucesso_com_sms_pct', 'portado_sem_sms', 'sucesso_sem_sms_pct'],
      supSmsSorted.map((s) => [
        s.supervisor, s.equipe, s.total, s.com_sms, s.sem_sms, s.taxa_sms.toFixed(1),
        s.sucesso_com_sms, s.pct_sucesso_com.toFixed(1), s.sucesso_sem_sms, s.pct_sucesso_sem.toFixed(1),
      ]),
    );
  }, [dateFrom, dateTo, supSmsSorted]);

  const opSmsRows = useMemo(
    () =>
      operadores.map((op) => ({
        ...op,
        _pct_suc_com: op.com_sms > 0 ? Math.round((op.sucesso_com / op.com_sms) * 1000) / 10 : 0,
        _pct_suc_sem: op.sem_sms > 0 ? Math.round((op.sucesso_sem / op.sem_sms) * 1000) / 10 : 0,
      })),
    [operadores],
  );
  const {
    sorted: opSmsSorted,
    sortKey: opSmsKey,
    sortDir: opSmsDir,
    toggleSort: toggleOpSms,
  } = useTableSortFields(opSmsRows, 'total', 'desc');

  const aplicarMesAtual = () => {
    const r = getMonthRange();
    setDateFrom(r.dateFrom);
    setDateTo(r.dateTo);
  };

  return (
    <AdminLayout
      title="SMS Prévio"
      subtitle="Só portabilidade com OS TIM — nova linha não entra"
    >
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 leading-relaxed">
        <strong className="text-slate-700">Universo:</strong> só propostas com{' '}
        <strong>OS TIM (1-xxx)</strong> no cubo SMS. Sem OS não entra. Chip/ICCID{' '}
        <strong>não</strong> filtra este volume — o Gross do filtro não é “OS com ICCID portada”.
        Portado = ticket Portado, Falha Parcial ou Ativo. Consulta segue até o bilhete.
        Nova linha não entra. OS Concluído sem ticket = aguardando.
        {stats && stats.vendasCorrecao > 0 ? (
          <>
            {' '}
            <strong className="text-slate-800">
              Correção no período: {stats.vendasCorrecao} vendas Port/eSIM
            </strong>
            {' · '}
            cubo SMS (já com OS): {stats.total} ({Math.round((1000 * stats.total) / stats.vendasCorrecao) / 10}%
            com OS) · portados no cubo: {stats.totalSucesso}.
          </>
        ) : null}
      </div>
      {/* Filtros */}
      <div className="card p-4 shadow-sm mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar size={14} className="text-gray-400" aria-hidden />
          <label className="sr-only" htmlFor="sms-date-from">
            Data inicial
          </label>
          <input
            id="sms-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Data inicial"
            className="input-field text-sm py-2 w-36"
          />
          <span className="text-xs text-gray-400">até</span>
          <label className="sr-only" htmlFor="sms-date-to">
            Data final
          </label>
          <input
            id="sms-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Data final"
            className="input-field text-sm py-2 w-36"
          />
          <button
            type="button"
            onClick={aplicarMesAtual}
            className="text-xs text-blue-600 font-semibold hover:text-blue-700"
          >
            Mês atual
          </button>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="text-xs text-gray-500 font-semibold hover:text-gray-700"
            >
              Todo histórico
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">{stats?.total ?? 0} registros</span>
            <span className="text-xs text-gray-300">|</span>
            <span className="text-xs text-gray-400">{periodoLabel(dateFrom, dateTo)}</span>
            <span className="text-xs text-gray-300">|</span>
            <span className="text-xs text-gray-400">{lastUpdate.toLocaleTimeString('pt-BR')}</span>
            <button
              type="button"
              onClick={() => fetchData(false)}
              className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3"
            >
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>
        </div>
      </div>

      {fetchError && (
        <div
          className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3"
          role="alert"
        >
          <AlertCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Erro ao carregar</p>
            <p className="text-xs text-red-600 mt-0.5">{fetchError}</p>
            <button
              type="button"
              onClick={() => fetchData(true)}
              className="mt-2 text-xs font-semibold text-red-700 underline"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6 h-28 skeleton" />
          ))}
        </div>
      ) : !stats || (stats.total === 0 && !fetchError) ? (
        <div className="card p-12 text-center text-gray-400">
          <MessageSquare size={40} className="mx-auto mb-3 opacity-40" />
          <p>Sem dados no período selecionado.</p>
          <p className="text-xs mt-2">{periodoLabel(dateFrom, dateTo)}</p>
        </div>
      ) : stats ? (
        <>
          {/* HERO — Portados hoje = só bilhete; propostas = retorno TIM hoje */}
          <div className="card p-6 shadow-sm mb-4 border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white card-enter">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={18} className="text-emerald-600" />
                  <span className="text-sm font-bold text-emerald-800 uppercase tracking-wide">
                    Portados hoje
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                    Só bilhete · BRT
                  </span>
                </div>
                <div className="text-5xl font-black text-emerald-600 tabular-nums leading-none mt-2">
                  {stats.portadosHoje}
                </div>
                <p className="text-sm text-gray-700 mt-3">
                  de{' '}
                  <span className="font-bold tabular-nums">{stats.propostasRetornoHoje}</span>
                  {' '}propostas com retorno TIM hoje
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Portado = ticket Portado, Falha Parcial ou Ativo. OS Concluído sem ticket não entra.
                  {stats.osSemBilheteHoje > 0 && (
                    <>
                      {' '}
                      {stats.osSemBilheteHoje} com OS Concluído sem bilhete{' '}
                      <span className="font-semibold">não entram</span>.
                    </>
                  )}
                  {' '}
                  <Link to="/disparos" className="text-emerald-800 font-semibold underline underline-offset-2">
                    Ver Disparos
                  </Link>
                  {' · '}Disparos conta só ticket = Portado.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:w-80">
                <div className="rounded-xl bg-white border border-emerald-100 p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Com SMS</p>
                  <p className="text-2xl font-black text-teal-600">{stats.portadosHojeComSms}</p>
                </div>
                <div className="rounded-xl bg-white border border-emerald-100 p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Sem SMS</p>
                  <p className="text-2xl font-black text-amber-600">{stats.portadosHojeSemSms}</p>
                </div>
                {stats.portadosHojeSemInfo > 0 && (
                  <div className="col-span-2 rounded-xl bg-white border border-gray-100 p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">SMS desconhecido</p>
                    <p className="text-xl font-black text-gray-500">{stats.portadosHojeSemInfo}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Fora do comparativo COM/SEM (sms_previo null)
                    </p>
                  </div>
                )}
                <div className="col-span-2 rounded-xl bg-white border border-gray-100 p-3">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">
                    Bilhetes dos portados
                  </p>
                  <p className="text-xs text-gray-700 leading-relaxed">{stats.portadosHojeBreakdown}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Visão consolidada do período */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="card p-5 shadow-sm border border-blue-100 card-enter hover-lift" style={{ animationDelay: '60ms' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Portados totais</span>
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                  <TrendingUp size={18} className="text-blue-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-blue-600">{stats.totalSucesso}</div>
              <p className="text-sm font-semibold text-gray-700 mt-1">
                <span className="text-teal-600">{stats.sucessoComSms}</span>
                <span className="text-gray-400 mx-1">+</span>
                <span className="text-amber-600">{stats.sucessoSemSms}</span>
                {stats.sucessoSemInfo > 0 && (
                  <>
                    <span className="text-gray-400 mx-1">+</span>
                    <span className="text-gray-500">{stats.sucessoSemInfo}</span>
                  </>
                )}
                <span className="text-emerald-600 ml-2">
                  {stats.pctPortadosConsolidado.toFixed(1)}% portados
                </span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Portado = ticket Portado, Falha Parcial ou Ativo. OS Concluído sem ticket não conta.
                {' '}
                {stats.sucessoComSms} c/ SMS · {stats.sucessoSemSms} s/ SMS
                {stats.sucessoSemInfo > 0 ? ` · ${stats.sucessoSemInfo} sem info SMS` : ''}
                {' · '}propostas únicas no filtro
              </p>
            </div>

            <div className="card p-5 shadow-sm card-enter hover-lift" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Universo GROSS</span>
                <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <MessageSquare size={18} className="text-indigo-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-indigo-600">{stats.total}</div>
              <p className="text-sm font-semibold text-gray-700 mt-1">
                <span className="text-emerald-600">{stats.totalSucesso}</span>
                <span className="text-gray-400 mx-1">portados ·</span>
                <span className="text-amber-600">{stats.totalAguardando}</span>
                <span className="text-gray-400 mx-1">aguard. ·</span>
                <span className="text-slate-500">{stats.totalInsucesso}</span>
                <span className="text-gray-400"> insucesso</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Vendas COM OS no período · {stats.comSms} c/ SMS · {stats.semSms} s/ SMS (com info)
              </p>
            </div>

            <div className="card p-5 shadow-sm card-enter hover-lift" style={{ animationDelay: '140ms' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Cobertura de meta</span>
                <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center">
                  <Users size={18} className="text-violet-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-violet-600">
                {stats.coberturaMeta.toFixed(0)}%
              </div>
              <p className="text-xs text-amber-600 mt-1 font-semibold">
                {stats.total - stats.comSupervisor} sem supervisor (
                {stats.total > 0
                  ? (((stats.total - stats.comSupervisor) / stats.total) * 100).toFixed(0)
                  : 0}
                %)
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {stats.comSupervisor} com meta · ranking exclui “Sem supervisor”
              </p>
            </div>

            <div className="card p-5 shadow-sm border border-amber-100 card-enter hover-lift" style={{ animationDelay: '180ms' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Oportunidade SMS</span>
                <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
                  <Zap size={18} className="text-amber-600" />
                </div>
              </div>
              <div className="text-3xl font-black text-amber-600">+{oportunidade}</div>
              <p className="text-xs text-gray-500 mt-1">
                Portados extras se SEM SMS igualasse a taxa COM ({stats.taxaSucessoComSms.toFixed(1)}%)
              </p>
            </div>
          </div>

          {/* Taxas COM / SEM / Lift */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="card p-5 shadow-sm card-enter hover-lift" style={{ animationDelay: '200ms' }}>
              <span className="text-sm font-medium text-gray-500">Taxa sucesso COM SMS</span>
              <div className="text-3xl font-black text-teal-600 mt-1">
                {stats.taxaSucessoComSms.toFixed(1)}%
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {stats.sucessoComSms} portados de {stats.comSms}
              </p>
            </div>
            <div className="card p-5 shadow-sm card-enter hover-lift" style={{ animationDelay: '240ms' }}>
              <span className="text-sm font-medium text-gray-500">Taxa sucesso SEM SMS</span>
              <div className="text-3xl font-black text-amber-600 mt-1">
                {stats.taxaSucessoSemSms.toFixed(1)}%
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {stats.sucessoSemSms} portados de {stats.semSms}
              </p>
            </div>
            <div className="card p-5 shadow-sm border border-teal-100 card-enter hover-lift" style={{ animationDelay: '280ms' }}>
              <span className="text-sm font-medium text-gray-500">Lift COM vs SEM</span>
              <div
                className={`text-3xl font-black mt-1 ${lift >= 0 ? 'text-teal-600' : 'text-red-600'}`}
              >
                {lift >= 0 ? '+' : ''}
                {lift.toFixed(1)} pp
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Diferença de taxa de portabilidade consolidada no período
              </p>
            </div>
          </div>

          {/* Gráficos de acompanhamento */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <div className="card p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-1">
                Volume e portados no período
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                Gross = portabilidade com OS TIM no dia da venda · % = portados / vendas com OS.
                Portado de venda antiga que fechou hoje aparece no card acima, não neste dia.
                Domingo sem venda fica em 0 (não some do eixo).
              </p>
              {serieDiaria.length === 0 ? (
                <p className="text-sm text-gray-400 py-12 text-center">Sem série diária</p>
              ) : (
                <div className="h-72" role="img" aria-label="Gráfico de gross, portados e taxa percentual por dia">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={serieDiaria} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis
                        yAxisId="vol"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        allowDecimals={false}
                      />
                      <YAxis
                        yAxisId="pct"
                        orientation="right"
                        tick={{ fontSize: 11, fill: '#0d9488' }}
                        domain={[0, 100]}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip content={<VolumeTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        yAxisId="vol"
                        dataKey="total"
                        name="Vendas com OS"
                        fill="#94a3b8"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="vol"
                        dataKey="portados"
                        name="Portados"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="pct"
                        type="linear"
                        dataKey="pctPortados"
                        name="% Portados"
                        stroke="#0d9488"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#0d9488' }}
                        activeDot={{ r: 5 }}
                        connectNulls={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="card p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-1">
                Taxa de sucesso COM vs SEM SMS
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                % com ticket Portado / Falha Parcial / Ativo no dia da venda · nova linha fora
              </p>
              {serieDiaria.length === 0 ? (
                <p className="text-sm text-gray-400 py-12 text-center">Sem série diária</p>
              ) : (
                <div
                  className="h-64"
                  role="img"
                  aria-label="Gráfico de taxa de sucesso COM e SEM SMS por dia"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={serieDiaria} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        domain={[0, 'auto']}
                        unit="%"
                      />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, undefined]}
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #e2e8f0',
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        type="linear"
                        dataKey="taxaCom"
                        name="% Sucesso COM"
                        stroke="#0d9488"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#0d9488' }}
                        connectNulls={false}
                      />
                      <Line
                        type="linear"
                        dataKey="taxaSem"
                        name="% Sucesso SEM"
                        stroke="#d97706"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        connectNulls={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Comparativo visual barras */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="card p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-500" />
                COM SMS Prévio ({stats.comSms})
              </h3>
              <div className="space-y-3">
                {[
                  {
                    label: 'Portado consolidado',
                    value: stats.sucessoComSms,
                    color: 'bg-emerald-500',
                    pct: stats.comSms > 0 ? (stats.sucessoComSms / stats.comSms) * 100 : 0,
                  },
                  {
                    label: 'Insucesso',
                    value: stats.insucessoComSms,
                    color: 'bg-red-500',
                    pct: stats.comSms > 0 ? (stats.insucessoComSms / stats.comSms) * 100 : 0,
                  },
                  {
                    label: 'Aguardando',
                    value: stats.aguardandoComSms,
                    color: 'bg-amber-400',
                    pct: stats.comSms > 0 ? (stats.aguardandoComSms / stats.comSms) * 100 : 0,
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-40 truncate">{item.label}</span>
                    <div
                      className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={Math.round(item.pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${item.label}: ${item.value}`}
                    >
                      <div
                        className={`h-full rounded-full ${item.color} transition-all duration-700`}
                        style={{ width: `${Math.max(item.pct, item.value > 0 ? 1 : 0)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-700 w-20 text-right">
                      {item.value} ({item.pct.toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <XCircle size={16} className="text-amber-500" />
                SEM SMS Prévio ({stats.semSms})
              </h3>
              <div className="space-y-3">
                {[
                  {
                    label: 'Portado consolidado',
                    value: stats.sucessoSemSms,
                    color: 'bg-emerald-500',
                    pct: stats.semSms > 0 ? (stats.sucessoSemSms / stats.semSms) * 100 : 0,
                  },
                  {
                    label: 'Insucesso',
                    value: stats.insucessoSemSms,
                    color: 'bg-red-500',
                    pct: stats.semSms > 0 ? (stats.insucessoSemSms / stats.semSms) * 100 : 0,
                  },
                  {
                    label: 'Aguardando',
                    value: stats.aguardandoSemSms,
                    color: 'bg-amber-400',
                    pct: stats.semSms > 0 ? (stats.aguardandoSemSms / stats.semSms) * 100 : 0,
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-40 truncate">{item.label}</span>
                    <div
                      className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={Math.round(item.pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${item.label}: ${item.value}`}
                    >
                      <div
                        className={`h-full rounded-full ${item.color} transition-all duration-700`}
                        style={{ width: `${Math.max(item.pct, item.value > 0 ? 1 : 0)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-700 w-20 text-right">
                      {item.value} ({item.pct.toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Coaching: priorizar SEM SMS */}
          {topSemSms.length > 0 && (
            <div className="card p-6 shadow-sm mb-8">
              <div className="flex items-center gap-2 mb-1">
                <Target size={16} className="text-amber-600" />
                <h3 className="text-sm font-bold text-gray-700">Priorizar agora — volume SEM SMS</h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Equipes com mais propostas sem SMS no período (coaching de adesão)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {topSemSms.map((s) => (
                  <button
                    key={`gap-${s.supervisor}-${s.equipe}`}
                    type="button"
                    onClick={() => openOperadores(s.supervisor)}
                    className="text-left rounded-xl border border-amber-100 bg-amber-50/50 p-3 hover:bg-amber-50 transition-colors"
                  >
                    <p className="text-sm font-bold text-gray-900 truncate">{s.supervisor}</p>
                    <p className="text-[10px] text-gray-500 truncate">{s.equipe}</p>
                    <p className="text-lg font-black text-amber-600 mt-2">{s.sem_sms} SEM</p>
                    <p className="text-[10px] text-gray-500">
                      adesão {s.taxa_sms.toFixed(0)}% · gap {s.gap.toFixed(1)} pp
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Ranking */}
          <div className="card shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-700">
                  Ranking por Supervisor — Adesão e Eficiência SMS Prévio
                </h3>
                <p className="text-xs text-gray-400">
                  Min. 5 propostas · só quem tem supervisor · clique para ver operadores
                </p>
              </div>
              <button type="button" onClick={exportarRanking} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3">
                <Download size={14} /> Exportar ranking
              </button>
            </div>

            {semSupervisor && semSupervisor.total > 0 && (
              <div className="mx-4 mt-4 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs font-bold text-amber-800">Sem supervisor (fora do ranking)</span>
                <span className="text-xs text-amber-700">
                  {semSupervisor.total} propostas · {semSupervisor.com_sms} com SMS (
                  {semSupervisor.taxa_sms.toFixed(0)}% adesão)
                </span>
                <span className="text-xs text-amber-700">
                  Portados: {semSupervisor.sucesso_com_sms}+{semSupervisor.sucesso_sem_sms} ={' '}
                  {semSupervisor.sucesso_com_sms + semSupervisor.sucesso_sem_sms}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-amber-800 underline ml-auto"
                  onClick={() => openOperadores('Sem supervisor')}
                >
                  Ver detalhe
                </button>
              </div>
            )}

            {supervisores.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm space-y-3">
                <p>Sem supervisores com meta no período (ou todos estão em “Sem supervisor”).</p>
                {stats && (
                  <p className="text-sm font-semibold text-gray-700">
                    Resultado geral: {stats.sucessoComSms}+{stats.sucessoSemSms}
                    {stats.sucessoSemInfo > 0 ? `+${stats.sucessoSemInfo}` : ''} = {stats.totalSucesso}{' '}
                    portados ({stats.pctPortadosConsolidado.toFixed(1)}%)
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500 text-xs">
                      <th className="text-left px-4 py-3">#</th>
                      <SortTh label="Supervisor" col="supervisor" sortKey={supSmsKey} sortDir={supSmsDir} onSort={toggleSupSms} align="left" className="px-4 py-3" />
                      <SortTh label="Equipe" col="equipe" sortKey={supSmsKey} sortDir={supSmsDir} onSort={toggleSupSms} align="left" className="px-4 py-3" />
                      <SortTh label="Total" col="total" sortKey={supSmsKey} sortDir={supSmsDir} onSort={toggleSupSms} align="right" className="px-4 py-3" />
                      <SortTh label="Com SMS" col="com_sms" sortKey={supSmsKey} sortDir={supSmsDir} onSort={toggleSupSms} align="right" className="px-4 py-3" />
                      <SortTh label="% Adesão" col="taxa_sms" sortKey={supSmsKey} sortDir={supSmsDir} onSort={toggleSupSms} align="right" className="px-4 py-3" />
                      <SortTh label="Portado c/ SMS" col="sucesso_com_sms" sortKey={supSmsKey} sortDir={supSmsDir} onSort={toggleSupSms} align="right" className="px-4 py-3" />
                      <SortTh label="% Sucesso c/ SMS" col="pct_sucesso_com" sortKey={supSmsKey} sortDir={supSmsDir} onSort={toggleSupSms} align="right" className="px-4 py-3" />
                      <SortTh label="Portado s/ SMS" col="sucesso_sem_sms" sortKey={supSmsKey} sortDir={supSmsDir} onSort={toggleSupSms} align="right" className="px-4 py-3" />
                      <SortTh label="% Sucesso s/ SMS" col="pct_sucesso_sem" sortKey={supSmsKey} sortDir={supSmsDir} onSort={toggleSupSms} align="right" className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {(supSmsSorted as typeof supervisores).map((s, i) => (
                      <tr
                        key={`${s.supervisor}-${s.equipe}`}
                        className="border-b border-gray-50 hover:bg-blue-50/50 transition-all cursor-pointer fade-slide-up"
                        style={{ animationDelay: `${i * 40}ms` }}
                        onClick={() => openOperadores(s.supervisor)}
                      >
                        <td className="px-4 py-3 font-bold text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-blue-700 underline decoration-dotted">
                          {s.supervisor}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{s.equipe}</td>
                        <td className="px-4 py-3 text-right">{s.total}</td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-semibold">
                          {s.com_sms}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`badge ${
                              s.taxa_sms > 70
                                ? 'bg-emerald-50 text-emerald-600'
                                : s.taxa_sms > 40
                                  ? 'bg-amber-50 text-amber-600'
                                  : 'bg-red-50 text-red-600'
                            }`}
                          >
                            {s.taxa_sms.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-teal-600 font-semibold">
                          {s.sucesso_com_sms}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`badge text-[10px] ${
                              s.pct_sucesso_com > 5
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {s.pct_sucesso_com.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{s.sucesso_sem_sms}</td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`badge text-[10px] ${
                              s.pct_sucesso_sem > 5
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {s.pct_sucesso_sem.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold text-xs">
                      <td className="px-4 py-3 text-gray-500" colSpan={3}>
                        RESULTADO GERAL (universo filtrado)
                      </td>
                      <td className="px-4 py-3 text-right">{stats.total}</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{stats.comSms}</td>
                      <td className="px-4 py-3 text-right">
                        {stats.total > 0
                          ? ((stats.comSms / stats.total) * 100).toFixed(0)
                          : 0}
                        %
                      </td>
                      <td className="px-4 py-3 text-right text-teal-700">{stats.sucessoComSms}</td>
                      <td className="px-4 py-3 text-right text-teal-700">
                        {stats.taxaSucessoComSms.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{stats.sucessoSemSms}</td>
                      <td className="px-4 py-3 text-right text-amber-700">
                        {stats.taxaSucessoSemSms.toFixed(1)}%
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/80 text-xs">
                      <td className="px-4 py-2.5 text-emerald-800 font-bold" colSpan={6}>
                        Portados consolidado = {stats.sucessoComSms} + {stats.sucessoSemSms} ={' '}
                        {stats.totalSucesso}
                      </td>
                      <td className="px-4 py-2.5 text-right text-emerald-800 font-bold" colSpan={4}>
                        {stats.pctPortadosConsolidado.toFixed(1)}% do gross
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Modal operadores */}
          {selectedSup && (
            <ModalShell
              title={`Operadores — ${selectedSup}`}
              subtitle="Detalhamento individual por vendedor"
              size="xl"
              onClose={closeOperadores}
              footer={<span>{operadores.length} operadores · Esc para fechar</span>}
            >
                <div className="overflow-y-auto">
                  {operadores.length === 0 ? (
                    <p className="text-center text-gray-400 py-8">Nenhum operador encontrado</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-gray-500 text-xs">
                          <SortTh label="Vendedor" col="vendedor" sortKey={opSmsKey} sortDir={opSmsDir} onSort={toggleOpSms} align="left" className="px-4 py-2" />
                          <SortTh label="Total" col="total" sortKey={opSmsKey} sortDir={opSmsDir} onSort={toggleOpSms} align="right" className="px-4 py-2" />
                          <SortTh label="Com SMS" col="com_sms" sortKey={opSmsKey} sortDir={opSmsDir} onSort={toggleOpSms} align="right" className="px-4 py-2" />
                          <SortTh label="% Adesão" col="taxa_sms" sortKey={opSmsKey} sortDir={opSmsDir} onSort={toggleOpSms} align="right" className="px-4 py-2" />
                          <SortTh label="Portado c/ SMS" col="sucesso_com" sortKey={opSmsKey} sortDir={opSmsDir} onSort={toggleOpSms} align="right" className="px-4 py-2" />
                          <SortTh label="% Suc c/ SMS" col="_pct_suc_com" sortKey={opSmsKey} sortDir={opSmsDir} onSort={toggleOpSms} align="right" className="px-4 py-2" />
                          <SortTh label="Portado s/ SMS" col="sucesso_sem" sortKey={opSmsKey} sortDir={opSmsDir} onSort={toggleOpSms} align="right" className="px-4 py-2" />
                          <SortTh label="% Suc s/ SMS" col="_pct_suc_sem" sortKey={opSmsKey} sortDir={opSmsDir} onSort={toggleOpSms} align="right" className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {(opSmsSorted as typeof opSmsRows).map((op) => (
                          <tr key={op.vendedor} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium text-gray-900 truncate max-w-[180px]">
                              {op.vendedor}
                            </td>
                            <td className="px-4 py-2 text-right">{op.total}</td>
                            <td className="px-4 py-2 text-right text-emerald-600 font-semibold">
                              {op.com_sms}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span
                                className={`badge text-[10px] ${
                                  op.taxa_sms > 70
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : op.taxa_sms > 40
                                      ? 'bg-amber-50 text-amber-600'
                                      : 'bg-red-50 text-red-600'
                                }`}
                              >
                                {op.taxa_sms.toFixed(0)}%
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-teal-600">{op.sucesso_com}</td>
                            <td className="px-4 py-2 text-right text-xs">
                              {op.com_sms > 0
                                ? ((op.sucesso_com / op.com_sms) * 100).toFixed(1)
                                : '0.0'}
                              %
                            </td>
                            <td className="px-4 py-2 text-right text-gray-500">{op.sucesso_sem}</td>
                            <td className="px-4 py-2 text-right text-xs">
                              {op.sem_sms > 0
                                ? ((op.sucesso_sem / op.sem_sms) * 100).toFixed(1)
                                : '0.0'}
                              %
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
            </ModalShell>
          )}
        </>
      ) : null}
    </AdminLayout>
  );
}
