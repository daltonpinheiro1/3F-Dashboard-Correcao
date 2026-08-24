import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Gauge,
  PhoneCall,
  RefreshCw,
  Target,
  TrendingDown,
  Zap,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminLayout } from '../components/AdminLayout';
import { SortTh } from '../components/SortTh';
import { StaleDataBanner } from '../components/StaleDataBanner';
import {
  fetchEvaLive,
  fetchEvaPeriodo,
  fmtHms,
  matchCampanha,
  resolveDiscagens,
  type CampanhaOp,
  type EvaDiscagens,
  type EvaDiscagensOperador,
  type EvaDiscagensSerie10Op,
  type EvaDiscagensSlice,
  type EvaDiscagensTabHora,
  type EvaPayload,
} from '../lib/evaDash';
import { isLiveStale, liveAgeMs } from '../hooks/useEvaLive';
import { filtroEvaAtivo, useFiltroEvaStore } from '../store/filtroStore';
import { useMetaCpcStore } from '../store/metaCpcStore';
import { useTableSortFields } from '../lib/tableSort';

const HORAS = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'];

function horaKey(h: string | number) {
  return String(h).padStart(2, '0').slice(0, 2);
}

/** Taxa % com 2 casas quando < 1% (preditivo). */
function rateFine(n: number, d: number) {
  if (!d) return 0;
  const pct = (100 * n) / d;
  return Math.round(pct * (pct > 0 && pct < 1 ? 100 : 10)) / (pct > 0 && pct < 1 ? 100 : 10);
}

function limLoc(camp: CampanhaOp | string | undefined) {
  if (camp === 'PORTABILIDADE') return 5;
  if (camp === 'MIGRACAO') return 0.4;
  return 0.5;
}

function limEfficacy(camp: CampanhaOp | string | undefined) {
  if (camp === 'PORTABILIDADE') return 0.3;
  if (camp === 'MIGRACAO') return 0.05;
  return 0.05;
}

/** Normaliza código EVA → nome legível (fallback se sync antigo). */
function prettyMailing(raw: string | undefined | null): { nome: string; codigo: string } {
  const codigo = (raw || '—').trim() || '—';
  // Prefixo EVA pode ter 14–17+ dígitos antes de _ ou espaço
  let nome = codigo.replace(/^\d{8,20}[_\s-]+/, '');
  nome = nome.replace(/_auto_\d+$/i, '');
  nome = nome.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  // Se ainda começa com timestamp residual, corta
  nome = nome.replace(/^\d{8,20}\s+/, '').trim();
  return { nome: nome || codigo, codigo };
}

function isFilaBackofficeOuRobo(texto: string | undefined | null): boolean {
  const t = (texto || '').toLowerCase();
  return (
    t.includes('robo') ||
    t.includes('bko') ||
    t.includes('backoffice') ||
    t.includes('acao bko') ||
    t.includes('ação bko')
  );
}

function shortQueue(q: string | undefined | null): string {
  const s = (q || '—').trim() || '—';
  const m = s.match(/^\d+\s*-\s*(?:TIM\s+)?(.+)$/i);
  return (m?.[1] || s).trim();
}

function shortCamp(c: string | undefined | null): string {
  if (c === 'PORTABILIDADE') return 'Portabilidade';
  if (c === 'MIGRACAO') return 'Migração';
  return c || 'Outros';
}

function comportamentoFallback(o: {
  flags?: string[];
  cpc_rate: number;
  fila_cpc_mediana: number;
  conv_tab: number;
  fila_conv_mediana: number;
  comportamento_label?: string;
}): { label: string; hint: string; acao: string } {
  if (o.comportamento_label) {
    return {
      label: o.comportamento_label,
      hint: '',
      acao: '',
    };
  }
  const flags = o.flags || [];
  if (flags.includes('cpc_abaixo') && flags.includes('conv_abaixo')) {
    return { label: 'Gap duplo', hint: 'CPC e conversão abaixo', acao: 'Escuta + coaching' };
  }
  if (flags.includes('cpc_abaixo')) {
    return { label: 'CPC abaixo da fila', hint: 'Contato/abordagem', acao: 'Revisar não-CPC' };
  }
  if (flags.includes('conv_abaixo') && o.conv_tab <= 0) {
    return { label: 'Zero conversão', hint: 'CPC ok, sem sucesso', acao: 'Fechamento/oferta' };
  }
  return { label: 'Conversão fraca', hint: 'Fecha menos que peers', acao: 'Benchmark top fila' };
}

function mergeDiscagens(hist: EvaPayload[]): EvaDiscagens {
  const acc = {
    dialed: 0,
    contact: 0,
    tabuladas: 0,
    cpc: 0,
    sucesso: 0,
    dialing_time_seg: 0,
  };
  const porCamp: Record<string, EvaDiscagensSlice> = {};
  const serie: Record<string, EvaDiscagensSlice> = {};
  const mailing: Record<string, EvaDiscagensSlice> = {};
  const tabAcc: Record<string, EvaDiscagensTabHora> = {};
  const amdAcc: Record<string, { nome: string; dialed: number; contact: number }> = {};
  const filaAcc: Record<string, EvaDiscagensSlice & { queue_name?: string; operadores?: number; conv_tab?: number; conv_loc?: number }> = {};
  const supAcc: Record<
    string,
    {
      supervisor_name: string;
      operadores: number;
      tabuladas: number;
      cpc: number;
      sucesso: number;
      cpc_rate: number;
      conv_tab: number;
      conv_loc?: number;
      desligue: number;
      desligue_agente: number;
    }
  > = {};
  const opAcc: Record<string, EvaDiscagensOperador> = {};
  let fonteNativa = 0;
  let fonteEstimada = 0;
  let fonte = 'estimado_tabuladas';

  for (const p of hist) {
    const d = resolveDiscagens(p);
    // Ignora stubs sem volume (ex.: dia com só jornada / discagens de outro dia)
    if ((d.kpis?.dialed || 0) <= 0 && (d.kpis?.tabuladas || 0) <= 0) continue;
    if (
      d.fonte === 'mailing_dial_details' ||
      d.fonte === 'mailing_logger' ||
      d.fonte === 'mailing_dial_details_hist'
    ) {
      fonteNativa += 1;
      fonte = d.fonte === 'mailing_dial_details_hist' ? 'mailing_dial_details' : d.fonte;
    } else {
      fonteEstimada += 1;
    }
    const k = d.kpis;
    acc.dialed += k.dialed || 0;
    acc.contact += k.contact || 0;
    acc.tabuladas += k.tabuladas || 0;
    acc.cpc += k.cpc || 0;
    acc.sucesso += k.sucesso || 0;
    acc.dialing_time_seg += k.dialing_time_seg || 0;

    for (const r of d.por_campanha || []) {
      const key = r.campanha_op || 'OUTROS';
      if (!porCamp[key]) porCamp[key] = { campanha_op: key, dialed: 0, contact: 0, tabuladas: 0, cpc: 0, sucesso: 0, contact_rate: 0, cpc_rate: 0, efficacy: 0 };
      porCamp[key].dialed += r.dialed || 0;
      porCamp[key].contact += r.contact || 0;
      porCamp[key].tabuladas += r.tabuladas || 0;
      porCamp[key].cpc += r.cpc || 0;
      porCamp[key].sucesso += r.sucesso || 0;
    }
    for (const r of d.serie_hora || []) {
      const key = `${horaKey(r.hora || '')}|${r.campanha_op || ''}`;
      if (!serie[key]) serie[key] = { hora: horaKey(r.hora || ''), campanha_op: r.campanha_op, dialed: 0, contact: 0, tabuladas: 0, cpc: 0, sucesso: 0, contact_rate: 0, cpc_rate: 0, efficacy: 0 };
      serie[key].dialed += r.dialed || 0;
      serie[key].contact += r.contact || 0;
      serie[key].tabuladas += r.tabuladas || 0;
      serie[key].cpc += r.cpc || 0;
      serie[key].sucesso += r.sucesso || 0;
    }
    for (const r of d.por_mailing || []) {
      const key = `${r.mailing || '—'}|${r.campanha_op || ''}`;
      if (!mailing[key]) mailing[key] = { mailing: r.mailing || '—', campanha_op: r.campanha_op, dialed: 0, contact: 0, tabuladas: 0, cpc: 0, sucesso: 0, contact_rate: 0, cpc_rate: 0, efficacy: 0 };
      mailing[key].dialed += r.dialed || 0;
      mailing[key].contact += r.contact || 0;
      mailing[key].tabuladas += r.tabuladas || 0;
      mailing[key].cpc += r.cpc || 0;
      mailing[key].sucesso += r.sucesso || 0;
    }
    for (const t of d.tab_hora || []) {
      const key = `${t.nome}|${t.campanha_op || ''}`;
      if (!tabAcc[key]) {
        tabAcc[key] = {
          nome: t.nome,
          campanha_op: t.campanha_op,
          total: 0,
          phones: 0,
          pct_phones: 0,
          horas: {},
          pct_hora: {},
        };
      }
      tabAcc[key].total += t.total || 0;
      tabAcc[key].phones = Math.max(tabAcc[key].phones || 0, t.phones || 0);
      for (const h of HORAS) {
        tabAcc[key].horas[h] = (tabAcc[key].horas[h] || 0) + (t.horas?.[h] || 0);
      }
    }
    for (const a of d.por_amd || []) {
      const key = a.nome || '—';
      if (!amdAcc[key]) amdAcc[key] = { nome: key, dialed: 0, contact: 0 };
      amdAcc[key].dialed += a.dialed || 0;
      amdAcc[key].contact += a.contact || 0;
    }
    for (const r of d.por_fila || []) {
      const key = `${r.queue_name || r.mailing || '—'}|${r.campanha_op || ''}`;
      if (!filaAcc[key]) {
        filaAcc[key] = {
          queue_name: r.queue_name,
          campanha_op: r.campanha_op,
          dialed: 0,
          contact: 0,
          tabuladas: 0,
          cpc: 0,
          sucesso: 0,
          contact_rate: 0,
          cpc_rate: 0,
          efficacy: 0,
          operadores: 0,
          conv_tab: 0,
          conv_loc: 0,
        };
      }
      filaAcc[key].dialed! += r.dialed || 0;
      filaAcc[key].contact! += r.contact || 0;
      filaAcc[key].tabuladas! += r.tabuladas || 0;
      filaAcc[key].cpc! += r.cpc || 0;
      filaAcc[key].sucesso! += r.sucesso || 0;
      filaAcc[key].operadores = Math.max(filaAcc[key].operadores || 0, r.operadores || 0);
    }
    for (const r of d.por_supervisor || []) {
      const key = r.supervisor_name || '—';
      if (!supAcc[key]) {
        supAcc[key] = {
          supervisor_name: key,
          operadores: 0,
          tabuladas: 0,
          cpc: 0,
          sucesso: 0,
          cpc_rate: 0,
          conv_tab: 0,
          conv_loc: 0,
          desligue: 0,
          desligue_agente: 0,
        };
      }
      supAcc[key].operadores = Math.max(supAcc[key].operadores, r.operadores || 0);
      supAcc[key].tabuladas += r.tabuladas || 0;
      supAcc[key].cpc += r.cpc || 0;
      supAcc[key].sucesso += r.sucesso || 0;
      supAcc[key].desligue += r.desligue || 0;
      supAcc[key].desligue_agente += r.desligue_agente || 0;
    }
    for (const r of d.por_operador || []) {
      const key = `${r.login || r.user_name || '—'}|${r.campanha_op || ''}`;
      if (!opAcc[key]) {
        opAcc[key] = {
          id_user: r.id_user,
          user_name: r.user_name,
          supervisor_name: r.supervisor_name,
          queue_name: r.queue_name,
          queue_curta: r.queue_curta,
          campanha_op: r.campanha_op,
          campanha_label: r.campanha_label,
          tabuladas: 0,
          cpc: 0,
          sucesso: 0,
          contact: 0,
          desligue: 0,
          desligue_agente: 0,
          cpc_rate: 0,
          conv_tab: 0,
          conv_loc: 0,
          desligue_rate: 0,
          desligue_agente_rate: 0,
        };
      }
      opAcc[key].tabuladas += r.tabuladas || 0;
      opAcc[key].cpc += r.cpc || 0;
      opAcc[key].sucesso += r.sucesso || 0;
      opAcc[key].contact = (opAcc[key].contact || 0) + (r.contact || 0);
      opAcc[key].desligue = (opAcc[key].desligue || 0) + (r.desligue || 0);
      opAcc[key].desligue_agente = (opAcc[key].desligue_agente || 0) + (r.desligue_agente || 0);
    }
  }

  if (fonteNativa > 0 && fonteEstimada > 0) fonte = `${fonte}+estimado`;

  const enrich = (r: EvaDiscagensSlice): EvaDiscagensSlice => ({
    ...r,
    contact_rate: rateFine(r.contact || 0, r.dialed || 0),
    cpc_rate: rateFine(r.cpc || 0, r.tabuladas || 0),
    efficacy: rateFine(r.sucesso || 0, r.dialed || 0),
    tab_rate: rateFine(r.tabuladas || 0, r.dialed || 0),
  });

  const horaTot: Record<string, number> = {};
  for (const t of Object.values(tabAcc)) {
    for (const h of HORAS) horaTot[h] = (horaTot[h] || 0) + (t.horas[h] || 0);
  }
  const phonesAll = Object.values(tabAcc).reduce((s, t) => s + (t.phones || 0), 0) || 1;
  const tab_hora = Object.values(tabAcc)
    .map((t) => {
      const pct_hora: Record<string, number> = {};
      for (const h of HORAS) pct_hora[h] = rateFine(t.horas[h] || 0, horaTot[h] || 0);
      return { ...t, pct_hora, pct_phones: rateFine(t.phones || 0, phonesAll) };
    })
    .sort((a, b) => b.total - a.total);

  const por_amd = Object.values(amdAcc)
    .map((a) => ({
      nome: a.nome,
      dialed: a.dialed,
      contact: a.contact,
      contact_rate: rateFine(a.contact, a.dialed),
      pct_dialed: rateFine(a.dialed, acc.dialed || 1),
    }))
    .sort((a, b) => b.dialed - a.dialed)
    .slice(0, 25);

  const por_fila = Object.values(filaAcc)
    .map((r) => ({
      ...enrich(r),
      queue_name: r.queue_name,
      operadores: r.operadores || 0,
      conv_tab: rateFine(r.sucesso || 0, r.tabuladas || 0),
      conv_loc: rateFine(r.sucesso || 0, r.contact || 0),
    }))
    .sort((a, b) => (b.dialed || 0) - (a.dialed || 0));

  const por_supervisor = Object.values(supAcc)
    .map((r) => ({
      ...r,
      cpc_rate: rateFine(r.cpc, r.tabuladas),
      conv_tab: rateFine(r.sucesso, r.tabuladas),
      conv_loc: r.conv_loc || 0,
      desligue_rate: rateFine(r.desligue, r.tabuladas),
      desligue_agente_rate: rateFine(r.desligue_agente, r.tabuladas),
    }))
    .sort((a, b) => b.tabuladas - a.tabuladas);

  const por_operador = Object.values(opAcc)
    .map((r) => ({
      ...r,
      cpc_rate: rateFine(r.cpc, r.tabuladas),
      conv_tab: rateFine(r.sucesso, r.tabuladas),
      conv_loc: rateFine(r.sucesso, r.contact || 0),
      desligue_rate: rateFine(r.desligue || 0, r.tabuladas),
      desligue_agente_rate: rateFine(r.desligue_agente || 0, r.tabuladas),
    }))
    .sort((a, b) => b.tabuladas - a.tabuladas);

  const desligueSum = por_operador.reduce((s, o) => s + (o.desligue || 0), 0);
  const desligueAgSum = por_operador.reduce((s, o) => s + (o.desligue_agente || 0), 0);
  const tabsOp = por_operador.reduce((s, o) => s + (o.tabuladas || 0), 0) || acc.tabuladas;

  return {
    fonte,
    kpis: {
      ...acc,
      contact_rate: rateFine(acc.contact, acc.dialed),
      cpc_rate: rateFine(acc.cpc, acc.tabuladas),
      efficacy: rateFine(acc.sucesso, acc.dialed),
      tab_rate: rateFine(acc.tabuladas, acc.dialed),
      desligue: desligueSum,
      desligue_agente: desligueAgSum,
      desligue_rate: rateFine(desligueSum, tabsOp),
      desligue_agente_rate: rateFine(desligueAgSum, tabsOp),
    },
    por_campanha: Object.values(porCamp).map(enrich).sort((a, b) => (b.dialed || 0) - (a.dialed || 0)),
    serie_hora: Object.values(serie).map(enrich).sort((a, b) => String(a.hora).localeCompare(String(b.hora))),
    por_mailing: Object.values(mailing).map(enrich).sort((a, b) => (b.dialed || 0) - (a.dialed || 0)),
    tab_hora,
    por_amd,
    por_fila,
    por_supervisor,
    por_operador,
  };
}

function filterCamp(rows: EvaDiscagensSlice[] | undefined, campanha: CampanhaOp) {
  return (rows || []).filter((r) => matchCampanha({ campanha_op: r.campanha_op }, campanha));
}

export function DiscagensPage() {
  const tab = useFiltroEvaStore((s) => s.tab);
  const setTab = useFiltroEvaStore((s) => s.setTab);
  const campanha = useFiltroEvaStore((s) => s.campanha);
  const setCampanha = useFiltroEvaStore((s) => s.setCampanha);
  const dateFrom = useFiltroEvaStore((s) => s.dateFrom);
  const dateTo = useFiltroEvaStore((s) => s.dateTo);
  const setDateFrom = useFiltroEvaStore((s) => s.setDateFrom);
  const setDateTo = useFiltroEvaStore((s) => s.setDateTo);
  const limparFiltro = useFiltroEvaStore((s) => s.limpar);
  const filtroOn = filtroEvaAtivo({ tab, campanha, dateFrom, dateTo, search: '' });
  const metaDia = useMetaCpcStore((s) => s.metaDia);

  const [hora, setHora] = useState('todas');
  const [tabPctMode, setTabPctMode] = useState(true);
  const [opChart, setOpChart] = useState<{
    id_user: number;
    user_name: string;
    queue_name?: string;
    queue_curta?: string;
    serie: EvaDiscagensSerie10Op[];
  } | null>(null);
  const [data, setData] = useState<EvaPayload | null>(null);
  const [hist, setHist] = useState<EvaPayload[]>([]);
  const [histFaltando, setHistFaltando] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const limparTudo = useCallback(() => {
    limparFiltro();
    setHora('todas');
  }, [limparFiltro]);

  const loadLive = useCallback(async (spin = true) => {
    if (spin) setIsLoading(true);
    setRefreshing(true);
    setFetchError(null);
    try {
      setData(await fetchEvaLive());
      setLastUpdate(new Date());
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Falha ao carregar EVA');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadHist = useCallback(async () => {
    setIsLoading(true);
    setRefreshing(true);
    setFetchError(null);
    try {
      const { dias, faltando } = await fetchEvaPeriodo(dateFrom, dateTo);
      setHist(dias);
      setHistFaltando(faltando || []);
      setLastUpdate(new Date());
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Falha no histórico');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (tab === 'live') loadLive(true);
    else loadHist();
  }, [tab, loadLive, loadHist]);

  useEffect(() => {
    if (tab !== 'live') return;
    const id = setInterval(() => loadLive(false), 30_000);
    return () => clearInterval(id);
  }, [tab, loadLive]);

  const discagens = useMemo(() => {
    if (tab === 'live') return resolveDiscagens(data);
    return mergeDiscagens(hist);
  }, [tab, data, hist]);

  const openOpChart = useCallback(
    (op: {
      id_user: number;
      user_name: string;
      queue_name?: string;
      queue_curta?: string;
      serie_10min?: EvaDiscagensSerie10Op[];
    }) => {
      const fromOutlier = (discagens.outliers_conversao || []).find((o) => o.id_user === op.id_user);
      const serie = fromOutlier?.serie_10min || op.serie_10min || [];
      setOpChart({
        id_user: op.id_user,
        user_name: op.user_name,
        queue_name: op.queue_name || fromOutlier?.queue_name,
        queue_curta: op.queue_curta || fromOutlier?.queue_curta || shortQueue(op.queue_name || fromOutlier?.queue_name),
        serie,
      });
    },
    [discagens.outliers_conversao],
  );

  const serieFiltrada = useMemo(() => {
    let rows = filterCamp(discagens.serie_hora, campanha);
    if (hora !== 'todas') rows = rows.filter((r) => horaKey(r.hora || '') === hora);
    return rows;
  }, [discagens.serie_hora, campanha, hora]);

  const kpis = useMemo(() => {
    if (campanha === 'TODAS' && hora === 'todas') return discagens.kpis;

    // Preferência: série hora filtrada; se vazia (ex.: campanha só em por_campanha), fallback.
    if (serieFiltrada.length > 0) {
      const dialed = serieFiltrada.reduce((s, r) => s + (r.dialed || 0), 0);
      const contact = serieFiltrada.reduce((s, r) => s + (r.contact || 0), 0);
      const tabuladas = serieFiltrada.reduce((s, r) => s + (r.tabuladas || 0), 0);
      const cpc = serieFiltrada.reduce((s, r) => s + (r.cpc || 0), 0);
      const sucesso = serieFiltrada.reduce((s, r) => s + (r.sucesso || 0), 0);
      return {
        dialed,
        contact,
        tabuladas,
        cpc,
        sucesso,
        contact_rate: rateFine(contact, dialed),
        cpc_rate: rateFine(cpc, tabuladas),
        efficacy: rateFine(sucesso, dialed),
        tab_rate: rateFine(tabuladas, dialed),
        dialing_time_seg: discagens.kpis.dialing_time_seg || 0,
        desligue: discagens.kpis.desligue,
        desligue_rate: discagens.kpis.desligue_rate,
        desligue_agente: discagens.kpis.desligue_agente,
        desligue_agente_rate: discagens.kpis.desligue_agente_rate,
      };
    }

    if (hora === 'todas' && campanha !== 'TODAS') {
      const rows = filterCamp(discagens.por_campanha, campanha);
      if (rows.length) {
        const dialed = rows.reduce((s, r) => s + (r.dialed || 0), 0);
        const contact = rows.reduce((s, r) => s + (r.contact || 0), 0);
        const tabuladas = rows.reduce((s, r) => s + (r.tabuladas || 0), 0);
        const cpc = rows.reduce((s, r) => s + (r.cpc || 0), 0);
        const sucesso = rows.reduce((s, r) => s + (r.sucesso || 0), 0);
        return {
          dialed,
          contact,
          tabuladas,
          cpc,
          sucesso,
          contact_rate: rateFine(contact, dialed),
          cpc_rate: rateFine(cpc, tabuladas),
          efficacy: rateFine(sucesso, dialed),
          tab_rate: rateFine(tabuladas, dialed),
          dialing_time_seg: discagens.kpis.dialing_time_seg || 0,
        };
      }
    }
    return {
      dialed: 0,
      contact: 0,
      tabuladas: 0,
      cpc: 0,
      sucesso: 0,
      contact_rate: 0,
      cpc_rate: 0,
      efficacy: 0,
      tab_rate: 0,
      dialing_time_seg: discagens.kpis.dialing_time_seg || 0,
    };
  }, [campanha, hora, serieFiltrada, discagens.kpis, discagens.por_campanha]);

  const isPortReceptivo =
    campanha === 'PORTABILIDADE' &&
    (kpis.dialed || 0) > 0 &&
    (kpis.contact_rate || 0) >= 90;

  const chartHora = useMemo(() => {
    const acc: Record<
      string,
      {
        hora: string;
        dialed: number;
        contact: number;
        tabuladas: number;
        cpc: number;
        sucesso: number;
        loc_pct: number;
        conv_pct: number;
        tab_pct: number;
        cpc_pct: number;
        destaque: boolean;
      }
    > = {};
    for (const h of HORAS) {
      acc[h] = {
        hora: `${h}h`,
        dialed: 0,
        contact: 0,
        tabuladas: 0,
        cpc: 0,
        sucesso: 0,
        loc_pct: 0,
        conv_pct: 0,
        tab_pct: 0,
        cpc_pct: 0,
        destaque: hora === h,
      };
    }
    for (const r of filterCamp(discagens.serie_hora, campanha)) {
      const hh = horaKey(r.hora || '');
      if (!acc[hh]) continue;
      acc[hh].dialed += r.dialed || 0;
      acc[hh].contact += r.contact || 0;
      acc[hh].tabuladas += r.tabuladas || 0;
      acc[hh].cpc += r.cpc || 0;
      acc[hh].sucesso += r.sucesso || 0;
    }
    return HORAS.map((h) => {
      const row = acc[h];
      const d = row.dialed;
      const loc = row.contact;
      const suc = row.sucesso;
      const tab = row.tabuladas;
      const cpc = row.cpc;
      // Receptivo: Loc% dialer ≈ 100% (inútil). Espelha Migração com Tab% e CPC%.
      const receptivoHora = campanha === 'PORTABILIDADE' && d > 0 && loc / d >= 0.9;
      return {
        ...row,
        loc_pct: d ? Math.round((1000 * loc) / d) / 10 : 0,
        tab_pct: d ? Math.round((1000 * tab) / d) / 10 : 0,
        cpc_pct: tab ? Math.round((1000 * cpc) / tab) / 10 : 0,
        conv_pct: receptivoHora
          ? tab
            ? Math.round((1000 * suc) / tab) / 10
            : 0
          : loc
            ? Math.round((1000 * suc) / loc) / 10
            : tab
              ? Math.round((1000 * suc) / tab) / 10
              : 0,
      };
    });
  }, [discagens.serie_hora, campanha, hora]);

  const porCampanha = useMemo(() => filterCamp(discagens.por_campanha, campanha), [discagens.por_campanha, campanha]);
  const porMailing = useMemo(() => {
    return filterCamp(discagens.por_mailing, campanha)
      .filter((r) => !isFilaBackofficeOuRobo(r.mailing) && !isFilaBackofficeOuRobo(r.campanha_op))
      .slice()
      .sort((a, b) => (b.efficacy || 0) - (a.efficacy || 0) || (b.dialed || 0) - (a.dialed || 0))
      .slice(0, 25);
  }, [discagens.por_mailing, campanha]);
  const tabHoraRows = useMemo(() => {
    return (discagens.tab_hora || [])
      .filter((r) => matchCampanha({ campanha_op: r.campanha_op }, campanha))
      .slice(0, 40);
  }, [discagens.tab_hora, campanha]);

  const campanhaRows = useMemo(
    () => (porCampanha.length ? porCampanha : [{ campanha_op: campanha, ...kpis }]),
    [porCampanha, campanha, kpis],
  );
  const {
    sorted: campSorted,
    sortKey: campKey,
    sortDir: campDir,
    toggleSort: toggleCamp,
  } = useTableSortFields(campanhaRows as unknown as Record<string, unknown>[], 'dialed', 'desc');

  const mailingRows = useMemo(
    () =>
      porMailing.map((r) => {
        const { nome, codigo } = prettyMailing(r.mailing_nome || r.mailing);
        return { ...r, _nome: nome, _codigo: codigo };
      }),
    [porMailing],
  );
  const {
    sorted: mailSorted,
    sortKey: mailKey,
    sortDir: mailDir,
    toggleSort: toggleMail,
  } = useTableSortFields(mailingRows as Record<string, unknown>[], 'efficacy', 'desc');

  const {
    sorted: amdSorted,
    sortKey: amdKey,
    sortDir: amdDir,
    toggleSort: toggleAmd,
  } = useTableSortFields((discagens.por_amd || []) as unknown as Record<string, unknown>[], 'dialed', 'desc');

  const filaRows = useMemo(
    () =>
      (discagens.por_fila || [])
        .filter((r) => matchCampanha({ campanha_op: r.campanha_op }, campanha))
        .filter((r) => !isFilaBackofficeOuRobo(r.queue_name)),
    [discagens.por_fila, campanha],
  );
  const {
    sorted: filaSorted,
    sortKey: filaKey,
    sortDir: filaDir,
    toggleSort: toggleFila,
  } = useTableSortFields(filaRows as unknown as Record<string, unknown>[], 'dialed', 'desc');

  const {
    sorted: discSupSorted,
    sortKey: discSupKey,
    sortDir: discSupDir,
    toggleSort: toggleDiscSup,
  } = useTableSortFields((discagens.por_supervisor || []) as unknown as Record<string, unknown>[], 'tabuladas', 'desc');

  const opDiscRows = useMemo(
    () =>
      (discagens.por_operador || [])
        .filter((r) => matchCampanha({ campanha_op: r.campanha_op }, campanha))
        .slice(0, 80)
        .map((r) => ({
          ...r,
          _fila: r.queue_curta || shortQueue(r.queue_name),
        })),
    [discagens.por_operador, campanha],
  );
  const {
    sorted: opDiscSorted,
    sortKey: opDiscKey,
    sortDir: opDiscDir,
    toggleSort: toggleOpDisc,
  } = useTableSortFields(opDiscRows as Record<string, unknown>[], 'tabuladas', 'desc');

  const {
    sorted: tabHoraSorted,
    sortKey: thKey,
    sortDir: thDir,
    toggleSort: toggleTh,
  } = useTableSortFields(tabHoraRows as unknown as Record<string, unknown>[], 'total', 'desc');

  const gaps = useMemo(() => {
    const alerts: { nivel: 'alto' | 'medio'; msg: string }[] = [];
    const pisoLoc = limLoc(campanha);
    const pisoEff = limEfficacy(campanha);
    if (kpis.dialed >= 500 && kpis.contact_rate < pisoLoc) {
      alerts.push({
        nivel: 'alto',
        msg: `Taxa de localização ${kpis.contact_rate}% abaixo do piso ${pisoLoc}% (Alo ÷ tentativas) — revisar mailing/lista e preditivo.`,
      });
    }
    if (kpis.tabuladas >= 20 && kpis.cpc_rate < metaDia) {
      alerts.push({ nivel: 'alto', msg: `CPC ${kpis.cpc_rate}% abaixo da meta ${metaDia}% no recorte.` });
    }
    if (kpis.dialed >= 500 && kpis.efficacy < pisoEff) {
      alerts.push({ nivel: 'medio', msg: `Eficácia ${kpis.efficacy}% (sucesso/tentativas) crítica — gap de conversão no funil.` });
    }
    if (kpis.dialed >= 1000 && (kpis.tab_rate || 0) < 0.3) {
      alerts.push({
        nivel: 'medio',
        msg: `Só ${kpis.tab_rate}% das tentativas viraram tabulação — possível AMD/queda/ocupação.`,
      });
    }
    return alerts;
  }, [kpis, metaDia, campanha]);

  const desligueFromTabs = useMemo(() => {
    const fold = (s: string) =>
      (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    let n = 0;
    let tot = 0;
    for (const t of discagens.tab_hora || []) {
      if (!matchCampanha({ campanha_op: t.campanha_op }, campanha)) continue;
      const vol =
        hora === 'todas'
          ? t.total || 0
          : t.horas?.[hora] || 0;
      tot += vol;
      const nome = fold(t.nome || '');
      if (nome.includes('desligou') || nome.includes('queda de ligacao')) n += vol;
    }
    return { n, tot, rate: tot ? Math.round((1000 * n) / tot) / 10 : 0 };
  }, [discagens.tab_hora, campanha, hora]);

  const temDialer = (kpis.dialed || 0) > 0;
  const fonteEstimada = (discagens.fonte || '').includes('estimado') && !temDialer;
  const fonteMista = (discagens.fonte || '').includes('+estimado') && temDialer;
  const semDados = !isLoading && (kpis.dialed || 0) === 0 && (kpis.tabuladas || 0) === 0;

  /** Pct vs discado com 2 casas quando < 1% (preditivo). */
  const pctOf = (n: number, d: number) => rateFine(n, d);
  const stepPct = (n: number, prev: number) => (prev ? pctOf(n, prev) : 0);
  /** Largura da barra = conversão da etapa anterior (legível no preditivo); mínimo se valor > 0. */
  const barW = (step: number, valor: number) => {
    if (valor <= 0) return 0;
    return Math.max(3, Math.min(100, step));
  };

  // Visão dialer: Discadas → Alo → Tabuladas → CPC → Sucesso
  // Portabilidade receptivo: Alo ≈ Discadas (inútil) — funil igual Migração: Discadas → Tabs → CPC → Sucesso
  // Estimado (sem dial_details): só Tabuladas → CPC → Sucesso (não inventar discadas=alo)
  const funnelBase = temDialer
    ? isPortReceptivo
      ? [
          {
            etapa: 'Discadas',
            valor: kpis.dialed,
            pctDiscado: 100,
            step: 100,
            hint: 'entrantes receptivo (dial_details)',
          },
          {
            etapa: 'Tabuladas',
            valor: kpis.tabuladas,
            pctDiscado: pctOf(kpis.tabuladas, kpis.dialed),
            step: stepPct(kpis.tabuladas, kpis.dialed),
            hint: 'tabulação humana (pula Alo ≈ 100%)',
          },
        ]
      : [
          {
            etapa: 'Discadas',
            valor: kpis.dialed,
            pctDiscado: 100,
            step: 100,
            hint: 'tentativas do discador',
          },
          {
            etapa: 'Localizou',
            valor: kpis.contact,
            pctDiscado: pctOf(kpis.contact, kpis.dialed),
            step: stepPct(kpis.contact, kpis.dialed),
            hint: 'Alo do discador',
          },
          {
            etapa: 'Tabuladas',
            valor: kpis.tabuladas,
            pctDiscado: pctOf(kpis.tabuladas, kpis.dialed),
            step: stepPct(kpis.tabuladas, kpis.contact || kpis.dialed),
            hint: 'com tabulação humana',
          },
        ]
    : [
        {
          etapa: 'Tabuladas',
          valor: kpis.tabuladas,
          pctDiscado: 100,
          step: 100,
          hint: 'universo disponível (sem discadas/Alo do dialer)',
        },
      ];

  const funnel = [
    ...funnelBase,
    {
      etapa: 'CPC',
      valor: kpis.cpc,
      pctDiscado: temDialer ? pctOf(kpis.cpc, kpis.dialed) : pctOf(kpis.cpc, kpis.tabuladas),
      step: stepPct(kpis.cpc, kpis.tabuladas || kpis.contact || kpis.dialed || 1),
      hint: 'pessoa certa / tabuladas',
    },
    {
      etapa: 'Sucesso',
      valor: kpis.sucesso,
      pctDiscado: temDialer ? pctOf(kpis.sucesso, kpis.dialed) : pctOf(kpis.sucesso, kpis.tabuladas),
      step: stepPct(kpis.sucesso, kpis.cpc || kpis.tabuladas || kpis.dialed || 1),
      hint: 'sucesso / CPC',
    },
  ];

  const fonteLabel =
    discagens.fonte === 'mailing_dial_details'
      ? 'Fonte: vw_mailing_dial_details · localização = atendeu/Alo'
      : discagens.fonte === 'mailing_logger' || discagens.fonte === 'mailing_logger_fallback'
        ? 'Fonte: mailing_logger (fallback)'
        : discagens.fonte === 'estimado_tabuladas'
          ? 'Fonte: estimada (aguarde sync dial_details)'
          : 'Fonte: indisponível';

  return (
    <AdminLayout title="Discagens" subtitle="Dialer por produto · localização · eficácia · mailing · gaps">
      <div className="space-y-4 mb-6" aria-busy={isLoading}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-gray-100 p-1" role="group" aria-label="Modo de dados">
            {(['live', 'hist'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                {t === 'live' ? 'Realtime' : 'Histórico'}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl bg-gray-100 p-1" role="group" aria-label="Campanha">
            {([
              { id: 'TODAS' as CampanhaOp, label: 'Todas' },
              { id: 'PORTABILIDADE' as CampanhaOp, label: 'Portabilidade' },
              { id: 'MIGRACAO' as CampanhaOp, label: 'Migração' },
            ]).map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={campanha === c.id}
                onClick={() => setCampanha(c.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${campanha === c.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {tab === 'hist' && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Calendar size={14} />
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field text-xs py-1" aria-label="Data início" />
              <span>→</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field text-xs py-1" aria-label="Data fim" />
            </div>
          )}
          <button
            type="button"
            onClick={() => (tab === 'live' ? loadLive(false) : loadHist())}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
            aria-label="Atualizar discagens"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
          {(filtroOn || hora !== 'todas') && (
            <button type="button" onClick={limparTudo} className="text-xs text-gray-500 underline">
              Limpar filtros
            </button>
          )}
          <span className="text-[11px] text-gray-400 ml-auto">{fonteLabel} · {lastUpdate.toLocaleTimeString('pt-BR')}</span>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtro por hora">
          <button
            type="button"
            aria-pressed={hora === 'todas'}
            onClick={() => setHora('todas')}
            className={`px-2.5 py-1 text-xs rounded-lg border ${hora === 'todas' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            Dia
          </button>
          {HORAS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={hora === h}
              aria-label={`Hora ${h}`}
              onClick={() => setHora(h)}
              className={`px-2.5 py-1 text-xs rounded-lg border ${hora === h ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {fonteEstimada && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" role="status">
          Discadas e Alo indisponíveis (EVA <code className="text-xs">dial_details</code> vazio). Exibindo só o funil de tabuladas — sem inventar discadas = alo.
        </div>
      )}
      {fonteMista && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900" role="status">
          Período misto: alguns dias com funil dialer e outros só com tabuladas. Loc% usa apenas horas/dias com discadas reais.
        </div>
      )}
      {tab === 'hist' && hist.length > 0 && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700" role="status">
          Histórico: <strong>{hist.length}</strong> dia(s) com dados
          {histFaltando.length > 0 ? ` · ${histFaltando.length} sem arquivo` : ''}
          {' · '}
          {dateFrom} → {dateTo}
          {!temDialer ? ' · funil de tabuladas (sem discadas/Alo no snapshot)' : ''}
        </div>
      )}
      {tab === 'hist' && histFaltando.length > 0 && hist.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" role="status">
          Nenhum dia com volume no período {dateFrom} → {dateTo}. Amplie as datas (ex.: incluir 18–19/08) —
          snapshots vazios/stub não entram no consolidado.
        </div>
      )}
      {tab === 'hist' && histFaltando.length > 0 && hist.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800" role="status">
          Histórico incompleto: {histFaltando.length} dia(s) sem arquivo ({histFaltando.slice(0, 5).join(', ')}
          {histFaltando.length > 5 ? '…' : ''}). Totais podem estar subestimados.
        </div>
      )}

      {fetchError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2" role="alert">
          <AlertTriangle size={16} /> {fetchError}
        </div>
      )}

      <StaleDataBanner
        stale={tab === 'live' && isLiveStale(data)}
        ageMs={liveAgeMs(data)}
        updatedAt={data?.updated_at}
      />

      {semDados ? (
        <div className="card p-8 text-center text-sm text-gray-500 mb-6" role="status">
          Sem discagens no recorte. Verifique o sync EVA ou amplie o período/campanha.
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-3 mb-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="card p-4 h-24 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          {gaps.length > 0 && (
            <div className="mb-4 space-y-2">
              {gaps.map((g, i) => (
                <div
                  key={i}
                  className={`rounded-lg border px-4 py-2.5 text-sm flex items-start gap-2 ${
                    g.nivel === 'alto' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  <TrendingDown size={16} className="mt-0.5 shrink-0" />
                  <span>{g.msg}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-7 gap-3 mb-6">
            <Kpi
              icon={PhoneCall}
              label={hora === 'todas' ? 'Discadas' : `Discadas ${hora}h`}
              value={temDialer ? kpis.dialed : '—'}
              sub={temDialer ? undefined : 'aguardando dial_details'}
            />
            <Kpi
              icon={Target}
              label={hora === 'todas' ? (isPortReceptivo ? 'Atendidas (Alo)' : 'Alo (localizadas)') : `Alo ${hora}h`}
              value={temDialer ? kpis.contact : '—'}
              sub={
                !temDialer
                  ? 'Alo ≠ tabuladas'
                  : isPortReceptivo
                    ? `${kpis.contact_rate}% · receptivo (Loc dialer saturado)`
                    : `${kpis.contact_rate}% do discado`
              }
              warn={temDialer && !isPortReceptivo && kpis.dialed >= 500 && kpis.contact_rate < limLoc(campanha)}
            />
            <Kpi
              icon={BarChart3}
              label={hora === 'todas' ? 'Tabuladas' : `Tabuladas ${hora}h`}
              value={kpis.tabuladas}
              sub={
                temDialer
                  ? isPortReceptivo
                    ? `${rateFine(kpis.tabuladas, kpis.dialed)}% das discadas · funil tipo Migração`
                    : `${kpis.tab_rate || 0}% do discado`
                  : 'universo atual'
              }
            />
            <Kpi icon={Gauge} label="CPC%" value={`${kpis.cpc_rate}%`} sub={`${kpis.cpc} CPC · meta ${metaDia}% · tabulação`} warn={kpis.cpc_rate < metaDia && kpis.tabuladas >= 8} />
            <Kpi
              icon={TrendingDown}
              label="Drop/Desligue%"
              value={`${kpis.desligue_rate ?? desligueFromTabs.rate}%`}
              sub={`${(kpis.desligue ?? desligueFromTabs.n).toLocaleString('pt-BR')} tabs · DESLIGOU+QUEDA`}
              warn={(kpis.desligue_rate ?? desligueFromTabs.rate) >= 25 && kpis.tabuladas >= 20}
            />
            <Kpi icon={Zap} label="Sucesso" value={kpis.sucesso} />
            <Kpi
              icon={Target}
              label="Eficácia"
              value={temDialer ? `${kpis.efficacy}%` : '—'}
              sub={temDialer ? 'sucesso / discado' : 'requer discadas'}
              warn={temDialer && kpis.efficacy < limEfficacy(campanha) && kpis.dialed >= 500}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            <div className="card p-5 shadow-sm xl:col-span-1">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Funil dialer</h3>
              <p className="text-[11px] text-gray-400 mb-3">
                Barra = conversão da etapa anterior · % à direita = vs discadas
              </p>
              <div className="space-y-2.5">
                {funnel.map((f) => (
                  <div key={f.etapa}>
                    <div className="flex justify-between text-xs text-gray-500 mb-0.5 gap-2">
                      <span className="shrink-0">
                        {f.etapa}
                        <span className="text-gray-400 font-normal"> · {f.hint}</span>
                      </span>
                      <span className="tabular-nums font-semibold text-gray-800 text-right">
                        {f.valor.toLocaleString('pt-BR')}
                        <span className="text-gray-500 font-medium"> · {f.pctDiscado}%</span>
                        {f.etapa !== 'Discadas' && (
                          <span className="block text-[10px] font-normal text-indigo-600">
                            {f.step}% da etapa ant.
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500/85 rounded-full transition-[width]"
                        style={{ width: `${barW(f.step, f.valor)}%` }}
                        title={`${f.step}% da etapa anterior`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-3">
                Tempo discando (jornada): {fmtHms(kpis.dialing_time_seg || 0)}
              </p>
            </div>

            <div className="card p-5 shadow-sm xl:col-span-2">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Hora a hora · volume da hora</h3>
              <p className="text-[11px] text-gray-400 mb-3">
                Cada barra = volume <strong className="font-semibold text-gray-600">naquela hora</strong> (não acumulado).
                {temDialer
                  ? isPortReceptivo
                    ? ' Portabilidade receptivo: barras Discadas · Tabuladas · CPC (sem Alo duplicado). Linhas = % Tab e % Conv — igual lógica de queda da Migração.'
                    : ' Barras = Discadas · Alo (localizadas) · Tabuladas. Linhas = % Loc e % Conv.'
                  : ' Sem dial_details: só tabuladas.'}
              </p>
              {isPortReceptivo && (
                <p className="text-[11px] text-sky-800 mb-2 rounded border border-sky-200 bg-sky-50 px-2 py-1">
                  Receptivo EVA: Alo ≈ Discadas (1.144/1.150). Funil alinhado à Migração: Discadas → Tabuladas → CPC (Loc% preditivo não se aplica).
                </p>
              )}
              {hora !== 'todas' && (
                <p className="text-[11px] text-amber-700 mb-2">KPIs acima filtrados em {hora}h · gráfico mostra o dia completo.</p>
              )}
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartHora}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      domain={[0, 'auto']}
                      tickFormatter={(v) => `${v}%`}
                      unit="%"
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as {
                          dialed: number;
                          contact: number;
                          tabuladas: number;
                          cpc: number;
                          sucesso: number;
                          loc_pct: number;
                          conv_pct: number;
                          tab_pct: number;
                          cpc_pct: number;
                        };
                        return (
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                            <div className="font-semibold text-gray-800 mb-1">{label}</div>
                            <div className="tabular-nums text-gray-700 space-y-0.5">
                              {temDialer ? (
                                <>
                                  <div>Discadas: <strong>{(row.dialed || 0).toLocaleString('pt-BR')}</strong></div>
                                  {!isPortReceptivo && (
                                    <div>Alo / localizadas: <strong>{(row.contact || 0).toLocaleString('pt-BR')}</strong></div>
                                  )}
                                  <div>Tabuladas: <strong>{(row.tabuladas || 0).toLocaleString('pt-BR')}</strong></div>
                                  {isPortReceptivo && (
                                    <div>CPC: <strong>{(row.cpc || 0).toLocaleString('pt-BR')}</strong></div>
                                  )}
                                </>
                              ) : (
                                <div>Tabuladas: <strong>{(row.tabuladas || 0).toLocaleString('pt-BR')}</strong></div>
                              )}
                              <div>Sucesso: <strong>{(row.sucesso || 0).toLocaleString('pt-BR')}</strong></div>
                              {temDialer && !isPortReceptivo && (
                                <div className="pt-1 border-t border-gray-100 mt-1 text-indigo-700">
                                  % Localização: <strong>{row.loc_pct}%</strong>
                                </div>
                              )}
                              {temDialer && isPortReceptivo && (
                                <div className="pt-1 border-t border-gray-100 mt-1 text-indigo-700">
                                  % Tabulação: <strong>{row.tab_pct}%</strong>
                                  <span className="text-gray-500"> (tabs ÷ discadas)</span>
                                </div>
                              )}
                              <div className="text-teal-700">
                                % Conversão: <strong>{row.conv_pct}%</strong>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    {temDialer ? (
                      <>
                        <Bar yAxisId="left" dataKey="dialed" name="Discadas" fill="#c7d2fe" radius={[2, 2, 0, 0]} />
                        {!isPortReceptivo && (
                          <Bar yAxisId="left" dataKey="contact" name="Alo (localizadas)" fill="#a5b4fc" radius={[2, 2, 0, 0]} />
                        )}
                        <Bar yAxisId="left" dataKey="tabuladas" name="Tabuladas" fill="#818cf8" radius={[2, 2, 0, 0]} />
                        {isPortReceptivo && (
                          <Bar yAxisId="left" dataKey="cpc" name="CPC" fill="#6366f1" radius={[2, 2, 0, 0]} />
                        )}
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey={isPortReceptivo ? 'tab_pct' : 'loc_pct'}
                          name={isPortReceptivo ? '% Tabulação' : '% Localização'}
                          stroke="#4f46e5"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </>
                    ) : (
                      <Bar yAxisId="left" dataKey="tabuladas" name="Tabuladas (hora)" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
                    )}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="conv_pct"
                      name="% Conversão"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                {temDialer
                  ? isPortReceptivo
                    ? 'Receptivo: Alo ≈ Discadas no EVA — funil exibe Discadas → Tabs → CPC (mesma lógica de queda da Migração).'
                    : 'Em preditivo (Migração) Discadas ≫ Alo. Em receptivo puro Loc% dialer ≈ 100%.'
                  : 'Eixo esquerdo: tabuladas · eixo direito: % conversão'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <div className="card shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Por produto</h3>
                <p className="text-xs text-gray-400">Portabilidade · Migração · Outros</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <SortTh label="Campanha" col="campanha_op" sortKey={campKey} sortDir={campDir} onSort={toggleCamp} align="left" className="px-4" />
                      <SortTh label="Disc." col="dialed" sortKey={campKey} sortDir={campDir} onSort={toggleCamp} align="right" />
                      <SortTh label="Loc.%" col="contact_rate" sortKey={campKey} sortDir={campDir} onSort={toggleCamp} align="right" />
                      <SortTh label="CPC%" col="cpc_rate" sortKey={campKey} sortDir={campDir} onSort={toggleCamp} align="right" />
                      <SortTh label="Efic.%" col="efficacy" sortKey={campKey} sortDir={campDir} onSort={toggleCamp} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {(campSorted as typeof campanhaRows).map((r) => (
                      <tr key={r.campanha_op} className="border-t border-gray-50">
                        <td className="px-4 py-2 font-medium">{r.campanha_op}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{(r.dialed || 0) > 0 ? r.dialed : '—'}</td>
                        <td
                          className={`px-3 py-2 text-right font-bold ${
                            (r.dialed || 0) >= 500 && (r.contact_rate || 0) < limLoc(r.campanha_op)
                              ? 'text-red-600'
                              : 'text-teal-700'
                          }`}
                        >
                          {(r.dialed || 0) > 0 ? `${r.contact_rate}%` : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${(r.cpc_rate || 0) < metaDia ? 'text-red-600' : 'text-teal-700'}`}>{r.cpc_rate}%</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.efficacy}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Por mailing / campanha EVA</h3>
                <p className="text-xs text-gray-400">
                  Nome normalizado · eficácia · Discadas Portabilidade incluem filas ROBO (preditivo); tabs só humanas
                </p>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <SortTh label="Mailing" col="_nome" sortKey={mailKey} sortDir={mailDir} onSort={toggleMail} align="left" className="px-4" />
                      <SortTh label="Disc." col="dialed" sortKey={mailKey} sortDir={mailDir} onSort={toggleMail} align="right" />
                      <SortTh label="Loc.%" col="contact_rate" sortKey={mailKey} sortDir={mailDir} onSort={toggleMail} align="right" />
                      <SortTh label="Suc." col="sucesso" sortKey={mailKey} sortDir={mailDir} onSort={toggleMail} align="right" />
                      <SortTh label="Efic.%" col="efficacy" sortKey={mailKey} sortDir={mailDir} onSort={toggleMail} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {(mailSorted as typeof mailingRows).map((r) => {
                      const nome = r._nome as string;
                      const codigo = r._codigo as string;
                      return (
                        <tr key={`${r.mailing}-${r.campanha_op}`} className="border-t border-gray-50">
                          <td className="px-4 py-2 max-w-[240px]" title={codigo}>
                            <div className="font-medium text-gray-900 truncate">{nome}</div>
                            {nome !== codigo && (
                              <div className="text-[10px] text-gray-400 truncate">…{codigo.slice(-14)}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.dialed}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.contact_rate}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.sucesso}</td>
                          <td className={`px-3 py-2 text-right font-bold ${(r.efficacy || 0) < limEfficacy(r.campanha_op) ? 'text-red-600' : 'text-teal-700'}`}>{r.efficacy}%</td>
                        </tr>
                      );
                    })}
                    {porMailing.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                          Sem breakdown de mailing neste payload. Após sync com bloco discagens, a lista aparece aqui.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* AMD / classificação do discador — explica o gap Discadas → Localizou */}
          <div className="card shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-800">AMD / classificação discador</h3>
              <p className="text-xs text-gray-400">
                Top motivos de não-localização (Caixa postal, Ocupado, Alo…) · % do total discado
              </p>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                  <tr>
                    <SortTh label="Classificação" col="nome" sortKey={amdKey} sortDir={amdDir} onSort={toggleAmd} align="left" className="px-4" />
                    <SortTh label="Tentativas" col="dialed" sortKey={amdKey} sortDir={amdDir} onSort={toggleAmd} align="right" />
                    <SortTh label="% discado" col="pct_dialed" sortKey={amdKey} sortDir={amdDir} onSort={toggleAmd} align="right" />
                    <SortTh label="Localizou" col="contact" sortKey={amdKey} sortDir={amdDir} onSort={toggleAmd} align="right" />
                    <SortTh label="Loc.%" col="contact_rate" sortKey={amdKey} sortDir={amdDir} onSort={toggleAmd} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {(amdSorted as NonNullable<typeof discagens.por_amd>).map((r) => (
                    <tr key={r.nome} className="border-t border-gray-50">
                      <td className="px-4 py-2">{r.nome}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{(r.dialed || 0).toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.pct_dialed ?? 0}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.contact ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-teal-700">{r.contact_rate ?? 0}%</td>
                    </tr>
                  ))}
                  {!(discagens.por_amd || []).length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                        Breakdown AMD ainda não publicado neste payload (aguarde sync).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Insights + alertas de queda + outliers */}
          {((discagens.insights_discagens || []).length > 0 ||
            (discagens.alertas_queda || []).length > 0 ||
            (discagens.outliers_conversao || []).length > 0) && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
              <div className="card p-4 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 mb-2">Insights</h3>
                <p className="text-[11px] text-gray-400 mb-3">
                  Peer recomendado: <span className="font-semibold text-indigo-700">{discagens.metrica_peer || 'cpc_rate'}</span>
                  {discagens.metrica_peer_nota ? ` · ${discagens.metrica_peer_nota}` : ''}
                </p>
                <ul className="space-y-2">
                  {(discagens.insights_discagens || []).map((ins, i) => {
                    let detalhe = ins.detalhe || '';
                    if (ins.tipo === 'queda') {
                      const m = detalhe.match(/^(\d{8,20}[_\s-]+.+?)(:\s*)(.+)$/);
                      if (m) {
                        detalhe = `${prettyMailing(m[1]).nome}${m[2]}${m[3]}`;
                      } else if (ins.mailing_nome) {
                        detalhe = detalhe.replace(/^\d{8,20}[_\s-]+/, '');
                      }
                    }
                    const filaIns = ins.queue_curta || shortQueue(ins.queue_name);
                    return (
                      <li
                        key={i}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          ins.severidade === 'alto'
                            ? 'border-red-200 bg-red-50 text-red-800'
                            : ins.severidade === 'medio'
                              ? 'border-amber-200 bg-amber-50 text-amber-900'
                              : 'border-gray-200 bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className="font-semibold">{ins.titulo}</div>
                        <div className="mt-0.5 opacity-90">{detalhe}</div>
                        {filaIns && filaIns !== '—' && (ins.tipo === 'outlier' || ins.tipo === 'queda') && (
                          <div className="mt-1.5">
                            <span className="rounded border border-current/20 bg-white/60 px-1.5 py-0.5 text-[10px] font-medium">
                              Fila: {filaIns}
                            </span>
                            {ins.tipo === 'outlier' && ins.id_user != null && (
                              <button
                                type="button"
                                className="ml-2 text-[10px] font-semibold underline underline-offset-2"
                                onClick={() =>
                                  openOpChart({
                                    id_user: ins.id_user!,
                                    user_name: ins.user_name || 'Operador',
                                    queue_name: ins.queue_name,
                                    queue_curta: filaIns,
                                  })
                                }
                              >
                                Ver variação 10min
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {!(discagens.insights_discagens || []).length && (
                    <li className="text-xs text-gray-400">Sem insights neste ciclo.</li>
                  )}
                </ul>
              </div>

              <div className="card shadow-sm overflow-hidden xl:col-span-1">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-800">Queda de mailing (PIR)</h3>
                  <p className="text-[11px] text-gray-400">Nome legível · vs mediana do dia / slot anterior</p>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                  {(discagens.alertas_queda || []).slice(0, 12).map((a, i) => {
                    const { nome, codigo } = prettyMailing(a.mailing || a.mailing_codigo || a.mailing_nome);
                    const fila = a.queue_curta || shortQueue(a.queue_name);
                    const camp = a.campanha_label || shortCamp(a.campanha_op);
                    const horaSlot = a.slot_hora || (a.slot || '').slice(11, 16);
                    const delta = a.delta_vs_dia_pct ?? a.delta_vs_ant_pct;
                    return (
                      <div
                        key={i}
                        className={`px-4 py-3 text-xs ${
                          a.nivel === 'alto' ? 'bg-red-50/90' : 'bg-amber-50/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 truncate" title={codigo}>
                              {nome}
                            </div>
                            {nome !== codigo && (
                              <div className="text-[10px] text-gray-500 truncate mt-0.5" title={codigo}>
                                cód. …{codigo.slice(-12)}
                              </div>
                            )}
                          </div>
                          <span
                            className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                              a.nivel === 'alto' ? 'bg-red-600 text-white' : 'bg-amber-600 text-white'
                            }`}
                          >
                            {delta != null ? `${delta}%` : a.nivel}
                          </span>
                        </div>
                        <div className={`mt-1.5 font-medium ${a.nivel === 'alto' ? 'text-red-800' : 'text-amber-900'}`}>
                          {a.msg_curta || a.msg.replace(/^[^:]+:\s*/, '')}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                          <span className="rounded bg-white/80 border border-gray-200 px-1.5 py-0.5 text-gray-700">{fila}</span>
                          <span className="rounded bg-white/80 border border-gray-200 px-1.5 py-0.5 text-gray-700">{camp}</span>
                          {horaSlot && (
                            <span className="rounded bg-white/80 border border-gray-200 px-1.5 py-0.5 text-gray-700">{horaSlot}</span>
                          )}
                          {a.dialed != null && (
                            <span className="rounded bg-white/80 border border-gray-200 px-1.5 py-0.5 tabular-nums text-gray-700">
                              {a.dialed.toLocaleString('pt-BR')}/10min
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!(discagens.alertas_queda || []).length && (
                    <div className="px-4 py-8 text-center text-xs text-gray-400">Nenhuma queda relevante no recorte.</div>
                  )}
                </div>
              </div>

              <div className="card shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-800">Fora do padrão da fila</h3>
                  <p className="text-[11px] text-gray-400">Comportamento vs peers · só quem tabulou · apuração</p>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                  {(discagens.outliers_conversao || []).slice(0, 15).map((o) => {
                    const beh = comportamentoFallback(o);
                    const label = o.comportamento_label || beh.label;
                    const hint = o.comportamento_hint || beh.hint;
                    const acao = o.acao || beh.acao;
                    const fila = o.queue_curta || shortQueue(o.queue_name);
                    const gapCpc = o.gap_cpc_pp ?? Math.round((o.cpc_rate - o.fila_cpc_mediana) * 10) / 10;
                    const gapConv = o.gap_conv_pp ?? Math.round((o.conv_tab - o.fila_conv_mediana) * 10) / 10;
                    const aberto = opChart?.id_user === o.id_user;
                    return (
                      <div
                        key={`${o.id_user}-${o.queue_name}`}
                        className={`px-4 py-3 text-xs ${
                          o.nivel === 'alto' ? 'bg-red-50/90' : 'bg-amber-50/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openOpChart(o)}
                              className="font-bold text-gray-900 truncate text-left hover:text-indigo-700 hover:underline underline-offset-2"
                              title="Clique para ver variação a cada 10 min"
                            >
                              {o.user_name}
                            </button>
                            <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={o.queue_name}>
                              {o.supervisor_name}
                            </div>
                            <div className="mt-1">
                              <span className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-800">
                                Fila: {fila}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              o.comportamento === 'gap_duplo' || o.nivel === 'alto'
                                ? 'bg-red-700 text-white'
                                : o.comportamento === 'zero_conversao'
                                  ? 'bg-violet-700 text-white'
                                  : 'bg-amber-700 text-white'
                            }`}
                          >
                            {label}
                          </span>
                        </div>
                        {hint && <div className="mt-1 text-gray-700">{hint}</div>}
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-white/90 border border-gray-200 px-2 py-1.5">
                            <div className="text-[10px] text-gray-500">CPC vs fila</div>
                            <div className="font-bold tabular-nums text-gray-900">
                              {o.cpc_rate}%{' '}
                              <span className={`text-[10px] font-semibold ${gapCpc < 0 ? 'text-red-600' : 'text-teal-700'}`}>
                                ({gapCpc > 0 ? '+' : ''}{gapCpc}pp)
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-400">mediana {o.fila_cpc_mediana}%</div>
                          </div>
                          <div className="rounded-lg bg-white/90 border border-gray-200 px-2 py-1.5">
                            <div className="text-[10px] text-gray-500">Conv vs fila</div>
                            <div className="font-bold tabular-nums text-gray-900">
                              {o.conv_tab}%{' '}
                              <span className={`text-[10px] font-semibold ${gapConv < 0 ? 'text-red-600' : 'text-teal-700'}`}>
                                ({gapConv > 0 ? '+' : ''}{gapConv}pp)
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-400">mediana {o.fila_conv_mediana}%</div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-600">
                          <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5">{o.tabuladas} tabs</span>
                          {acao && (
                            <span className="rounded border border-indigo-200 bg-indigo-50 text-indigo-800 px-1.5 py-0.5">
                              → {acao}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => (aberto ? setOpChart(null) : openOpChart(o))}
                            className="rounded border border-teal-200 bg-teal-50 text-teal-800 px-1.5 py-0.5 font-semibold"
                          >
                            {aberto ? 'Fechar gráfico' : 'Variação 10min'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!(discagens.outliers_conversao || []).length && (
                    <div className="px-4 py-8 text-center text-xs text-gray-400">
                      Sem outliers (mín. 4 ops com ≥8 tabs na mesma fila).
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {opChart && (
            <div className="card p-5 shadow-sm mb-6 border border-indigo-100">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-gray-800 truncate">
                    Variação 10 min · {opChart.user_name}
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Fila: <span className="font-semibold text-gray-700">{opChart.queue_curta || shortQueue(opChart.queue_name)}</span>
                    {' · '}tabs / CPC% / Conv% por slot
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpChart(null)}
                  className="shrink-0 text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100"
                >
                  Fechar
                </button>
              </div>
              {opChart.serie.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-sm text-gray-400">
                  Sem série 10 min neste payload (aguarde o próximo sync com ofensores).
                </div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={opChart.serie.map((s) => ({
                        slot: s.slot_hora || String(s.slot).slice(11, 16) || s.slot,
                        tabuladas: s.tabuladas,
                        cpc_rate: s.cpc_rate,
                        conv_tab: s.conv_tab,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="slot" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="tabs" tick={{ fontSize: 10 }} width={36} />
                      <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10 }} width={36} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ fontSize: 12 }}
                        formatter={(value: number, name: string) => {
                          if (name === 'tabuladas') return [value, 'Tabs'];
                          if (name === 'cpc_rate') return [`${value}%`, 'CPC%'];
                          if (name === 'conv_tab') return [`${value}%`, 'Conv%'];
                          return [value, name];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar yAxisId="tabs" dataKey="tabuladas" name="Tabs" fill="#818cf8" radius={[3, 3, 0, 0]} />
                      <Line yAxisId="pct" type="monotone" dataKey="cpc_rate" name="CPC%" stroke="#0d9488" strokeWidth={2} dot={false} />
                      <Line yAxisId="pct" type="monotone" dataKey="conv_tab" name="Conv%" stroke="#c2410c" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Série 10 min */}
          {(discagens.serie_10min || []).length > 0 && (
            <div className="card p-5 shadow-sm mb-6">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Variação a cada 10 minutos</h3>
              <p className="text-[11px] text-gray-400 mb-3">
                Volume do slot (não acumulado) · linhas = % localização e % conversão no slot
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={(() => {
                      const acc: Record<
                        string,
                        { slot: string; dialed: number; contact: number; sucesso: number; loc_pct: number; conv_pct: number }
                      > = {};
                      for (const r of discagens.serie_10min || []) {
                        if (!matchCampanha({ campanha_op: r.campanha_op }, campanha)) continue;
                        const slot = String(r.slot || '').slice(11, 16) || String(r.slot || '');
                        if (!acc[slot]) acc[slot] = { slot, dialed: 0, contact: 0, sucesso: 0, loc_pct: 0, conv_pct: 0 };
                        acc[slot].dialed += r.dialed || 0;
                        acc[slot].contact += r.contact || 0;
                        acc[slot].sucesso += r.sucesso || 0;
                      }
                      return Object.values(acc)
                        .map((row) => ({
                          ...row,
                          loc_pct: row.dialed ? Math.round((1000 * row.contact) / row.dialed) / 10 : 0,
                          conv_pct: row.contact ? Math.round((1000 * row.sucesso) / row.contact) / 10 : 0,
                        }))
                        .sort((a, b) => a.slot.localeCompare(b.slot));
                    })()}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="slot" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                    />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as {
                          dialed: number;
                          contact: number;
                          sucesso: number;
                          loc_pct: number;
                          conv_pct: number;
                        };
                        return (
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                            <div className="font-semibold mb-1">{label}</div>
                            <div>Discadas: <strong>{row.dialed.toLocaleString('pt-BR')}</strong></div>
                            <div>Alo: <strong>{row.contact.toLocaleString('pt-BR')}</strong></div>
                            <div>Sucesso: <strong>{row.sucesso.toLocaleString('pt-BR')}</strong></div>
                            <div className="text-indigo-700">Loc%: <strong>{row.loc_pct}%</strong></div>
                            <div className="text-teal-700">Conv%: <strong>{row.conv_pct}%</strong></div>
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="dialed" name="Discadas/10min" fill="#c7d2fe" radius={[2, 2, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="loc_pct" name="% Localização" stroke="#4f46e5" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="conv_pct" name="% Conversão" stroke="#059669" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <div className="card shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Saúde por fila</h3>
                <p className="text-xs text-gray-400">Dialed · loc% · CPC% · conv (sucesso/tabs) · ops que tabularam</p>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <SortTh label="Fila" col="queue_name" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="left" className="px-4" />
                      <SortTh label="Disc." col="dialed" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="right" className="px-2" />
                      <SortTh label="Loc.%" col="contact_rate" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="right" className="px-2" />
                      <SortTh label="CPC%" col="cpc_rate" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="right" className="px-2" />
                      <SortTh label="Conv%" col="conv_tab" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="right" className="px-2" />
                      <SortTh label="Ops" col="operadores" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="right" className="px-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(filaSorted as typeof filaRows).map((r) => (
                        <tr key={`${r.queue_name}-${r.campanha_op}`} className="border-t border-gray-50">
                          <td className="px-4 py-2 truncate max-w-[200px]" title={r.queue_name}>{r.queue_name}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{(r.dialed || 0).toLocaleString('pt-BR')}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.contact_rate}%</td>
                          <td className={`px-2 py-2 text-right font-semibold ${(r.cpc_rate || 0) < metaDia ? 'text-red-600' : 'text-teal-700'}`}>{r.cpc_rate}%</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.conv_tab ?? 0}%</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.operadores ?? 0}</td>
                        </tr>
                      ))}
                    {!(discagens.por_fila || []).length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Aguardando sync com por_fila.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Por supervisor</h3>
                <p className="text-xs text-gray-400">Tabs · CPC · Conv · Drop/Desligue% (DESLIGOU+QUEDA)</p>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <SortTh label="Supervisor" col="supervisor_name" sortKey={discSupKey} sortDir={discSupDir} onSort={toggleDiscSup} align="left" className="px-4" />
                      <SortTh label="Ops" col="operadores" sortKey={discSupKey} sortDir={discSupDir} onSort={toggleDiscSup} align="right" className="px-2" />
                      <SortTh label="Tabs" col="tabuladas" sortKey={discSupKey} sortDir={discSupDir} onSort={toggleDiscSup} align="right" className="px-2" />
                      <SortTh label="CPC%" col="cpc_rate" sortKey={discSupKey} sortDir={discSupDir} onSort={toggleDiscSup} align="right" className="px-2" />
                      <SortTh label="Conv%" col="conv_tab" sortKey={discSupKey} sortDir={discSupDir} onSort={toggleDiscSup} align="right" className="px-2" />
                      <SortTh label="Drop%" col="desligue_rate" sortKey={discSupKey} sortDir={discSupDir} onSort={toggleDiscSup} align="right" className="px-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(discSupSorted as NonNullable<typeof discagens.por_supervisor>).map((r) => (
                      <tr key={r.supervisor_name} className="border-t border-gray-50">
                        <td className="px-4 py-2">{r.supervisor_name}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.operadores}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.tabuladas}</td>
                        <td className={`px-2 py-2 text-right font-semibold ${r.cpc_rate < metaDia ? 'text-red-600' : 'text-teal-700'}`}>{r.cpc_rate}%</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.conv_tab}%</td>
                        <td className={`px-2 py-2 text-right tabular-nums font-semibold ${(r.desligue_rate || 0) >= 25 ? 'text-red-600' : 'text-gray-700'}`}>
                          {r.desligue_rate ?? '—'}%
                        </td>
                      </tr>
                    ))}
                    {!(discagens.por_supervisor || []).length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Aguardando sync com por_supervisor.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-800">Operadores (só quem tabulou)</h3>
              <p className="text-xs text-gray-400">
                Drop/Desligue% = tabs DESLIGOU sem ouvir + QUEDA DE LIGAÇÃO ÷ tabs · alerta ≥25%
              </p>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                  <tr>
                    <SortTh label="Operador" col="user_name" sortKey={opDiscKey} sortDir={opDiscDir} onSort={toggleOpDisc} align="left" className="px-4" />
                    <SortTh label="Supervisor" col="supervisor_name" sortKey={opDiscKey} sortDir={opDiscDir} onSort={toggleOpDisc} align="left" className="px-3" />
                    <SortTh label="Fila" col="_fila" sortKey={opDiscKey} sortDir={opDiscDir} onSort={toggleOpDisc} align="left" className="px-3" />
                    <SortTh label="Tabs" col="tabuladas" sortKey={opDiscKey} sortDir={opDiscDir} onSort={toggleOpDisc} align="right" className="px-2" />
                    <SortTh label="CPC%" col="cpc_rate" sortKey={opDiscKey} sortDir={opDiscDir} onSort={toggleOpDisc} align="right" className="px-2" />
                    <SortTh label="Conv%" col="conv_tab" sortKey={opDiscKey} sortDir={opDiscDir} onSort={toggleOpDisc} align="right" className="px-2" />
                    <SortTh label="Drop%" col="desligue_rate" sortKey={opDiscKey} sortDir={opDiscDir} onSort={toggleOpDisc} align="right" className="px-2" />
                  </tr>
                </thead>
                <tbody>
                  {(opDiscSorted as typeof opDiscRows).map((r) => {
                      const isOut = (discagens.outliers_conversao || []).some((o) => o.id_user === r.id_user);
                      const fila = r._fila as string;
                      return (
                        <tr key={r.id_user} className={`border-t border-gray-50 ${isOut ? 'bg-amber-50/70' : ''}`}>
                          <td className="px-4 py-2 font-medium">
                            {isOut ? (
                              <button
                                type="button"
                                onClick={() => openOpChart(r)}
                                className="text-left text-indigo-800 hover:underline underline-offset-2"
                                title="Ver variação 10 min"
                              >
                                {r.user_name}
                              </button>
                            ) : (
                              r.user_name
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{r.supervisor_name}</td>
                          <td className="px-3 py-2 truncate max-w-[180px]" title={r.queue_name}>{fila}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.tabuladas}</td>
                          <td className={`px-2 py-2 text-right font-semibold ${r.cpc_rate < metaDia ? 'text-red-600' : 'text-teal-700'}`}>{r.cpc_rate}%</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.conv_tab}%</td>
                          <td className={`px-2 py-2 text-right tabular-nums font-semibold ${(r.desligue_rate || 0) >= 25 ? 'text-red-600' : 'text-gray-700'}`}>
                            {r.desligue_rate ?? '—'}%
                          </td>
                        </tr>
                      );
                    })}
                  {!(discagens.por_operador || []).length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Aguardando sync com por_operador.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Matriz Tabulação × Hora — espelho do relatório oficial */}
          <div className="card shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Tabulações × Hora (discagens)</h3>
                <p className="text-xs text-gray-400">
                  Visão do relatório EVA: % da tabulação no volume da hora · última coluna = % phones únicos
                </p>
              </div>
              <div className="flex rounded-xl bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setTabPctMode(true)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${tabPctMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  % na hora
                </button>
                <button
                  type="button"
                  onClick={() => setTabPctMode(false)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${!tabPctMode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                >
                  Volume
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <SortTh label="Tabulação" col="nome" sortKey={thKey} sortDir={thDir} onSort={toggleTh} align="left" className="px-3 min-w-[180px]" />
                    {HORAS.map((h) => (
                      <th key={h} className="text-right px-2 py-2">{h}h</th>
                    ))}
                    <SortTh label="% Phones" col="pct_phones" sortKey={thKey} sortDir={thDir} onSort={toggleTh} align="right" className="px-3" />
                    <SortTh label="Total" col="total" sortKey={thKey} sortDir={thDir} onSort={toggleTh} align="right" className="px-3" />
                  </tr>
                </thead>
                <tbody>
                  {(tabHoraSorted as typeof tabHoraRows).map((r) => (
                    <tr key={`${r.nome}-${r.campanha_op}`} className="border-t border-gray-50 hover:bg-gray-50/80">
                      <td className="px-3 py-1.5 font-medium text-gray-800 truncate max-w-[220px]" title={r.nome}>
                        {r.nome}
                      </td>
                      {HORAS.map((h) => {
                        const pct = r.pct_hora?.[h] || 0;
                        const vol = r.horas?.[h] || 0;
                        const show = tabPctMode ? (pct > 0 ? `${pct}%` : '') : (vol > 0 ? String(vol) : '');
                        return (
                          <td
                            key={h}
                            className={`px-2 py-1.5 text-right tabular-nums ${pct >= 15 ? 'font-bold text-indigo-700' : 'text-gray-600'}`}
                          >
                            {show}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-teal-700">
                        {r.pct_phones != null ? `${r.pct_phones}%` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.total}</td>
                    </tr>
                  ))}
                  {tabHoraRows.length === 0 && (
                    <tr>
                      <td colSpan={HORAS.length + 3} className="px-4 py-10 text-center text-sm text-gray-400">
                        Matriz ainda sem `tab_hora` no payload. Após sync com `vw_mailing_dial_details`, a distribuição por hora aparece aqui.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function Kpi({
  label, value, sub, warn, icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  warn?: boolean;
  icon: typeof PhoneCall;
}) {
  return (
    <div className={`card p-4 shadow-sm ${warn ? 'border-red-200 bg-red-50' : ''}`}>
      <p className="text-[10px] font-semibold uppercase text-gray-400 flex items-center gap-1">
        <Icon size={12} /> {label}
      </p>
      <p className={`text-2xl font-black ${warn ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
