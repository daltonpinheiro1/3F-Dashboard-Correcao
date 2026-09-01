import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ChipBar, SegControl, TabBar } from '../components/ui';
import { SortTh } from '../components/SortTh';
import { StaleDataBanner } from '../components/StaleDataBanner';
import {
  fetchEvaLive,
  fetchEvaPeriodo,
  fmtHms,
  fmtInt,
  matchCampanha,
  resolveDiscagens,
  CAMPANHA_FILTRO_OPTIONS,
  labelCampanhaOp,
  type CampanhaOp,
  type EvaDiscagens,
  type EvaDiscagensOperador,
  type EvaDiscagensSerie10Op,
  type EvaDiscagensSlice,
  type EvaDiscagensTabHora,
  type EvaPayload,
  type EvaTmaHora,
} from '../lib/evaDash';
import { isLiveStale, liveAgeMs } from '../hooks/useEvaLive';
import { filtroEvaAtivo, useFiltroEvaStore } from '../store/filtroStore';
import { useMetaCpcStore } from '../store/metaCpcStore';
import { useTableSortFields } from '../lib/tableSort';

const HORAS = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'];

type TabHoraMode = 'pct' | 'vol' | 'drop' | 'tma';

function horaKey(h: string | number) {
  return String(h).padStart(2, '0').slice(0, 2);
}

function normTabKey(nome?: string | null, campanha_op?: string | null, hora?: string | number) {
  const n = (nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  const cop = (campanha_op || '').trim().toUpperCase();
  const hh = hora == null || hora === '' ? '' : horaKey(hora);
  return `${n}|${cop}|${hh}`;
}

/** TMA compacto na grade (ex.: 44s · 1:05). */
function fmtTmaCell(seg?: number | null): string {
  if (seg == null || seg <= 0) return '';
  const s = Math.round(seg);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function mergeTmaHoraPayload(hist: EvaPayload[]): EvaTmaHora[] {
  const acc: Record<string, { nome: string; hora: number; n: number; tma_w: number; campanha_op?: string }> = {};
  for (const h of hist) {
    for (const r of h.tma_hora || []) {
      const k = `${r.nome}|${r.hora}|${r.campanha_op || ''}`;
      if (!acc[k]) acc[k] = { nome: r.nome, hora: r.hora, n: 0, tma_w: 0, campanha_op: r.campanha_op };
      acc[k].n += r.n || 0;
      acc[k].tma_w += (r.tma_seg || 0) * (r.n || 0);
    }
  }
  return Object.values(acc).map((r) => ({
    nome: r.nome,
    hora: r.hora,
    n: r.n,
    tma_seg: r.n ? Math.round((r.tma_w / r.n) * 10) / 10 : 0,
    campanha_op: r.campanha_op,
  }));
}

/** Taxa % com 2 casas quando < 1% (preditivo). */
function rateFine(n: number, d: number) {
  if (!d) return 0;
  const pct = (100 * n) / d;
  return Math.round(pct * (pct > 0 && pct < 1 ? 100 : 10)) / (pct > 0 && pct < 1 ? 100 : 10);
}

function limLoc(camp: CampanhaOp | string | undefined) {
  // Loc% = agente ÷ tentativas (PORT ~0,05%; MIG ~3%)
  if (camp === 'PORTABILIDADE') return 0.03;
  if (camp === 'MIGRACAO') return 1.5;
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

function isFilaRobo(texto: string | undefined | null): boolean {
  return (texto || '').toLowerCase().includes('robo');
}

function shortQueue(q: string | undefined | null): string {
  const s = (q || '—').trim() || '—';
  const m = s.match(/^\d+\s*-\s*(?:TIM\s+)?(.+)$/i);
  return (m?.[1] || s).trim();
}

function shortCamp(c: string | undefined | null): string {
  return labelCampanhaOp(c);
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
          drop_total: 0,
          horas: {},
          horas_drop: {},
          pct_hora: {},
        };
      }
      tabAcc[key].total += t.total || 0;
      tabAcc[key].drop_total = (tabAcc[key].drop_total || 0) + (t.drop_total || 0);
      tabAcc[key].phones = Math.max(tabAcc[key].phones || 0, t.phones || 0);
      for (const h of HORAS) {
        tabAcc[key].horas[h] = (tabAcc[key].horas[h] || 0) + (t.horas?.[h] || 0);
        tabAcc[key].horas_drop![h] =
          (tabAcc[key].horas_drop?.[h] || 0) + (t.horas_drop?.[h] || 0);
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
    alo_tab_rate: rateFine(r.tabuladas || 0, r.contact || 0),
    tab_rate: rateFine(r.tabuladas || 0, r.dialed || 0),
    cpc_rate: rateFine(r.cpc || 0, r.tabuladas || 0),
    conv_tab: rateFine(r.sucesso || 0, r.tabuladas || 0),
    efficacy: rateFine(r.sucesso || 0, r.dialed || 0),
  });

  const horaTotByCamp: Record<string, Record<string, number>> = {};
  for (const t of Object.values(tabAcc)) {
    const cop = t.campanha_op || 'OUTROS';
    if (!horaTotByCamp[cop]) horaTotByCamp[cop] = {};
    for (const h of HORAS) {
      horaTotByCamp[cop][h] = (horaTotByCamp[cop][h] || 0) + (t.horas[h] || 0);
    }
  }
  const phonesAll = Object.values(tabAcc).reduce((s, t) => s + (t.phones || 0), 0) || 1;
  const tab_hora = Object.values(tabAcc)
    .map((t) => {
      const cop = t.campanha_op || 'OUTROS';
      const horaTot = horaTotByCamp[cop] || {};
      const pct_hora: Record<string, number> = {};
      for (const h of HORAS) pct_hora[h] = rateFine(t.horas[h] || 0, horaTot[h] || 0);
      return {
        ...t,
        pct_hora,
        pct_phones: rateFine(t.phones || 0, phonesAll),
        pct_drop: rateFine(t.drop_total || 0, t.total || 0),
      };
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
      desligue_rate: rateFine(r.desligue_agente, r.tabuladas),
      desligue_agente_rate: rateFine(r.desligue_agente, r.tabuladas),
    }))
    .sort((a, b) => b.tabuladas - a.tabuladas);

  const por_operador = Object.values(opAcc)
    .map((r) => ({
      ...r,
      cpc_rate: rateFine(r.cpc, r.tabuladas),
      conv_tab: rateFine(r.sucesso, r.tabuladas),
      conv_loc: rateFine(r.sucesso, r.contact || 0),
      // DROP% canônico = Agente Desligou
      desligue_rate: rateFine(r.desligue_agente || 0, r.tabuladas),
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
      alo_tab_rate: rateFine(acc.tabuladas, acc.contact),
      cpc_rate: rateFine(acc.cpc, acc.tabuladas),
      conv_tab: rateFine(acc.sucesso, acc.tabuladas),
      efficacy: rateFine(acc.sucesso, acc.dialed),
      tab_rate: rateFine(acc.tabuladas, acc.dialed),
      desligue: desligueAgSum,
      desligue_agente: desligueAgSum,
      desligue_rate: rateFine(desligueAgSum, tabsOp),
      desligue_agente_rate: rateFine(desligueAgSum, tabsOp),
      desligue_evento: desligueSum,
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

function matchDiscRow(
  r: { campanha_op?: string; queue_name?: string; campanha_label?: string },
  campanha: CampanhaOp,
) {
  return matchCampanha(
    { campanha_op: r.campanha_op, campaign_name: r.queue_name || r.campanha_label },
    campanha,
  );
}

function filterCamp(rows: EvaDiscagensSlice[] | undefined, campanha: CampanhaOp) {
  return (rows || []).filter((r) => matchDiscRow(r, campanha));
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
  const [tabHoraMode, setTabHoraMode] = useState<TabHoraMode>('pct');
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
  const fetchGen = useRef(0);

  const limparTudo = useCallback(() => {
    limparFiltro();
    setHora('todas');
  }, [limparFiltro]);

  const loadLive = useCallback(async (spin = true) => {
    const my = ++fetchGen.current;
    if (spin) setIsLoading(true);
    setRefreshing(true);
    setFetchError(null);
    try {
      const live = await fetchEvaLive();
      if (my !== fetchGen.current) return;
      setData(live);
      setLastUpdate(new Date());
    } catch (e: unknown) {
      if (my !== fetchGen.current) return;
      setFetchError(e instanceof Error ? e.message : 'Falha ao carregar EVA');
    } finally {
      if (my === fetchGen.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadHist = useCallback(async () => {
    const my = ++fetchGen.current;
    setIsLoading(true);
    setRefreshing(true);
    setFetchError(null);
    try {
      const { dias, faltando } = await fetchEvaPeriodo(dateFrom, dateTo);
      if (my !== fetchGen.current) return;
      setHist(dias);
      setHistFaltando(faltando || []);
      setLastUpdate(new Date());
    } catch (e: unknown) {
      if (my !== fetchGen.current) return;
      setFetchError(e instanceof Error ? e.message : 'Falha no histórico');
    } finally {
      if (my === fetchGen.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (tab === 'live') loadLive(true);
    else loadHist();
  }, [tab, loadLive, loadHist]);

  useEffect(() => {
    if (tab !== 'live') return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadLive(false);
    };
    const id = setInterval(tick, 30_000);
    const onVis = () => {
      if (!document.hidden) loadLive(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
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
        alo_tab_rate: rateFine(tabuladas, contact),
        cpc_rate: rateFine(cpc, tabuladas),
        conv_tab: rateFine(sucesso, tabuladas),
        efficacy: rateFine(sucesso, dialed),
        tab_rate: rateFine(tabuladas, dialed),
        dialing_time_seg: discagens.kpis.dialing_time_seg || 0,
        // DROP% = Agente Desligou — ver dropAgente (não série hora)
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
          alo_tab_rate: rateFine(tabuladas, contact),
          cpc_rate: rateFine(cpc, tabuladas),
          conv_tab: rateFine(sucesso, tabuladas),
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
      const receptivoHora = campanha === 'PORTABILIDADE' && d > 0 && loc / d >= 0.9;
      return {
        ...row,
        // Funil 1: Loc% = agente ÷ tentativas
        loc_pct: d ? Math.round((1000 * loc) / d) / 10 : 0,
        // Funil 2: Tabs ÷ agente (receptivo: Tabs ÷ tentativas)
        tab_alo_pct: receptivoHora
          ? d
            ? Math.round((1000 * tab) / d) / 10
            : 0
          : loc
            ? Math.round((1000 * tab) / loc) / 10
            : 0,
        tab_pct: d ? Math.round((1000 * tab) / d) / 10 : 0,
        // Funil humano: CPC ÷ tabs · Conv = sucesso ÷ tabs
        cpc_pct: tab ? Math.round((1000 * cpc) / tab) / 10 : 0,
        conv_pct: tab ? Math.round((1000 * suc) / tab) / 10 : 0,
      };
    });
  }, [discagens.serie_hora, campanha, hora]);

  const porCampanha = useMemo(() => filterCamp(discagens.por_campanha, campanha), [discagens.por_campanha, campanha]);
  const porMailing = useMemo(() => {
    return filterCamp(discagens.por_mailing, campanha)
      .filter((r) => !isFilaRobo(r.mailing) && !isFilaRobo(r.campanha_op))
      .slice()
      .sort((a, b) => (b.efficacy || 0) - (a.efficacy || 0) || (b.dialed || 0) - (a.dialed || 0))
      .slice(0, 25);
  }, [discagens.por_mailing, campanha]);
  const tmaHoraSrc = useMemo(() => {
    if (tab === 'live') return data?.tma_hora || [];
    return mergeTmaHoraPayload(hist);
  }, [tab, data, hist]);

  const horasVisiveis = useMemo(() => (hora === 'todas' ? HORAS : [horaKey(hora)]), [hora]);

  const tabHoraRows = useMemo(() => {
    const tmaMap = new Map<string, { seg: number; n: number }>();
    for (const r of tmaHoraSrc) {
      if (!matchDiscRow(r, campanha)) continue;
      const hh = horaKey(r.hora);
      const k = normTabKey(r.nome, r.campanha_op, hh);
      const prev = tmaMap.get(k);
      const n = r.n || 0;
      const seg = r.tma_seg || 0;
      if (!prev) tmaMap.set(k, { seg, n });
      else {
        const nn = prev.n + n;
        tmaMap.set(k, {
          n: nn,
          seg: nn ? (prev.seg * prev.n + seg * n) / nn : 0,
        });
      }
    }

    const filtered = (discagens.tab_hora || []).filter((r) =>
      matchDiscRow(r, campanha),
    );

    // % na hora = share da tab no volume da mesma campanha na hora
    // (não usar pct_hora do payload se veio misturando MIG+PORT).
    const horaTotCamp: Record<string, Record<string, number>> = {};
    for (const r of filtered) {
      const cop = r.campanha_op || 'OUTROS';
      if (!horaTotCamp[cop]) horaTotCamp[cop] = {};
      for (const h of HORAS) {
        horaTotCamp[cop][h] = (horaTotCamp[cop][h] || 0) + (r.horas?.[h] || 0);
      }
    }

    return filtered
      .map((r) => {
        const cop = r.campanha_op || 'OUTROS';
        const baseHora = horaTotCamp[cop] || {};
        const pct_hora: Record<string, number> = {};
        for (const h of HORAS) {
          pct_hora[h] = rateFine(r.horas?.[h] || 0, baseHora[h] || 0);
        }
        const tma_horas: Record<string, number> = {};
        let tma_w = 0;
        let tma_n = 0;
        for (const h of HORAS) {
          const cell = tmaMap.get(normTabKey(r.nome, r.campanha_op, h));
          if (cell && cell.n > 0) {
            tma_horas[h] = Math.round(cell.seg * 10) / 10;
            if (hora === 'todas' || h === horaKey(hora)) {
              tma_w += cell.seg * cell.n;
              tma_n += cell.n;
            }
          }
        }
        const volFiltro =
          hora === 'todas'
            ? r.total || 0
            : r.horas?.[horaKey(hora)] || 0;
        const pctFiltro =
          hora === 'todas'
            ? undefined
            : pct_hora[horaKey(hora)] || 0;
        const dropFiltro =
          hora === 'todas'
            ? r.drop_total || 0
            : r.horas_drop?.[horaKey(hora)] || 0;
        const pctDropFiltro =
          volFiltro > 0 ? rateFine(dropFiltro, volFiltro) : r.pct_drop || 0;
        return {
          ...r,
          pct_hora,
          tma_horas,
          tma_medio: tma_n ? Math.round((tma_w / tma_n) * 10) / 10 : 0,
          _vol_filtro: volFiltro,
          _pct_filtro: pctFiltro,
          _drop_filtro: dropFiltro,
          _pct_drop_filtro: pctDropFiltro,
          _tma_sort: tma_n ? tma_w / tma_n : 0,
          _drop_sort: hora === 'todas' ? (r.pct_drop || 0) : pctDropFiltro,
        };
      })
      .filter((r) =>
        hora === 'todas'
          ? true
          : (r._vol_filtro || 0) > 0 ||
            (r.tma_horas?.[horaKey(hora)] || 0) > 0 ||
            (r._drop_filtro || 0) > 0,
      )
      .slice(0, 40);
  }, [discagens.tab_hora, campanha, hora, tmaHoraSrc]);

  const campanhaRows = useMemo(
    () => (porCampanha.length ? porCampanha : [{ campanha_op: campanha, ...kpis }]),
    [porCampanha, campanha, kpis],
  );
  const {
    sorted: campSorted,
    sortKey: campKey,
    sortDir: campDir,
    toggleSort: toggleCamp,
  } = useTableSortFields(campanhaRows, 'dialed', 'desc');

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
  } = useTableSortFields(mailingRows, 'efficacy', 'desc');

  const {
    sorted: amdSorted,
    sortKey: amdKey,
    sortDir: amdDir,
    toggleSort: toggleAmd,
  } = useTableSortFields((discagens.por_amd || []), 'dialed', 'desc');

  const filaRows = useMemo(
    () =>
      (discagens.por_fila || []).filter((r) => matchDiscRow(r, campanha)),
    [discagens.por_fila, campanha],
  );
  const {
    sorted: filaSorted,
    sortKey: filaKey,
    sortDir: filaDir,
    toggleSort: toggleFila,
  } = useTableSortFields(filaRows, 'dialed', 'desc');

  const discSupRows = useMemo(() => {
    if (campanha === 'TODAS') return discagens.por_supervisor || [];
    const acc: Record<
      string,
      {
        supervisor_name: string;
        operadores: Set<number>;
        tabuladas: number;
        cpc: number;
        sucesso: number;
        desligue: number;
        desligue_agente: number;
      }
    > = {};
    for (const r of discagens.por_operador || []) {
      if (!matchDiscRow(r, campanha)) continue;
      const sup = r.supervisor_name || '—';
      if (!acc[sup]) {
        acc[sup] = {
          supervisor_name: sup,
          operadores: new Set(),
          tabuladas: 0,
          cpc: 0,
          sucesso: 0,
          desligue: 0,
          desligue_agente: 0,
        };
      }
      if (r.id_user) acc[sup].operadores.add(r.id_user);
      acc[sup].tabuladas += r.tabuladas || 0;
      acc[sup].cpc += r.cpc || 0;
      acc[sup].sucesso += r.sucesso || 0;
      acc[sup].desligue += r.desligue || 0;
      acc[sup].desligue_agente += r.desligue_agente || 0;
    }
    return Object.values(acc).map((v) => {
      const tabs = v.tabuladas;
      return {
        supervisor_name: v.supervisor_name,
        operadores: v.operadores.size,
        tabuladas: tabs,
        cpc: v.cpc,
        sucesso: v.sucesso,
        desligue: v.desligue_agente,
        desligue_agente: v.desligue_agente,
        cpc_rate: tabs ? Math.round((1000 * v.cpc) / tabs) / 10 : 0,
        conv_tab: tabs ? Math.round((1000 * v.sucesso) / tabs) / 10 : 0,
        desligue_rate: tabs ? Math.round((1000 * v.desligue_agente) / tabs) / 10 : 0,
      };
    });
  }, [discagens.por_supervisor, discagens.por_operador, campanha]);

  const {
    sorted: discSupSorted,
    sortKey: discSupKey,
    sortDir: discSupDir,
    toggleSort: toggleDiscSup,
  } = useTableSortFields(discSupRows, 'tabuladas', 'desc');

  const opDiscRows = useMemo(
    () =>
      (discagens.por_operador || [])
        .filter((r) => matchDiscRow(r, campanha))
        .slice(0, 80)
        .map((r) => {
          const tabs = r.tabuladas || 0;
          const ag = r.desligue_agente || 0;
          return {
            ...r,
            _fila: r.queue_curta || shortQueue(r.queue_name),
            desligue: ag,
            desligue_rate:
              r.desligue_agente_rate ??
              (tabs ? Math.round((1000 * ag) / tabs) / 10 : 0),
          };
        }),
    [discagens.por_operador, campanha],
  );
  const {
    sorted: opDiscSorted,
    sortKey: opDiscKey,
    sortDir: opDiscDir,
    toggleSort: toggleOpDisc,
  } = useTableSortFields(opDiscRows, 'tabuladas', 'desc');

  const {
    sorted: tabHoraSorted,
    sortKey: thKey,
    sortDir: thDir,
    toggleSort: toggleTh,
  } = useTableSortFields(
    tabHoraRows as unknown as Record<string, unknown>[],
    tabHoraMode === 'tma'
      ? '_tma_sort'
      : tabHoraMode === 'drop'
        ? '_drop_sort'
        : hora === 'todas'
          ? 'total'
          : '_vol_filtro',
    'desc',
  );

  const gaps = useMemo(() => {
    const alerts: { nivel: 'alto' | 'medio'; msg: string }[] = [];
    const pisoLoc = limLoc(campanha);
    const pisoEff = limEfficacy(campanha);
    if (kpis.dialed >= 500 && kpis.contact_rate < pisoLoc) {
      alerts.push({
        nivel: 'alto',
        msg: `Taxa de localização ${kpis.contact_rate}% abaixo do piso ${pisoLoc}% (agente ÷ tentativas) — revisar transferência robô→humano / mailing.`,
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

  /** DROP% canônico = Agente Desligou (EVA), nunca tab “queda/caixa postal”. */
  const dropAgente = useMemo(() => {
    const ops = (discagens.por_operador || []).filter((r) =>
      matchDiscRow(r, campanha),
    );
    if (ops.length) {
      const n = ops.reduce((s, o) => s + (o.desligue_agente || 0), 0);
      const tot = ops.reduce((s, o) => s + (o.tabuladas || 0), 0);
      return {
        n,
        tot,
        rate: tot ? Math.round((1000 * n) / tot) / 10 : 0,
        disponivel: true,
        fonte: 'por_operador' as const,
      };
    }
    const n = kpis.desligue_agente ?? 0;
    const tot = kpis.tabuladas || 0;
    const rate =
      kpis.desligue_agente_rate ??
      (tot ? Math.round((1000 * n) / tot) / 10 : 0);
    return {
      n,
      tot,
      rate,
      disponivel: kpis.desligue_agente != null || kpis.desligue_agente_rate != null,
      fonte: 'kpis' as const,
    };
  }, [discagens.por_operador, campanha, kpis.desligue_agente, kpis.desligue_agente_rate, kpis.tabuladas]);

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

  // Visão dialer: Discadas → Localizou → Tabuladas → CPC → Sucesso
  // % à direita (após Localizou) = vs localizadas; barra = conversão da etapa anterior.
  // Portabilidade receptivo puro (Loc≈100% sem ROBO): pula etapa Alo.
  // Estimado (sem dial_details): só Tabuladas → CPC → Sucesso.
  const funnelBase = temDialer
    ? isPortReceptivo
      ? [
          {
            etapa: 'Discadas',
            valor: kpis.dialed,
            pctBase: 100,
            step: 100,
            hint: 'entrantes receptivo (dial_details)',
            baseLabel: 'discadas',
          },
          {
            etapa: 'Tabuladas',
            valor: kpis.tabuladas,
            pctBase: pctOf(kpis.tabuladas, kpis.dialed),
            step: stepPct(kpis.tabuladas, kpis.dialed),
            hint: 'tabulação humana (pula Alo ≈ 100%)',
            baseLabel: 'discadas',
          },
        ]
      : [
          {
            etapa: 'Discadas',
            valor: kpis.dialed,
            pctBase: 100,
            step: 100,
            hint: 'tentativas (mailing_logger)',
            baseLabel: 'discadas',
          },
          {
            etapa: 'Localizou',
            valor: kpis.contact,
            pctBase: pctOf(kpis.contact, kpis.dialed),
            step: stepPct(kpis.contact, kpis.dialed),
            hint: 'entregue ao operador (attendance humano)',
            baseLabel: 'discadas',
          },
          {
            etapa: 'Tabuladas',
            valor: kpis.tabuladas,
            pctBase: pctOf(kpis.tabuladas, kpis.contact),
            step: stepPct(kpis.tabuladas, kpis.contact || kpis.dialed),
            hint: 'tab humana (depois do agente)',
            baseLabel: 'agentes',
          },
        ]
    : [
        {
          etapa: 'Tabuladas',
          valor: kpis.tabuladas,
          pctBase: 100,
          step: 100,
          hint: 'universo disponível (sem tentativas/agente no snapshot)',
          baseLabel: 'tabuladas',
        },
      ];

  const funnel = [
    ...funnelBase,
    {
      etapa: 'CPC',
      valor: kpis.cpc,
      pctBase: temDialer
        ? isPortReceptivo
          ? pctOf(kpis.cpc, kpis.dialed)
          : pctOf(kpis.cpc, kpis.tabuladas)
        : pctOf(kpis.cpc, kpis.tabuladas),
      step: stepPct(kpis.cpc, kpis.tabuladas || kpis.contact || kpis.dialed || 1),
      hint: 'pessoa certa / tabuladas',
      baseLabel: 'tabuladas',
    },
    {
      etapa: 'Sucesso',
      valor: kpis.sucesso,
      pctBase: temDialer
        ? isPortReceptivo
          ? pctOf(kpis.sucesso, kpis.dialed)
          : pctOf(kpis.sucesso, kpis.tabuladas)
        : pctOf(kpis.sucesso, kpis.tabuladas),
      step: stepPct(kpis.sucesso, kpis.cpc || kpis.tabuladas || kpis.dialed || 1),
      hint: 'sucesso / CPC',
      baseLabel: 'tabuladas',
    },
  ];

  const fonteLabel =
    discagens.fonte === 'mailing_logger_attendance' || discagens.fonte === 'mailing_logger_attendance_hist'
      ? 'Fonte: logger+attendance · Localizou = agente'
      : discagens.fonte === 'mailing_dial_details'
      ? 'Fonte: dial_details (legado)'
      : discagens.fonte === 'mailing_logger' || discagens.fonte === 'mailing_logger_fallback'
        ? 'Fonte: mailing_logger (fallback)'
        : discagens.fonte === 'estimado_tabuladas'
          ? 'Fonte: estimada (aguarde sync)'
          : 'Fonte: indisponível';

  return (
    <AdminLayout
      title="Discagens"
      subtitle="Funil 1: Tentativas → Localizou/agente (Loc%) · Funil 2: Agente → Tabs → CPC → Sucesso"
    >
      <div className="space-y-4 mb-6 toolbar-sticky sm:static" aria-busy={isLoading}>
        <div className="flex flex-wrap items-center gap-2">
          <TabBar
            ariaLabel="Modo de dados"
            size="sm"
            active={tab}
            onChange={(id) => setTab(id as typeof tab)}
            tabs={[
              { id: 'live', label: 'Realtime', icon: Zap },
              { id: 'hist', label: 'Histórico', icon: Calendar },
            ]}
          />
          <ChipBar
            ariaLabel="Campanha"
            active={campanha}
            onChange={(id) => setCampanha(id as CampanhaOp)}
            variant="brand"
            chips={CAMPANHA_FILTRO_OPTIONS}
          />
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
              label={hora === 'todas' ? 'Tentativas (discadas)' : `Tentativas ${hora}h`}
              value={temDialer ? kpis.dialed : '—'}
              sub={temDialer ? 'mailing_logger (filas discagem)' : 'aguardando sync'}
            />
            <Kpi
              icon={Target}
              label={hora === 'todas' ? 'Localizou (agente)' : `Localizou ${hora}h`}
              value={temDialer ? kpis.contact : '—'}
              sub={
                !temDialer
                  ? 'agente = entregue'
                  : (kpis.alo_robo || 0) > 0
                    ? `${kpis.contact_rate}% Loc · transf ${kpis.transf_alo_rate ?? rateFine(kpis.contact, kpis.alo_robo || 0)}% sob Alo robô`
                    : `${kpis.contact_rate}% · agente÷tent.`
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
                    ? `${rateFine(kpis.tabuladas, kpis.dialed)}% das tentativas`
                    : `${rateFine(kpis.tabuladas, kpis.contact || 0)}% dos agentes`
                  : 'universo atual'
              }
            />
            <Kpi icon={Gauge} label="CPC%" value={`${kpis.cpc_rate}%`} sub={`${kpis.cpc} CPC · meta ${metaDia}% · tabulação`} warn={kpis.cpc_rate < metaDia && kpis.tabuladas >= 8} />
            <Kpi
              icon={TrendingDown}
              label="DROP agente%"
              value={dropAgente.disponivel ? `${dropAgente.rate}%` : '—'}
              sub={
                dropAgente.disponivel
                  ? `${fmtInt(dropAgente.n)} tabs · só Agente Desligou (EVA)${
                      hora !== 'todas' ? ' · % do dia/campanha (bit sem hora)' : ''
                    }`
                  : 'aguardando desligue_agente no sync'
              }
              warn={dropAgente.disponivel && dropAgente.rate >= 25 && dropAgente.tot >= 20}
            />
            <Kpi icon={Zap} label="Sucesso" value={kpis.sucesso} />
            <Kpi
              icon={Target}
              label="Eficácia"
              value={temDialer ? `${kpis.efficacy}%` : '—'}
              sub={temDialer ? 'sucesso ÷ tentativas' : 'requer discadas'}
              warn={temDialer && kpis.efficacy < limEfficacy(campanha) && kpis.dialed >= 500}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            <div className="card p-5 shadow-sm xl:col-span-1">
              <h3 className="text-sm font-bold text-gray-800 mb-1">Funil dialer</h3>
              <p className="text-[11px] text-gray-400 mb-3">
                Barra = conversão da etapa anterior · % à direita = vs base da etapa
                {' '}(Tentativas→Agente→Tabs→CPC→Sucesso)
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
                        {fmtInt(f.valor)}
                        <span className="text-gray-500 font-medium">
                          {' '}
                          · {f.pctBase}%
                          {f.etapa !== 'Discadas' && f.baseLabel ? (
                            <span className="text-gray-400 font-normal"> vs {f.baseLabel}</span>
                          ) : null}
                        </span>
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
                    ? ' Receptivo: Tentativas · Tabs · CPC. Linhas = Tabs% e Conv% (sucesso÷tabs).'
                    : ' Barras = Tentativas · Agente · Tabs. Linhas = Loc% (agente÷tent.) · Tabs/Agente% · Conv%.'
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
                          tab_alo_pct: number;
                          cpc_pct: number;
                        };
                        return (
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                            <div className="font-semibold text-gray-800 mb-1">{label}</div>
                            <div className="tabular-nums text-gray-700 space-y-0.5">
                              {temDialer ? (
                                <>
                                  <div>
                                    Tentativas:{' '}
                                    <strong>{fmtInt(row.dialed || 0)}</strong>
                                  </div>
                                  {!isPortReceptivo && (
                                    <div>
                                      Localizou (agente):{' '}
                                      <strong>{fmtInt(row.contact || 0)}</strong>
                                    </div>
                                  )}
                                  <div>
                                    Tabuladas:{' '}
                                    <strong>{fmtInt(row.tabuladas || 0)}</strong>
                                  </div>
                                  <div>
                                    CPC: <strong>{fmtInt(row.cpc || 0)}</strong>
                                  </div>
                                </>
                              ) : (
                                <div>Tabuladas: <strong>{fmtInt(row.tabuladas || 0)}</strong></div>
                              )}
                              <div>Sucesso: <strong>{fmtInt(row.sucesso || 0)}</strong></div>
                              <div className="pt-1 border-t border-gray-100 mt-1 space-y-0.5">
                                {temDialer && !isPortReceptivo && (
                                  <>
                                    <div className="text-indigo-700">
                                      Loc%: <strong>{row.loc_pct}%</strong>
                                      <span className="text-gray-500 font-normal"> agente÷tentativas</span>
                                    </div>
                                    <div className="text-violet-700">
                                      Tabs/Agente%: <strong>{row.tab_alo_pct}%</strong>
                                      <span className="text-gray-500 font-normal"> tabs÷agente</span>
                                    </div>
                                  </>
                                )}
                                {temDialer && isPortReceptivo && (
                                  <div className="text-indigo-700">
                                    Tabs%: <strong>{row.tab_pct}%</strong>
                                    <span className="text-gray-500"> tabs÷tentativas</span>
                                  </div>
                                )}
                                <div className="text-sky-700">
                                  CPC%: <strong>{row.cpc_pct}%</strong>
                                  <span className="text-gray-500 font-normal"> CPC÷tabs</span>
                                </div>
                                <div className="text-teal-700">
                                  Conv%: <strong>{row.conv_pct}%</strong>
                                  <span className="text-gray-500 font-normal"> sucesso÷tabs</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    {temDialer ? (
                      <>
                        <Bar yAxisId="left" dataKey="dialed" name="Tentativas" fill="#c7d2fe" radius={[2, 2, 0, 0]} />
                        {!isPortReceptivo && (
                          <Bar yAxisId="left" dataKey="contact" name="Localizou (agente)" fill="#a5b4fc" radius={[2, 2, 0, 0]} />
                        )}
                        <Bar yAxisId="left" dataKey="tabuladas" name="Tabuladas" fill="#818cf8" radius={[2, 2, 0, 0]} />
                        {isPortReceptivo && (
                          <Bar yAxisId="left" dataKey="cpc" name="CPC" fill="#6366f1" radius={[2, 2, 0, 0]} />
                        )}
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey={isPortReceptivo ? 'tab_pct' : 'loc_pct'}
                          name={isPortReceptivo ? 'Tabs% (÷tent.)' : 'Loc% (agente÷tent.)'}
                          stroke="#4f46e5"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        {!isPortReceptivo && (
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="tab_alo_pct"
                            name="Tabs/Agente%"
                            stroke="#7c3aed"
                            strokeWidth={2}
                            dot={false}
                          />
                        )}
                      </>
                    ) : (
                      <Bar yAxisId="left" dataKey="tabuladas" name="Tabuladas (hora)" fill="#c7d2fe" radius={[3, 3, 0, 0]} />
                    )}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="conv_pct"
                      name="Conv% (suc÷tabs)"
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
                <p className="text-xs text-gray-400">
                  Loc% = agente÷tent. · Tabs/Agente% · CPC%÷tabs · Efic%÷tent.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <SortTh label="Campanha" col="campanha_op" sortKey={campKey} sortDir={campDir} onSort={toggleCamp} align="left" className="px-4" />
                      <SortTh label="Tent." col="dialed" sortKey={campKey} sortDir={campDir} onSort={toggleCamp} align="right" />
                      <SortTh label="Loc.%" col="contact_rate" sortKey={campKey} sortDir={campDir} onSort={toggleCamp} align="right" />
                      <SortTh label="Tabs/Agente%" col="alo_tab_rate" sortKey={campKey} sortDir={campDir} onSort={toggleCamp} align="right" />
                      <SortTh label="CPC%" col="cpc_rate" sortKey={campKey} sortDir={campDir} onSort={toggleCamp} align="right" />
                      <SortTh label="Conv%" col="conv_tab" sortKey={campKey} sortDir={campDir} onSort={toggleCamp} align="right" />
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
                        <td className="px-3 py-2 text-right tabular-nums">
                          {(r.contact || 0) > 0 ? `${r.alo_tab_rate ?? rateFine(r.tabuladas || 0, r.contact || 0)}%` : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${(r.cpc_rate || 0) < metaDia ? 'text-red-600' : 'text-teal-700'}`}>{r.cpc_rate}%</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.conv_tab ?? rateFine(r.sucesso || 0, r.tabuladas || 0)}%</td>
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
                  Loc% = agente÷tent. · Tabs/Agente% · Conv%÷tabs
                </p>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <SortTh label="Mailing" col="_nome" sortKey={mailKey} sortDir={mailDir} onSort={toggleMail} align="left" className="px-4" />
                      <SortTh label="Tent." col="dialed" sortKey={mailKey} sortDir={mailDir} onSort={toggleMail} align="right" />
                      <SortTh label="Loc.%" col="contact_rate" sortKey={mailKey} sortDir={mailDir} onSort={toggleMail} align="right" />
                      <SortTh label="Tabs/Agente%" col="alo_tab_rate" sortKey={mailKey} sortDir={mailDir} onSort={toggleMail} align="right" />
                      <SortTh label="CPC%" col="cpc_rate" sortKey={mailKey} sortDir={mailDir} onSort={toggleMail} align="right" />
                      <SortTh label="Conv%" col="conv_tab" sortKey={mailKey} sortDir={mailDir} onSort={toggleMail} align="right" />
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
                          <td className="px-3 py-2 text-right tabular-nums">
                            {(r.contact || 0) > 0 ? `${r.alo_tab_rate ?? rateFine(r.tabuladas || 0, r.contact || 0)}%` : '—'}
                          </td>
                          <td className={`px-3 py-2 text-right font-bold ${(r.cpc_rate || 0) < metaDia ? 'text-red-600' : 'text-teal-700'}`}>{r.cpc_rate}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.conv_tab ?? rateFine(r.sucesso || 0, r.tabuladas || 0)}%</td>
                        </tr>
                      );
                    })}
                    {porMailing.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
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
                Top classificações AMD do discador (diagnóstico ≠ Localizou/agente) · % do total discado
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
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.dialed || 0)}</td>
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
                              {fmtInt(a.dialed)}/10min
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
                Volume do slot (não acumulado) · linhas = % localização e % conversão no slot.
                {(discagens.meta)?.serie_10min_fallback_humano
                  ? ' ⚠ Série sem ROBO (fallback leve) — Loc% pode ficar ~100% no receptivo.'
                  : ' Inclui ROBO preditivo (mesmo universo do funil).'}
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={(() => {
                      const acc: Record<
                        string,
                        { slot: string; dialed: number; contact: number; tabuladas: number; sucesso: number; loc_pct: number; tab_alo_pct: number; conv_pct: number }
                      > = {};
                      for (const r of discagens.serie_10min || []) {
                        if (!matchDiscRow(r, campanha)) continue;
                        const slot = String(r.slot || '').slice(11, 16) || String(r.slot || '');
                        if (!acc[slot]) acc[slot] = { slot, dialed: 0, contact: 0, tabuladas: 0, sucesso: 0, loc_pct: 0, tab_alo_pct: 0, conv_pct: 0 };
                        acc[slot].dialed += r.dialed || 0;
                        acc[slot].contact += r.contact || 0;
                        acc[slot].tabuladas += r.tabuladas || 0;
                        acc[slot].sucesso += r.sucesso || 0;
                      }
                      return Object.values(acc)
                        .map((row) => ({
                          ...row,
                          loc_pct: row.dialed ? Math.round((1000 * row.contact) / row.dialed) / 10 : 0,
                          tab_alo_pct: row.contact ? Math.round((1000 * row.tabuladas) / row.contact) / 10 : 0,
                          conv_pct: row.tabuladas ? Math.round((1000 * row.sucesso) / row.tabuladas) / 10 : 0,
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
                          tabuladas: number;
                          sucesso: number;
                          loc_pct: number;
                          tab_alo_pct: number;
                          conv_pct: number;
                        };
                        return (
                          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
                            <div className="font-semibold mb-1">{label}</div>
                            <div>Tentativas: <strong>{fmtInt(row.dialed)}</strong></div>
                            <div>Localizou (agente): <strong>{fmtInt(row.contact)}</strong></div>
                            <div>Tabs: <strong>{fmtInt(row.tabuladas || 0)}</strong></div>
                            <div>Sucesso: <strong>{fmtInt(row.sucesso)}</strong></div>
                            <div className="text-indigo-700">Loc%: <strong>{row.loc_pct}%</strong> <span className="text-gray-500">(agente÷tent.)</span></div>
                            <div className="text-violet-700">Tabs/Agente%: <strong>{row.tab_alo_pct}%</strong></div>
                            <div className="text-teal-700">Conv%: <strong>{row.conv_pct}%</strong> <span className="text-gray-500">(suc÷tabs)</span></div>
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="dialed" name="Tentativas/10min" fill="#c7d2fe" radius={[2, 2, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="loc_pct" name="Loc% (agente÷tent.)" stroke="#4f46e5" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="tab_alo_pct" name="Tabs/Agente%" stroke="#7c3aed" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="conv_pct" name="Conv% (suc÷tabs)" stroke="#059669" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <div className="card shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Saúde por fila</h3>
                <p className="text-xs text-gray-400">Tent. · Loc% · Tabs/Agente% · CPC% · Conv% (suc÷tabs) · ops</p>
              </div>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <SortTh label="Fila" col="queue_name" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="left" className="px-4" />
                      <SortTh label="Disc." col="dialed" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="right" className="px-2" />
                      <SortTh label="Loc.%" col="contact_rate" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="right" className="px-2" />
                      <SortTh label="Tabs/Agente%" col="alo_tab_rate" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="right" className="px-2" />
                      <SortTh label="CPC%" col="cpc_rate" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="right" className="px-2" />
                      <SortTh label="Conv%" col="conv_tab" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="right" className="px-2" />
                      <SortTh label="Ops" col="operadores" sortKey={filaKey} sortDir={filaDir} onSort={toggleFila} align="right" className="px-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(filaSorted as typeof filaRows).map((r) => (
                        <tr key={`${r.queue_name}-${r.campanha_op}`} className="border-t border-gray-50">
                          <td className="px-4 py-2 truncate max-w-[200px]" title={r.queue_name}>{r.queue_name}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmtInt(r.dialed || 0)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.contact_rate}%</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {(r.contact || 0) > 0 ? `${r.alo_tab_rate ?? rateFine(r.tabuladas || 0, r.contact || 0)}%` : '—'}
                          </td>
                          <td className={`px-2 py-2 text-right font-semibold ${(r.cpc_rate || 0) < metaDia ? 'text-red-600' : 'text-teal-700'}`}>{r.cpc_rate}%</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.conv_tab ?? 0}%</td>
                          <td className="px-2 py-2 text-right tabular-nums">{r.operadores ?? 0}</td>
                        </tr>
                      ))}
                    {!(discagens.por_fila || []).length && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                          Sem por_fila neste sync (enrich EVA incompleto — atualize em ~2 min).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Por supervisor</h3>
                <p className="text-xs text-gray-400">Tabs · CPC · Conv · DROP% = Agente Desligou (EVA)</p>
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
                    {(discSupSorted as typeof discSupRows).map((r) => (
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
                    {!discSupRows.length && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                          Sem por_supervisor neste sync (enrich EVA incompleto — atualize em ~2 min).
                        </td>
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
                DROP% = Agente Desligou (EVA end_interaction) ÷ tabs · alerta ≥25% · não usa nome da tabulação
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
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                        Sem por_operador neste sync (enrich EVA incompleto — atualize em ~2 min).
                      </td>
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
                  {tabHoraMode === 'pct'
                    ? 'Visão EVA: % da tabulação no volume da hora'
                    : tabHoraMode === 'vol'
                      ? 'Quantidade absoluta por hora'
                      : tabHoraMode === 'drop'
                        ? 'DROP% = Agente Desligou ÷ tabs da mesma tabulação na hora'
                        : 'TMA médio (attendance) por tabulação × hora'}
                  {hora !== 'todas' ? ` · filtro ${hora}h` : ''}
                  {campanha !== 'TODAS' ? ` · ${labelCampanhaOp(campanha)}` : ''}
                  {tabHoraMode === 'tma'
                    ? ' · Total = TMA ponderado do recorte'
                    : tabHoraMode === 'drop'
                      ? ' · última coluna = DROP% / qtd agente'
                      : ' · última coluna = % phones únicos'}
                </p>
              </div>
              <SegControl
                ariaLabel="Métrica da matriz tabulação × hora"
                value={tabHoraMode}
                onChange={(id) => setTabHoraMode(id as TabHoraMode)}
                options={[
                  { id: 'pct', label: '% na hora' },
                  { id: 'vol', label: 'Quantidade' },
                  { id: 'drop', label: 'DROP%' },
                  { id: 'tma', label: 'TMA' },
                ]}
              />
            </div>
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <SortTh label="Tabulação" col="nome" sortKey={thKey} sortDir={thDir} onSort={toggleTh} align="left" className="px-3 min-w-[180px]" />
                    {horasVisiveis.map((h) => (
                      <th key={h} className="text-right px-2 py-2">{h}h</th>
                    ))}
                    {tabHoraMode !== 'tma' && tabHoraMode !== 'drop' && (
                      <SortTh label="% Phones" col="pct_phones" sortKey={thKey} sortDir={thDir} onSort={toggleTh} align="right" className="px-3" />
                    )}
                    {tabHoraMode === 'drop' && (
                      <SortTh label="DROP qtd" col="drop_total" sortKey={thKey} sortDir={thDir} onSort={toggleTh} align="right" className="px-3" />
                    )}
                    <SortTh
                      label={
                        tabHoraMode === 'tma'
                          ? 'TMA méd.'
                          : tabHoraMode === 'drop'
                            ? 'DROP%'
                            : tabHoraMode === 'vol'
                              ? hora === 'todas'
                                ? 'Quantidade'
                                : `Qtd ${hora}h`
                              : hora === 'todas'
                                ? 'Total'
                                : `Vol ${hora}h`
                      }
                      col={
                        tabHoraMode === 'tma'
                          ? '_tma_sort'
                          : tabHoraMode === 'drop'
                            ? '_drop_sort'
                            : hora === 'todas'
                              ? 'total'
                              : '_vol_filtro'
                      }
                      sortKey={thKey}
                      sortDir={thDir}
                      onSort={toggleTh}
                      align="right"
                      className="px-3"
                    />
                  </tr>
                </thead>
                <tbody>
                  {(tabHoraSorted as typeof tabHoraRows).map((r) => (
                    <tr
                      key={`${r.nome}-${r.campanha_op}`}
                      className={`border-t border-gray-50 hover:bg-gray-50/80 ${
                        tabHoraMode === 'drop' && (r.drop_total || 0) > 0 ? 'bg-rose-50/50' : ''
                      }`}
                    >
                      <td className="px-3 py-1.5 font-medium text-gray-800 truncate max-w-[220px]" title={r.nome}>
                        {r.nome}
                      </td>
                      {horasVisiveis.map((h) => {
                        const pct = r.pct_hora?.[h] || 0;
                        const vol = r.horas?.[h] || 0;
                        const dropN = r.horas_drop?.[h] || 0;
                        const dropPctCell = vol > 0 ? rateFine(dropN, vol) : 0;
                        const tma = r.tma_horas?.[h] || 0;
                        const show =
                          tabHoraMode === 'pct'
                            ? pct > 0
                              ? `${pct}%`
                              : ''
                            : tabHoraMode === 'vol'
                              ? vol > 0
                                ? String(vol)
                                : ''
                              : tabHoraMode === 'drop'
                                ? dropN > 0 || vol > 0
                                  ? `${dropPctCell}%`
                                  : ''
                                : fmtTmaCell(tma);
                        const hot =
                          tabHoraMode === 'tma'
                            ? tma >= 90
                            : tabHoraMode === 'drop'
                              ? dropPctCell >= 25
                              : pct >= 15;
                        return (
                          <td
                            key={h}
                            className={`px-2 py-1.5 text-right tabular-nums ${
                              hot
                                ? tabHoraMode === 'drop'
                                  ? 'font-bold text-red-600'
                                  : 'font-bold text-indigo-700'
                                : 'text-gray-600'
                            }`}
                            title={
                              tabHoraMode === 'drop' && vol
                                ? `${dropN} agente desligou / ${vol} tabs`
                                : tabHoraMode === 'tma' && tma
                                  ? `TMA ${fmtHms(tma)} · vol ${vol}`
                                  : vol
                                    ? `${vol} tabs · ${pct}% da hora`
                                    : undefined
                            }
                          >
                            {show}
                          </td>
                        );
                      })}
                      {tabHoraMode !== 'tma' && tabHoraMode !== 'drop' && (
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-teal-700">
                          {r.pct_phones != null ? `${r.pct_phones}%` : '—'}
                        </td>
                      )}
                      {tabHoraMode === 'drop' && (
                        <td className="px-3 py-1.5 text-right tabular-nums text-rose-700 font-semibold">
                          {hora === 'todas' ? r.drop_total || 0 : r._drop_filtro || 0}
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                        {tabHoraMode === 'tma'
                          ? r.tma_medio
                            ? fmtTmaCell(r.tma_medio)
                            : '—'
                          : tabHoraMode === 'drop'
                            ? `${hora === 'todas' ? r.pct_drop || 0 : r._pct_drop_filtro || 0}%`
                            : hora === 'todas'
                              ? r.total
                              : r._vol_filtro || 0}
                      </td>
                    </tr>
                  ))}
                  {tabHoraRows.length === 0 && (
                    <tr>
                      <td colSpan={horasVisiveis.length + (tabHoraMode === 'tma' || tabHoraMode === 'drop' ? 2 : 3)} className="px-4 py-10 text-center text-sm text-gray-400">
                        {tabHoraMode === 'tma'
                          ? 'Sem TMA horário neste recorte (attendance × tabulação).'
                          : tabHoraMode === 'drop'
                            ? 'Sem DROP agente neste recorte (aguarde sync com end_interaction).'
                            : 'Matriz ainda sem `tab_hora` no payload. Após sync com `vw_mailing_dial_details`, a distribuição por hora aparece aqui.'}
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
  const display = typeof value === 'number' ? fmtInt(value) : value;
  return (
    <div className={`card p-4 shadow-sm ${warn ? 'border-red-200 bg-red-50' : ''}`}>
      <p className="text-[10px] font-semibold uppercase text-gray-400 flex items-center gap-1">
        <Icon size={12} /> {label}
      </p>
      <p className={`text-2xl font-black tabular-nums ${warn ? 'text-red-600' : 'text-gray-900'}`}>{display}</p>
      {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
