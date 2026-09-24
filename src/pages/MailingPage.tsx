import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Battery,
  Bot,
  Gauge,
  Lightbulb,
  PhoneCall,
  RefreshCw,
  Repeat,
  ShoppingBag,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdminLayout } from '../components/AdminLayout';
import { ChipBar, KpiCard, LIVE_HIST_OPTIONS, SegControl } from '../components/ui';
import { SortTh } from '../components/SortTh';
import { dataBrtIso } from '../lib/brt';
import { labelCampanhaOp, isCampanhaOpValida, CAMPANHA_FILTRO_OPTIONS, type CampanhaOp } from '../lib/evaDash';
import {
  MAILING_ATRASO_MIN,
  fetchMailingDias,
  fetchMailingSaude,
  minutosDesde,
} from '../lib/mailingSaude';
import {
  FOLEGO_ALERTA_DIAS,
  fmtNum,
  fmtPct,
  ganhoRetentativa,
  montarVisao,
  pctEsgotadoEstoque,
  pctVirginEstoque,
  rankingPropensao,
  statusDesgaste,
  type CampanhaMailing,
} from '../lib/mailingVisoes';
import { useFiltroEvaStore, type EvaTabModo } from '../store/filtroStore';
import type { MailingDiaIndice, MailingItem, MailingSaude } from '../../shared/contracts/mailing';

const POLL_MS = 120_000;

type SortKey = 'tentativas' | 'contato' | 'sucesso' | 'score' | 'folego' | 'desgaste' | 'giro' | 'virgin' | 'esgotado';

const NIVEL: Record<string, { cls: string; icon: typeof AlertTriangle; label: string }> = {
  acao: { cls: 'border-indigo-200 bg-indigo-50 text-indigo-900', icon: Target, label: 'Ação' },
  alerta: { cls: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle, label: 'Alerta' },
  oportunidade: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: Lightbulb, label: 'Oportunidade' },
};

function sortValor(m: MailingItem, k: SortKey): number {
  if (k === 'tentativas') return m.hoje.tentativas;
  if (k === 'contato') return m.hoje.taxa_contato;
  if (k === 'sucesso') return m.propensao.sucesso_100mil;
  if (k === 'score') return m.propensao.score ?? -1;
  if (k === 'folego') return m.folego_dias ?? Infinity;
  if (k === 'desgaste') return m.desgaste.indice;
  if (k === 'virgin') return pctVirginEstoque(m) ?? -1;
  if (k === 'esgotado') return pctEsgotadoEstoque(m) ?? -1;
  return m.hoje.giro;
}

function TendenciaSeta({ rel, sig }: { rel: number; sig: boolean }) {
  if (!sig || Math.abs(rel) < 0.02) return <span className="text-gray-400">estável</span>;
  const cai = rel < 0;
  const Icon = cai ? TrendingDown : TrendingUp;
  return (
    <span className={`inline-flex items-center gap-0.5 ${cai ? 'text-red-600' : 'text-emerald-600'}`}>
      <Icon size={12} /> {cai ? '' : '+'}
      {Math.round(100 * rel)}%/h
    </span>
  );
}

export function MailingPage() {
  const [data, setData] = useState<MailingSaude | null>(null);
  const [indice, setIndice] = useState<MailingDiaIndice[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const tab = useFiltroEvaStore((s) => s.tab);
  const setTab = useFiltroEvaStore((s) => s.setTab);
  const campanhaStore = useFiltroEvaStore((s) => s.campanha);
  const setCampanhaStore = useFiltroEvaStore((s) => s.setCampanha);
  const dateToStore = useFiltroEvaStore((s) => s.dateTo);
  const setDateToStore = useFiltroEvaStore((s) => s.setDateTo);
  const [campanha, setCampanhaLocal] = useState<CampanhaMailing>(campanhaStore);
  const [histDate, setHistDate] = useState(() => {
    const hoje = dataBrtIso();
    const d = dateToStore || hoje;
    return d > hoje ? hoje : d;
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'tentativas', dir: 'desc' });
  const [agora, setAgora] = useState(() => new Date());
  const [focoMailingId, setFocoMailingId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const setCampanha = useCallback(
    (id: string) => {
      setCampanhaLocal(id);
      if (isCampanhaOpValida(id)) setCampanhaStore(id as CampanhaOp);
    },
    [setCampanhaStore],
  );

  useEffect(() => {
    setCampanhaLocal(campanhaStore);
  }, [campanhaStore]);

  const carregar = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setCarregando(true);
    setErro(null);
    try {
      // Histórico sempre lê o snapshot selado (mesmo para "hoje"); live só no modo Realtime.
      const usarLive = tab === 'live';
      const [d, idx] = await Promise.all([
        fetchMailingSaude(usarLive ? { live: true } : { date: histDate }, ac.signal),
        fetchMailingDias(ac.signal).catch(() => null),
      ]);
      if (ac.signal.aborted) return;
      setData(d);
      setIndice(idx?.dias || []);
      if (!d) {
        setErro(
          usarLive
            ? 'O coletor ainda não publicou a saúde do mailing hoje.'
            : `Sem snapshot de mailing em ${histDate}. O histórico começa a acumular a partir da ativação do coletor.`,
        );
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErro((e as Error).message);
    } finally {
      if (abortRef.current === ac) setCarregando(false);
      setAgora(new Date());
    }
  }, [tab, histDate]);

  useEffect(() => {
    void carregar();
    if (tab !== 'live') {
      return () => abortRef.current?.abort();
    }
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar();
    }, POLL_MS);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [carregar, tab]);

  const visao = useMemo(() => (data ? montarVisao(data, campanha) : null), [data, campanha]);
  const atraso = data && tab === 'live' ? minutosDesde(data.updated_at, agora) : 0;
  const atrasado = tab === 'live' && !!data && atraso > MAILING_ATRASO_MIN;

  useEffect(() => {
    setFocoMailingId(null);
  }, [campanha, histDate, tab]);

  const datasHist = useMemo(() => {
    const set = new Set(indice.map((d) => d.data));
    // Garante o dia do snapshot live/histórico atual mesmo se o índice atrasar.
    if (data?.data) set.add(data.data);
    return [...set].sort().reverse();
  }, [indice, data]);

  useEffect(() => {
    if (tab === 'hist' && datasHist.length && !datasHist.includes(histDate)) {
      setHistDate(datasHist[0]);
      setDateToStore(datasHist[0]);
    }
  }, [tab, datasHist, histDate, setDateToStore]);

  const evolucaoChart = useMemo(
    () =>
      indice.map((d) => ({
        data: d.data.slice(5),
        contato: 100 * (d.taxa_contato || 0),
        sucesso100: d.sucesso_100mil ?? (d.tentativas ? (100_000 * d.sucesso) / d.tentativas : 0),
        desgaste: d.desgaste_medio ?? null,
        folego: d.folego_dias ?? null,
        curtos: d.mailings_folego_curto ?? 0,
      })),
    [indice],
  );

  const linhas = useMemo(() => {
    if (!visao) return [];
    const s = sort.dir === 'asc' ? 1 : -1;
    return [...visao.mailings].sort((a, b) => s * (sortValor(a, sort.key) - sortValor(b, sort.key)));
  }, [visao, sort]);

  const onSort = (key: string) =>
    setSort((cur) => ({ key: key as SortKey, dir: cur.key === key && cur.dir === 'desc' ? 'asc' : 'desc' }));

  const curvaChart = useMemo(
    () =>
      (visao?.curva || []).map((p) => ({
        rotulo: `${p.rotulo ?? p.k}ª`,
        taxa: 100 * p.taxa,
        faixa: [100 * p.ic_baixo, 100 * p.ic_alto] as [number, number],
        acumulada: 100 * p.acumulada,
        em_risco: p.em_risco,
      })),
    [visao],
  );

  const horaChart = useMemo(
    () =>
      (visao?.serie_hora_enriquecida || []).map((h) => ({
        hora: `${h.hora}h`,
        tentativas: h.tentativas,
        contato: 100 * h.taxa,
        contatoEsp: h.taxa_esperada == null ? null : 100 * h.taxa_esperada,
        aderencia: h.aderencia == null ? null : Math.round(1000 * h.aderencia) / 10,
        alo: h.tentativas ? (100 * h.alo_robo) / h.tentativas : 0,
        aberta: h.aberta,
        contatos: h.contatos,
        contatosEsp: h.contatos_esperados,
      })),
    [visao],
  );

  const pulso = useMemo(
    () =>
      (data?.serie_dia || []).map((p) => ({
        ts: p.ts,
        contato: p.tentativas ? (100 * p.contatos) / p.tentativas : 0,
        sucesso100: p.tentativas ? (100_000 * p.sucesso) / p.tentativas : 0,
      })),
    [data],
  );

  const retentativa = visao ? ganhoRetentativa(visao.curva) : null;
  const semRobo = !!visao && visao.alo_robo === 0;
  const recorteVazio = !!visao && campanha !== 'TODAS' && visao.mailings.length === 0;
  const rankingVendas = useMemo(() => (visao ? rankingPropensao(visao.mailings) : []), [visao]);
  const maxSucesso1mi = rankingVendas[0]?.sucesso_1mi || 1;
  const focoMailing = useMemo(
    () => (visao && focoMailingId != null ? visao.mailings.find((m) => m.id === focoMailingId) ?? null : null),
    [visao, focoMailingId],
  );
  const regioesDrill = useMemo(() => {
    if (!data || !visao) return [];
    if (focoMailing && campanha === 'TODAS') {
      return montarVisao(data, focoMailing.campanha_op).por_regiao;
    }
    return visao.por_regiao;
  }, [data, visao, focoMailing, campanha]);
  const temPenetracaoRegiao = regioesDrill.some((r) => r.pct_virgin != null);

  const chips = CAMPANHA_FILTRO_OPTIONS.map((o) => ({ id: o.id, label: o.label }));

  return (
    <AdminLayout
      title="Mailing"
      subtitle="Saúde da base: tentativas por telefone, propensão, fôlego e desgaste · live a cada 10 min ou snapshot do dia"
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SegControl
          value={tab}
          onChange={(id) => setTab(id as EvaTabModo)}
          options={LIVE_HIST_OPTIONS}
          ariaLabel="Modo mailing"
        />
        {tab === 'hist' ? (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Dia
            <select
              className="input-field text-xs py-1.5"
              value={histDate}
              onChange={(e) => {
                const v = e.target.value;
                setHistDate(v);
                setDateToStore(v);
              }}
              aria-label="Data do histórico de mailing"
            >
              {datasHist.length === 0 ? <option value={histDate}>{histDate}</option> : null}
              {datasHist.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <ChipBar chips={chips} active={campanha} onChange={(id) => setCampanha(id)} ariaLabel="Campanha" />
        <button
          type="button"
          onClick={() => void carregar()}
          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1 ml-auto"
          disabled={carregando}
        >
          <RefreshCw size={12} className={carregando ? 'animate-spin' : ''} /> Atualizar
        </button>
        {data ? (
          <span className="text-[11px] text-gray-400">
            {tab === 'live' ? `EVA ${data.updated_at.slice(11, 16)} · a cada 10 min` : `Snapshot ${data.data} · ${data.updated_at.slice(11, 16)}`}
          </span>
        ) : null}
      </div>

      <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900" role="status">
        O filtro de produto recalcula KPIs, curva, hora, insistência, distribuição, tabela e recomendações do recorte.
        Pulso do dia permanece na visão geral.
        {tab === 'hist'
          ? ' Histórico = snapshot selado do dia (arquivo do coletor; não mistura com o live).'
          : datasHist.length
            ? ` Histórico: ${datasHist.length} dia(s) no índice — abra o modo Histórico.`
            : ' Histórico começa a acumular após a primeira coleta do dia.'}
      </div>

      {atrasado ? (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
          <div>
            <div className="font-semibold">Saúde do mailing atrasada</div>
            <div className="text-xs mt-0.5">
              Última coleta há ~{Math.round(atraso)} min. O coletor roda das 8h às 21h; fora disso o número é do último ciclo.
            </div>
          </div>
        </div>
      ) : null}

      {erro ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {erro}
        </div>
      ) : null}

      {recorteVazio ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          Nenhum mailing de <strong>{labelCampanhaOp(campanha)}</strong> neste snapshot. Os zeros abaixo são do filtro, não do dia inteiro — escolha outro produto ou “Todas”.
        </div>
      ) : null}

      {!visao ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6" aria-busy>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="card p-4 h-24 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <KpiCard
              icon={PhoneCall}
              label="Tentativas"
              value={fmtNum(visao.tentativas)}
              footer={`${fmtNum(visao.phones)} telefones · giro ${fmtNum(visao.giro, 2)}`}
            />
            <KpiCard
              icon={Bot}
              label="Alô robô"
              value={semRobo ? '—' : fmtNum(visao.alo_robo)}
              footer={semRobo ? 'campanha sem robô na frente' : `${fmtPct(visao.taxa_alo)} das tentativas`}
            />
            <KpiCard
              icon={Users}
              label="Contato (agente)"
              value={fmtNum(visao.contatos)}
              footer={
                semRobo
                  ? `${fmtPct(visao.taxa_contato, 3)} das tentativas`
                  : `${fmtPct(visao.taxa_contato, 3)} · transf. ${fmtPct(visao.taxa_transferencia, 1)} do alô`
              }
            />
            <KpiCard
              icon={Zap}
              label="Sucesso"
              value={fmtNum(visao.sucesso)}
              footer={`${fmtNum(visao.sucesso_1mi, 0)} / 1 mi · ${fmtNum(visao.sucesso_100mil, 1)} / 100 mil`}
            />
            <KpiCard
              icon={Activity}
              label="Próxima hora"
              value={`${fmtNum(visao.previsao_contatos)} contatos`}
              footer={`faixa 90%: ${fmtNum(visao.previsao_contatos_ic[0])}–${fmtNum(visao.previsao_contatos_ic[1])} · ~${fmtNum(visao.previsao_sucesso, 1)} sucessos`}
            />
            <KpiCard
              icon={Battery}
              label="Fôlego"
              value={visao.folego_dias == null ? '—' : `${fmtNum(visao.folego_dias, 1)} dia`}
              warn={visao.folego_dias != null && visao.folego_dias < FOLEGO_ALERTA_DIAS}
              footer={`${fmtNum(visao.disponiveis)} disponíveis no ritmo de hoje`}
            />
            <KpiCard
              icon={Gauge}
              label="Desgaste médio"
              value={visao.desgaste_medio == null ? '—' : `${visao.desgaste_medio}/100`}
              warn={(visao.desgaste_medio ?? 0) >= 35}
              critical={(visao.desgaste_medio ?? 0) >= 60}
              footer="ponderado por tentativas"
            />
            <KpiCard
              icon={Repeat}
              label="Insistência"
              value={visao.insistencia_pct == null ? '—' : `${fmtNum(visao.insistencia_pct, 1)}%`}
              footer={
                campanha === 'TODAS'
                  ? 'das tentativas em telefones com 5+ no dia'
                  : visao.insistencia_pct == null
                    ? visao.dist_cobertura_completa
                      ? 'sem volume para insistência neste recorte'
                      : 'dist. incompleta nos mailings — não inventamos o %'
                    : 'recalculada no recorte (cobertura completa)'
              }
            />
            <KpiCard
              icon={TrendingDown}
              label="Tendência do contato"
              value={
                visao.tendencia.pontos < 3
                  ? '—'
                  : `${visao.tendencia.rel_hora > 0 ? '+' : ''}${Math.round(100 * visao.tendencia.rel_hora)}%/h`
              }
              warn={visao.tendencia.significativa && visao.tendencia.rel_hora < -0.05}
              footer={
                visao.tendencia.pontos < 3
                  ? 'poucas horas fechadas'
                  : visao.tendencia.significativa
                    ? `significativa (t = ${fmtNum(visao.tendencia.t, 1)})`
                    : `ruído, não confirmada (t = ${fmtNum(visao.tendencia.t, 1)})`
              }
            />
            <KpiCard
              icon={Target}
              label="Retentativa"
              value={retentativa == null ? '—' : `${fmtNum(retentativa, 1)}×`}
              footer="contato na 2ª tentativa ÷ na 1ª"
            />
            <KpiCard
              icon={TrendingUp}
              label="Aderência vs expectativa"
              value={
                visao.aderencia_media == null
                  ? '—'
                  : `${fmtNum(100 * visao.aderencia_media, 0)}%`
              }
              warn={visao.aderencia_media != null && visao.aderencia_media < 0.85}
              footer="contato real ÷ esperado (horas fechadas)"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-6">
            <section className="card p-5 shadow-sm xl:col-span-2">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag size={16} className="text-teal-700" />
                <h3 className="text-sm font-bold text-gray-800">Comportamento de vendas</h3>
              </div>
              <p className="text-[11px] text-gray-400 mb-4">
                Funil do recorte{campanha !== 'TODAS' ? ` · ${labelCampanhaOp(campanha)}` : ''}: conversão entre etapas e vs tentativas.
              </p>
              <div className="space-y-3">
                {visao.funil.map((et, i) => {
                  const largura = Math.max(8, 100 * et.convBase);
                  const cores = ['bg-slate-400', 'bg-amber-400', 'bg-indigo-500', 'bg-teal-600'];
                  const cor = cores[Math.min(i, cores.length - 1)];
                  return (
                    <div key={et.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-gray-700">{et.label}</span>
                        <span className="tabular-nums text-gray-600">
                          {fmtNum(et.valor)}
                          {et.convAnterior != null ? (
                            <span className="text-gray-400 ml-2">
                              · {fmtPct(et.convAnterior, et.id === 'sucesso' ? 1 : 2)} da etapa ant.
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${cor}`} style={{ width: `${largura}%` }} />
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                        {fmtPct(et.convBase, et.id === 'sucesso' ? 3 : 2)} das tentativas
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Conversão contato→venda</div>
                  <div className="text-lg font-bold text-teal-800 tabular-nums">{fmtPct(visao.taxa_sucesso_contato, 1)}</div>
                  <div className="text-[10px] text-gray-400">{fmtNum(visao.sucesso)} de {fmtNum(visao.contatos)} contatos</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Eficácia (venda/tentativa)</div>
                  <div className="text-lg font-bold text-indigo-800 tabular-nums">
                    {fmtPct(visao.tentativas ? visao.sucesso / visao.tentativas : 0, 3)}
                  </div>
                  <div className="text-[10px] text-gray-400">mesmo ritmo do recorte filtrado</div>
                </div>
              </div>
            </section>

            <section className="card p-5 shadow-sm xl:col-span-3">
              <h3 className="text-sm font-bold text-gray-800">Estimativa por 1 milhão de tentativas</h3>
              <p className="text-[11px] text-gray-400 mb-3">
                Se o recorte mantiver o ritmo atual, quantas vendas saem a cada 1 milhão de discagens (IC 95% Wilson).
              </p>
              <div className="flex flex-wrap items-end gap-6 mb-4">
                <div>
                  <div className="text-3xl font-bold text-teal-800 tabular-nums tracking-tight">
                    {fmtNum(visao.sucesso_1mi, 0)}
                  </div>
                  <div className="text-xs text-gray-500">vendas / 1 milhão</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    faixa 95%: {fmtNum(visao.sucesso_1mi_ic[0], 0)}–{fmtNum(visao.sucesso_1mi_ic[1], 0)}
                    {' · '}
                    {fmtNum(visao.sucesso_100mil, 1)} / 100 mil
                  </div>
                </div>
                <div className="text-xs text-gray-500 max-w-xs leading-relaxed">
                  Com {fmtNum(visao.tentativas)} tentativas hoje → {fmtNum(visao.sucesso)} vendas.
                  Em 1 milhão no mesmo rendimento: ~{fmtNum(visao.sucesso_1mi, 0)} vendas.
                </div>
              </div>
              {rankingVendas.length ? (
                <>
                  <h4 className="text-xs font-semibold text-gray-600 mb-2">Mailings do recorte (propensão)</h4>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={rankingVendas}
                        layout="vertical"
                        margin={{ top: 0, right: 12, left: 4, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v: number) => fmtNum(v, 0)}
                        />
                        <YAxis type="category" dataKey="nome" width={100} tick={{ fontSize: 10 }} />
                        <Tooltip
                          formatter={(v, name) =>
                            name === 'sucesso_1mi'
                              ? [fmtNum(Number(v), 0), 'Vendas / 1 mi']
                              : [`${(100 * Number(v)).toFixed(1)}%`, 'Conv. contato']
                          }
                          labelFormatter={(l, p) => {
                            const row = p?.[0]?.payload as { tentativas?: number; campanha_op?: string } | undefined;
                            return `${l} · ${labelCampanhaOp(row?.campanha_op)} · ${fmtNum(row?.tentativas)} tent.`;
                          }}
                        />
                        <Bar dataKey="sucesso_1mi" name="sucesso_1mi" radius={[0, 4, 4, 0]}>
                          {rankingVendas.map((r) => (
                            <Cell
                              key={r.id}
                              fill={r.sucesso_1mi >= 0.85 * maxSucesso1mi ? '#0f766e' : '#6366f1'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-400">Sem mailings com volume suficiente (≥500 tentativas) neste recorte.</p>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <section className="card p-5 shadow-sm">
              <h3 className="text-sm font-bold text-gray-800">Chance de contato por tentativa</h3>
              <p className="text-[11px] text-gray-400 mb-3">
                Barra: P(contato na k-ésima tentativa, sem contato antes), com IC 95%. Linha: chance acumulada até k. Telefone × mailing, no dia.
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={curvaChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="h" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(2)}%`} />
                    <YAxis yAxisId="a" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
                    <Tooltip
                      formatter={(v, name) => {
                        if (Array.isArray(v)) return [`${Number(v[0]).toFixed(3)}% – ${Number(v[1]).toFixed(3)}%`, 'IC 95%'];
                        return [`${Number(v).toFixed(3)}%`, String(name)];
                      }}
                      labelFormatter={(l, p) => {
                        const r = p?.[0]?.payload as { em_risco?: number } | undefined;
                        return `${l} tentativa · ${fmtNum(r?.em_risco)} telefones ainda sem contato`;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area yAxisId="h" dataKey="faixa" name="IC 95%" stroke="none" fill="#c7d2fe" fillOpacity={0.5} />
                    <Bar yAxisId="h" dataKey="taxa" name="Contato na tentativa" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="a" dataKey="acumulada" name="Acumulada" stroke="#0f766e" strokeWidth={2} dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {retentativa != null && retentativa > 1.5 ? (
                <p className="text-[11px] text-emerald-700 mt-2">
                  A 2ª tentativa contata {fmtNum(retentativa, 1)}× mais que a 1ª: o discador volta em quem deu sinal de vida. Cortar retentativa aqui perderia contato.
                </p>
              ) : null}
            </section>

            <section className="card p-5 shadow-sm">
              <h3 className="text-sm font-bold text-gray-800">Ritmo e contato por hora</h3>
              <p className="text-[11px] text-gray-400 mb-3">
                Barra: tentativas. Linha cheia: contato real %. Tracejada: expectativa (taxa ponderada das horas fechadas anteriores).
                Aderência = real ÷ esperado. Hora aberta atualiza a cada coleta; fechadas ficam estáticas.
                {semRobo ? '' : ' Linha âmbar: alô robô %.'}
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={horaChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="t" tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmtNum(v / 1000) + 'k'} />
                    <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(2)}%`} />
                    <Tooltip
                      formatter={(v, name) => {
                        if (v == null || Number.isNaN(Number(v))) return ['—', String(name)];
                        if (name === 'Tentativas') return [fmtNum(Number(v)), String(name)];
                        if (name === 'Aderência %') return [`${Number(v).toFixed(1)}%`, String(name)];
                        return [`${Number(v).toFixed(3)}%`, String(name)];
                      }}
                      labelFormatter={(l, p) => {
                        const row = p?.[0]?.payload as {
                          aberta?: boolean;
                          contatos?: number;
                          contatosEsp?: number | null;
                        } | undefined;
                        const modo = row?.aberta ? 'aberta (dinâmica)' : 'fechada (estática)';
                        const esp =
                          row?.contatosEsp != null
                            ? ` · esp. ${fmtNum(row.contatosEsp, 0)} contatos`
                            : '';
                        return `${l} · ${modo}${esp}`;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="t" dataKey="tentativas" name="Tentativas" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Line
                      yAxisId="p"
                      dataKey="contatoEsp"
                      name="Expectativa contato %"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls={false}
                    />
                    <Line yAxisId="p" dataKey="contato" name="Contato real %" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                    <Line
                      yAxisId="p"
                      dataKey="aderencia"
                      name="Aderência %"
                      stroke="#0f766e"
                      strokeWidth={1.5}
                      dot={{ r: 2 }}
                      connectNulls={false}
                    />
                    {semRobo ? null : (
                      <Line yAxisId="p" dataKey="alo" name="Alô robô %" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Expectativa da 1ª hora do dia fica vazia (sem base anterior). Aderência &gt; 100% = contato acima do ritmo acumulado até então.
              </p>
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            <section className="card p-5 shadow-sm xl:col-span-2">
              <h3 className="text-sm font-bold text-gray-800 mb-3">Recomendações</h3>
              {visao.recomendacoes.length === 0 ? (
                <p className="text-sm text-gray-500">Nada fora do normal com volume suficiente para afirmar.</p>
              ) : (
                <ul className="space-y-2">
                  {visao.recomendacoes.map((r, i) => {
                    const n = NIVEL[r.nivel] || NIVEL.alerta;
                    const Icon = n.icon;
                    return (
                      <li key={`${r.tipo}-${i}`} className={`rounded-lg border px-3 py-2 text-sm flex gap-2 ${n.cls}`}>
                        <Icon size={16} className="mt-0.5 shrink-0" />
                        <div>
                          <div className="font-semibold">{r.titulo}</div>
                          <div className="text-xs opacity-90">{r.texto}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="card p-5 shadow-sm">
              <h3 className="text-sm font-bold text-gray-800">Tentativas por telefone</h3>
              <p className="text-[11px] text-gray-400 mb-3">
                {campanha === 'TODAS'
                  ? 'Visão geral do dia, todas as campanhas.'
                  : visao.dist_cobertura_completa && visao.distribuicao.length
                    ? `Recorte ${labelCampanhaOp(campanha)} (cobertura completa).`
                    : `Recorte ${labelCampanhaOp(campanha)} — distribuição só aparece com dist. em todos os mailings do filtro.`}
              </p>
              <div className="space-y-2">
                {visao.distribuicao.map((d) => (
                  <div key={d.n}>
                    <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                      <span>{d.rotulo} tentativa{d.rotulo === '1' ? '' : 's'}</span>
                      <span className="tabular-nums">
                        {fmtNum(d.phones)} · {fmtNum(d.pct, 1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-indigo-500/80 rounded-full" style={{ width: `${Math.min(100, d.pct)}%` }} />
                    </div>
                  </div>
                ))}
                {!visao.distribuicao.length ? (
                  <p className="text-xs text-gray-400">
                    {campanha !== 'TODAS' && !visao.dist_cobertura_completa
                      ? 'Cobertura parcial — preferimos “—” a um % subestimado.'
                      : 'Sem distribuição neste recorte.'}
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          {pulso.length >= 2 && campanha === 'TODAS' && tab === 'live' ? (
            <section className="card p-5 shadow-sm mb-6">
              <h3 className="text-sm font-bold text-gray-800">Pulso do dia</h3>
              <p className="text-[11px] text-gray-400 mb-3">Acumulado do dia a cada coleta: contato % e sucesso por 100 mil tentativas.</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={pulso} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="ts" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="c" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(2)}%`} />
                    <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="c" dataKey="contato" name="Contato %" stroke="#6366f1" dot={false} strokeWidth={2} />
                    <Line yAxisId="s" dataKey="sucesso100" name="Sucesso / 100 mil" stroke="#0f766e" dot={false} strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

          {evolucaoChart.length >= 1 && campanha === 'TODAS' ? (
            <section className="card p-5 shadow-sm mb-6">
              <h3 className="text-sm font-bold text-gray-800">Evolução entre dias</h3>
              <p className="text-[11px] text-gray-400 mb-3">
                Índice dos últimos {evolucaoChart.length} dia(s) selado(s)
                {evolucaoChart.length < 2 ? ' · a série completa aparece com 2+ dias (backfill ou coletas diárias)' : ''}
                {' · contato %, sucesso/100 mil e desgaste médio.'}
              </p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={evolucaoChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="c" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(2)}%`} />
                    <YAxis yAxisId="s" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="c" dataKey="contato" name="Contato %" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                    <Line yAxisId="s" dataKey="sucesso100" name="Sucesso / 100 mil" stroke="#0f766e" strokeWidth={2} dot={{ r: 2 }} />
                    <Line yAxisId="s" dataKey="desgaste" name="Desgaste médio" stroke="#c2410c" strokeWidth={1.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

          <section className="card p-0 shadow-sm mb-6 overflow-hidden">
            <div className="px-5 pt-4 pb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Mailings do dia</h3>
                <p className="text-[11px] text-gray-400">
                  Drill produto → lista: clique na linha para focar a praça. Score relativo (100 = melhor · 2.000+ tent.).
                  Virgin % / esgotado % = penetração do estoque da lista.
                </p>
              </div>
              {focoMailing ? (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-indigo-700 underline"
                  onClick={() => setFocoMailingId(null)}
                >
                  Limpar foco · {focoMailing.nome_curto}
                </button>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2">Mailing</th>
                    <SortTh label="Tentativas" col="tentativas" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <SortTh label="Giro" col="giro" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <SortTh label="Contato" col="contato" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <SortTh label="Vendas/1 mi" col="sucesso" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <SortTh label="Score" col="score" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <SortTh label="Virgin %" col="virgin" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <SortTh label="Esgotado %" col="esgotado" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <th className="text-right px-3 py-2">Próx. hora</th>
                    <th className="text-right px-3 py-2">Tendência</th>
                    <SortTh label="Fôlego" col="folego" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <SortTh label="Desgaste" col="desgaste" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((m) => {
                    const st = statusDesgaste(m.desgaste.status);
                    const curto = m.folego_dias != null && m.folego_dias < FOLEGO_ALERTA_DIAS;
                    const virgin = pctVirginEstoque(m);
                    const esgotado = pctEsgotadoEstoque(m);
                    const focado = focoMailingId === m.id;
                    return (
                      <tr
                        key={m.id}
                        className={`border-t border-gray-100 cursor-pointer ${focado ? 'bg-indigo-50/80' : 'hover:bg-gray-50/60'}`}
                        onClick={() => setFocoMailingId((cur) => (cur === m.id ? null : m.id))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setFocoMailingId((cur) => (cur === m.id ? null : m.id));
                          }
                        }}
                        tabIndex={0}
                        aria-pressed={focado}
                      >
                        <td className="px-3 py-2">
                          <div className="font-semibold text-indigo-800" title={m.nome}>{m.nome_curto}</div>
                          <div className="text-[10px] text-gray-400">{labelCampanhaOp(m.campanha_op)}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(m.hoje.tentativas)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(m.hoje.giro, 2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtPct(m.hoje.taxa_contato, 3)}
                          <div className="text-[10px] text-gray-400">{fmtNum(m.hoje.contatos)} contatos</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtNum(10 * m.propensao.sucesso_100mil, 0)}
                          <div className="text-[10px] text-gray-400">
                            {fmtNum(m.propensao.sucesso_100mil, 1)}/100 mil · IC:{' '}
                            {fmtNum(10 * m.propensao.sucesso_100mil_ic[0], 0)}–{fmtNum(10 * m.propensao.sucesso_100mil_ic[1], 0)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {m.propensao.score == null ? <span className="text-gray-300">—</span> : m.propensao.score}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {virgin == null ? '—' : fmtPct(virgin, 1)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {esgotado == null ? '—' : fmtPct(esgotado, 1)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtNum(m.previsao_hora.contatos, 1)}
                          <div className="text-[10px] text-gray-400">
                            {fmtNum(m.previsao_hora.contatos_ic[0], 0)}–{fmtNum(m.previsao_hora.contatos_ic[1], 0)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <TendenciaSeta rel={m.tendencia.rel_hora} sig={m.tendencia.significativa} />
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${curto ? 'text-red-600 font-semibold' : ''}`}>
                          {m.folego_dias == null ? '—' : `${fmtNum(m.folego_dias, 1)} d`}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${st.cls}`}>
                            {m.desgaste.indice} · {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {regioesDrill.length > 0 ? (
            <section className="card p-0 shadow-sm mb-6 overflow-hidden">
              <div className="px-5 pt-4 pb-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                  {focoMailing
                    ? labelCampanhaOp(focoMailing.campanha_op)
                    : campanha === 'TODAS'
                      ? 'Produto'
                      : labelCampanhaOp(campanha)}
                  {focoMailing ? ` → ${focoMailing.nome_curto}` : ''} → Praça
                </div>
                <h3 className="text-sm font-bold text-gray-800">Visão por região</h3>
                <p className="text-[11px] text-gray-400">
                  Share = esforço de dial na praça.
                  {temPenetracaoRegiao
                    ? ' Virgin/saturado dia = phones com 1 ou 8+ tentativas hoje (penetração regional).'
                    : ' Penetração regional entra na próxima coleta do coletor.'}
                  {focoMailing
                    ? ` Foco lista: virgin ${pctVirginEstoque(focoMailing) == null ? '—' : fmtPct(pctVirginEstoque(focoMailing)!, 1)} · esgotado ${pctEsgotadoEstoque(focoMailing) == null ? '—' : fmtPct(pctEsgotadoEstoque(focoMailing)!, 1)}.`
                    : ''}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2">Região</th>
                      <th className="text-right px-3 py-2">Share</th>
                      <th className="text-right px-3 py-2">Tentativas</th>
                      <th className="text-right px-3 py-2">Contato %</th>
                      {temPenetracaoRegiao ? (
                        <>
                          <th className="text-right px-3 py-2">Virgin dia</th>
                          <th className="text-right px-3 py-2">Saturado dia</th>
                        </>
                      ) : null}
                      <th className="text-right px-3 py-2">Sucesso</th>
                      <th className="text-right px-3 py-2">Vendas/1 mi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regioesDrill.map((r) => (
                      <tr key={r.regiao} className="border-t border-gray-100 hover:bg-gray-50/60">
                        <td className="px-3 py-2 font-semibold text-gray-800">{r.regiao}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.share_pct, 1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.tentativas)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.taxa_contato, 3)}</td>
                        {temPenetracaoRegiao ? (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {r.pct_virgin == null ? '—' : fmtPct(r.pct_virgin, 1)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {r.pct_saturado == null ? '—' : fmtPct(r.pct_saturado, 1)}
                            </td>
                          </>
                        ) : null}
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.sucesso)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNum(r.sucesso_1mi, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {data ? (
            <details className="card p-4 text-xs text-gray-600 mb-6">
              <summary className="cursor-pointer font-semibold text-gray-700">Como ler esta aba</summary>
              <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                {Object.entries(data.definicoes).map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-semibold capitalize">{k.replace(/_/g, ' ')}</dt>
                    <dd className="text-gray-500">{v}</dd>
                  </div>
                ))}
                <div>
                  <dt className="font-semibold">Fôlego</dt>
                  <dd className="text-gray-500">Registros disponíveis ÷ telefones discados hoje. Abaixo de {FOLEGO_ALERTA_DIAS} dia pede reposição.</dd>
                </div>
                <div>
                  <dt className="font-semibold">Próxima hora</dt>
                  <dd className="text-gray-500">Ritmo da última hora fechada × taxa do mailing encolhida para a do dia. Faixa de 90% (Poisson).</dd>
                </div>
              </dl>
            </details>
          ) : null}
        </>
      )}
    </AdminLayout>
  );
}

export default MailingPage;
