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
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import {
  Area,
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
import { ChipBar, KpiCard } from '../components/ui';
import { SortTh } from '../components/SortTh';
import { labelCampanhaOp, isCampanhaOpValida, type CampanhaOp } from '../lib/evaDash';
import { MAILING_ATRASO_MIN, fetchMailingSaude, minutosDesde } from '../lib/mailingSaude';
import {
  FOLEGO_ALERTA_DIAS,
  campanhasDisponiveis,
  fmtNum,
  fmtPct,
  ganhoRetentativa,
  montarVisao,
  statusDesgaste,
  type CampanhaMailing,
} from '../lib/mailingVisoes';
import { useFiltroEvaStore } from '../store/filtroStore';
import type { MailingItem, MailingSaude } from '../../shared/contracts/mailing';

const POLL_MS = 120_000;

type SortKey = 'tentativas' | 'contato' | 'sucesso' | 'score' | 'folego' | 'desgaste' | 'giro';

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
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const campanhaStore = useFiltroEvaStore((s) => s.campanha);
  const setCampanhaStore = useFiltroEvaStore((s) => s.setCampanha);
  const [campanha, setCampanhaLocal] = useState<CampanhaMailing>(campanhaStore);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'tentativas', dir: 'desc' });
  const [agora, setAgora] = useState(() => new Date());
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
    try {
      const d = await fetchMailingSaude(ac.signal);
      setData(d);
      setErro(d ? null : 'O coletor ainda não publicou a saúde do mailing hoje.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErro((e as Error).message);
    } finally {
      if (abortRef.current === ac) setCarregando(false);
      setAgora(new Date());
    }
  }, []);

  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar();
    }, POLL_MS);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [carregar]);

  const campanhas = useMemo(() => (data ? campanhasDisponiveis(data) : []), [data]);
  useEffect(() => {
    // Campanha do store pode não ter mailing hoje: mostra TODAS só nesta aba, sem limpar o filtro EVA das outras páginas.
    if (campanha !== 'TODAS' && data && !campanhas.includes(campanha)) setCampanhaLocal('TODAS');
  }, [campanha, campanhas, data]);

  const visao = useMemo(() => (data ? montarVisao(data, campanha) : null), [data, campanha]);
  const atraso = data ? minutosDesde(data.updated_at, agora) : 0;
  const atrasado = !!data && atraso > MAILING_ATRASO_MIN;

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
      (visao?.serie_hora || []).map((h) => ({
        hora: `${h.hora}h`,
        tentativas: h.tentativas,
        contato: 100 * h.taxa,
        alo: h.tentativas ? (100 * h.alo_robo) / h.tentativas : 0,
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

  const chips = [
    { id: 'TODAS', label: 'Todas' },
    ...campanhas.map((c) => ({ id: c, label: labelCampanhaOp(c) })),
  ];

  return (
    <AdminLayout
      title="Mailing"
      subtitle="Saúde da base ao vivo: tentativas por telefone, propensão, fôlego e desgaste · sem histórico por data (coletor do dia)"
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
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
            EVA {data.updated_at.slice(11, 16)} · a cada 10 min · só o dia corrente
          </span>
        ) : null}
      </div>

      <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900" role="status">
        Esta aba é <strong>somente live do dia</strong>. Filtro de campanha recalcula KPIs, curva, hora, tabela e recomendações do recorte.
        Insistência, distribuição de tentativas e pulso ficam na visão geral (todas). Não há seletor de datas — use Discagens/Operação para histórico EVA.
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
              footer={`${fmtNum(visao.sucesso_100mil, 1)} por 100 mil tentativas`}
            />
            <KpiCard
              icon={Activity}
              label="Próxima hora"
              value={`${fmtNum(visao.previsao_contatos)} contatos`}
              footer={`90%: ${fmtNum(visao.previsao_contatos_ic[0])}–${fmtNum(visao.previsao_contatos_ic[1])} · ~${fmtNum(visao.previsao_sucesso, 1)} sucessos`}
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
              value={campanha === 'TODAS' && data ? `${fmtNum(data.resumo.insistencia_pct, 1)}%` : '—'}
              footer={campanha === 'TODAS' ? 'das tentativas em telefones com 5+ no dia' : 'só na visão geral'}
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
                Barra: tentativas. Linha: contato de agente ÷ tentativas{semRobo ? '' : ' e alô robô ÷ tentativas'}. A hora corrente ainda está aberta.
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={horaChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                    <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="t" tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmtNum(v / 1000) + 'k'} />
                    <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(2)}%`} />
                    <Tooltip
                      formatter={(v, name) =>
                        name === 'Tentativas' ? [fmtNum(Number(v)), String(name)] : [`${Number(v).toFixed(3)}%`, String(name)]
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="t" dataKey="tentativas" name="Tentativas" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="p" dataKey="contato" name="Contato %" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                    {semRobo ? null : (
                      <Line yAxisId="p" dataKey="alo" name="Alô robô %" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
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
              <p className="text-[11px] text-gray-400 mb-3">Visão geral do dia, todas as campanhas.</p>
              <div className="space-y-2">
                {(data?.distribuicao || []).map((d) => (
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
              </div>
            </section>
          </div>

          {pulso.length >= 2 && campanha === 'TODAS' ? (
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

          <section className="card p-0 shadow-sm mb-6 overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-sm font-bold text-gray-800">Mailings do dia</h3>
              <p className="text-[11px] text-gray-400">
                Score = sucesso por 100 mil tentativas relativo ao melhor mailing da mesma campanha (100 = melhor). Só com 2.000+ tentativas.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2">Mailing</th>
                    <SortTh label="Tentativas" col="tentativas" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <SortTh label="Giro" col="giro" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <SortTh label="Contato" col="contato" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <SortTh label="Sucesso/100 mil" col="sucesso" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
                    <SortTh label="Score" col="score" sortKey={sort.key} sortDir={sort.dir} onSort={onSort} align="right" />
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
                    return (
                      <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-gray-800" title={m.nome}>{m.nome_curto}</div>
                          <div className="text-[10px] text-gray-400">{labelCampanhaOp(m.campanha_op)}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(m.hoje.tentativas)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(m.hoje.giro, 2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtPct(m.hoje.taxa_contato, 3)}
                          <div className="text-[10px] text-gray-400">{fmtNum(m.hoje.contatos)} contatos</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtNum(m.propensao.sucesso_100mil, 1)}
                          <div className="text-[10px] text-gray-400">
                            90%: {fmtNum(m.propensao.sucesso_100mil_ic[0], 1)}–{fmtNum(m.propensao.sucesso_100mil_ic[1], 1)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {m.propensao.score == null ? <span className="text-gray-300">—</span> : m.propensao.score}
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
