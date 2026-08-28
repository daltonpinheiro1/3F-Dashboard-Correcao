import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Clock,
  Download,
  FileCheck,
  FileX,
  FolderOpen,
  Link2,
  Loader2,
  Users,
} from 'lucide-react';
import { KpiCard } from '../ui/KpiCard';
import { ChipBar } from '../ui/TabBar';
import { agregarGerencialAno, INSS_DIAS_LIMIAR } from '../../lib/atestadosGerencial';
import { detectarPadroesAbsenteismo } from '../../lib/atestadosAbsenteismo';
import { calcularInssSla, ordenarInssPorSla } from '../../lib/atestadosInssSla';
import { exportAtestadosExcel, exportEsocialAfastamento, exportGerencialResumo, exportInssRelatorio } from '../../lib/atestadosExport';
import { AtestadoEmptyState } from './AtestadoEmptyState';
import {
  carregarEvaParaAtestados,
  listarCruzamentos,
  type EvaCruzamentoItem,
} from '../../lib/atestadosEvaCruzamento';
import { ORIGEM_LABELS, STATUS_LABELS, TIPO_LABELS, type Atestado, type AtestadoTipo } from '../../lib/atestadosEscala';

type SubTab = 'visao' | 'inss' | 'eva' | 'duplicidades' | 'absenteismo';

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#6b7280'];

export function GerencialPanel({
  rows,
  ano,
  onAnoChange,
}: {
  rows: Atestado[];
  ano: number;
  onAnoChange: (y: number) => void;
}) {
  const [sub, setSub] = useState<SubTab>('visao');
  const [evaLoading, setEvaLoading] = useState(false);
  const [cruzamentos, setCruzamentos] = useState<EvaCruzamentoItem[]>([]);

  const g = useMemo(() => agregarGerencialAno(rows, ano), [rows, ano]);
  const anoRows = useMemo(
    () =>
      rows.filter((r) => {
        const ref = r.data_inicio || r.created_at?.slice(0, 10) || '';
        return ref.startsWith(String(ano));
      }),
    [rows, ano],
  );

  const anos = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const r of rows) {
      const ref = r.data_inicio || r.created_at?.slice(0, 10);
      if (ref) set.add(Number(ref.slice(0, 4)));
    }
    return [...set].sort((a, b) => b - a);
  }, [rows]);

  const tiposOrdenados = (Object.keys(g.por_tipo) as AtestadoTipo[])
    .filter((t) => g.por_tipo[t].count > 0)
    .sort((a, b) => g.por_tipo[b].count - g.por_tipo[a].count);

  const chartMes = g.por_mes.map((m) => ({
    name: m.label,
    atestados: m.count,
    dias: m.dias,
  }));

  const pieTipo = tiposOrdenados.map((t) => ({
    name: TIPO_LABELS[t],
    value: g.por_tipo[t].count,
  }));

  const lineDias = g.por_mes.map((m) => ({ name: m.label, dias: m.dias, horas: m.horas }));

  useEffect(() => {
    if (sub !== 'eva') return;
    let cancelled = false;
    setEvaLoading(true);
    void (async () => {
      const evaMap = await carregarEvaParaAtestados(rows, ano);
      if (!cancelled) {
        setCruzamentos(listarCruzamentos(rows, evaMap, ano));
        setEvaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sub, rows, ano]);

  const evaAlertas = cruzamentos.filter((c) => c.resumo === 'alerta');
  const inssOrdenados = useMemo(() => ordenarInssPorSla(g.inss_longos), [g.inss_longos]);
  const padroes = useMemo(() => detectarPadroesAbsenteismo(anoRows), [anoRows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <label className="text-sm text-gray-600 flex items-center gap-2">
          <Calendar size={14} />
          Ano
          <select className="input text-sm" value={ano} onChange={(e) => onAnoChange(Number(e.target.value))}>
            {anos.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-xs flex items-center gap-1" onClick={() => exportGerencialResumo(anoRows, ano, g)}>
            <Download size={12} /> Resumo mensal
          </button>
          <button type="button" className="btn-secondary text-xs flex items-center gap-1" onClick={() => exportAtestadosExcel(anoRows, ano)}>
            <Download size={12} /> Detalhado
          </button>
          {g.inss_longos.length > 0 && (
            <button type="button" className="btn-secondary text-xs flex items-center gap-1" onClick={() => exportInssRelatorio(g.inss_longos, ano)}>
              <Download size={12} /> Relatório INSS
            </button>
          )}
          <button type="button" className="btn-secondary text-xs flex items-center gap-1" onClick={() => exportEsocialAfastamento(anoRows, ano)}>
            <Download size={12} /> eSocial S-2230 (CSV)
          </button>
        </div>
      </div>

      <ChipBar
        chips={[
          { id: 'visao', label: 'Visão geral' },
          { id: 'inss', label: `INSS (+${INSS_DIAS_LIMIAR}d)`, badge: g.inss_longos.length },
          { id: 'eva', label: 'Cruzamento EVA', badge: evaAlertas.length || undefined },
          { id: 'duplicidades', label: 'Duplicidades', badge: g.duplicidades.length || undefined },
          { id: 'absenteismo', label: 'Padrões', badge: padroes.length || undefined },
        ]}
        active={sub}
        onChange={(id) => setSub(id as SubTab)}
        ariaLabel="Seções gerenciais"
        variant="brand"
      />

      {sub === 'visao' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <KpiCard label="Total" value={g.total} icon={FolderOpen} />
            <KpiCard label="Aprovados" value={g.aprovados} icon={FileCheck} />
            <KpiCard label="Pendentes" value={g.protocolados + g.em_analise} icon={Clock} warn={g.protocolados > 0} />
            <KpiCard label="Taxa aprovação" value={`${g.taxa_aprovacao_pct}%`} icon={BarChart3} />
            <KpiCard label="Dias afastamento" value={g.total_dias} icon={Calendar} />
            <KpiCard label="Média dias/atest." value={g.media_dias} icon={Users} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card p-4 h-64">
              <h3 className="text-sm font-semibold mb-2">Atestados por mês</h3>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={chartMes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="atestados" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-4 h-64">
              <h3 className="text-sm font-semibold mb-2">Dias de afastamento (linha)</h3>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={lineDias}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="dias" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="horas" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="card p-4 h-64">
              <h3 className="text-sm font-semibold mb-2">Por tipo</h3>
              <ResponsiveContainer width="100%" height="85%">
                <PieChart>
                  <Pie data={pieTipo} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {pieTipo.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold mb-3">Top colaboradores (dias)</h3>
              {g.top_colaboradores.length === 0 ? (
                <p className="text-sm text-gray-500">Sem dados.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="text-left py-2">Colaborador</th>
                      <th className="text-right py-2">Atestados</th>
                      <th className="text-right py-2">Dias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.top_colaboradores.map((c) => (
                      <tr key={`${c.nome}-${c.matricula}`} className="border-b border-gray-50">
                        <td className="py-2">{c.nome}</td>
                        <td className="text-right">{c.count}</td>
                        <td className="text-right font-medium">{c.dias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-[10px] text-gray-400 mt-3">
                Origem: {ORIGEM_LABELS.dp} {g.por_origem.dp || 0} · {ORIGEM_LABELS.supervisor}{' '}
                {g.por_origem.supervisor || 0}
              </p>
            </div>
          </div>
        </>
      )}

      {sub === 'inss' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle size={16} className="inline mr-2" />
            Afastamentos com mais de <strong>{INSS_DIAS_LIMIAR} dias</strong> exigem atenção para encaminhamento
            INSS / perícia médica.
          </div>
          {g.inss_longos.length === 0 ? (
            <AtestadoEmptyState variant="inss" />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b">
                    <th className="p-3 text-left">Protocolo</th>
                    <th className="p-3 text-left">Colaborador</th>
                    <th className="p-3 text-right">Dias</th>
                    <th className="p-3 text-left">SLA INSS</th>
                    <th className="p-3 text-left">Período</th>
                    <th className="p-3 text-left">CID</th>
                    <th className="p-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inssOrdenados.map((r) => {
                    const sla = calcularInssSla(r);
                    return (
                    <tr key={r.id} className="border-b">
                      <td className="p-3 font-mono text-xs">{r.protocolo}</td>
                      <td className="p-3">{r.colaborador_nome}</td>
                      <td className="p-3 text-right font-semibold text-amber-800">
                        {r.quantidade_dias || '—'}
                      </td>
                      <td className="p-3 text-xs">
                        {sla ? (
                          <span
                            className={`px-2 py-0.5 rounded-full font-medium ${
                              sla.urgencia === 'critico'
                                ? 'bg-red-100 text-red-800'
                                : sla.urgencia === 'atencao'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {sla.label}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {r.data_inicio}
                        {r.data_fim ? ` → ${r.data_fim}` : ''}
                      </td>
                      <td className="p-3 text-xs">{r.cid || '—'}</td>
                      <td className="p-3 text-xs">{STATUS_LABELS[r.status]}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {sub === 'eva' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 flex items-center gap-2">
            <Link2 size={14} />
            Cruza atestados aprovados com jornada EVA (logado). Divergência = operador com jornada &gt; 1h no dia de
            afastamento.
          </p>
          {evaLoading ? (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="animate-spin" size={14} /> Carregando snapshots EVA…
            </p>
          ) : cruzamentos.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum atestado aprovado para cruzar neste ano.</p>
          ) : (
            <div className="space-y-3">
              {cruzamentos.map((c) => (
                <div
                  key={c.atestado.id}
                  className={`card p-4 border-l-4 ${
                    c.resumo === 'alerta'
                      ? 'border-l-red-500'
                      : c.resumo === 'ok'
                        ? 'border-l-emerald-500'
                        : 'border-l-gray-300'
                  }`}
                >
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">
                      {c.atestado.colaborador_nome} · {c.atestado.protocolo}
                    </span>
                    <span className="text-xs text-gray-500">{c.atestado.data_inicio}</span>
                  </div>
                  <ul className="text-xs space-y-1 text-gray-600">
                    {c.dias.map((d) => (
                      <li key={d.data}>
                        <strong>{d.data}</strong> — {d.detalhe}
                        {d.situacao === 'divergente' && (
                          <span className="text-red-600 ml-1">(divergência)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sub === 'duplicidades' && (
        <div className="space-y-4">
          {g.duplicidades.length === 0 ? (
            <AtestadoEmptyState variant="duplicidades" />
          ) : (
            g.duplicidades.map(({ a, b }) => (
              <div key={`${a.id}-${b.id}`} className="card p-4 border border-amber-100 bg-amber-50/50">
                <p className="text-sm font-medium text-amber-900 flex items-center gap-2">
                  <FileX size={14} /> Períodos sobrepostos
                </p>
                <div className="grid md:grid-cols-2 gap-3 mt-2 text-xs">
                  <div>
                    <strong>{a.protocolo}</strong> — {a.colaborador_nome}
                    <br />
                    {a.data_inicio} → {a.data_fim || '—'} ({STATUS_LABELS[a.status]})
                  </div>
                  <div>
                    <strong>{b.protocolo}</strong> — {b.colaborador_nome}
                    <br />
                    {b.data_inicio} → {b.data_fim || '—'} ({STATUS_LABELS[b.status]})
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {sub === 'absenteismo' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Padrões na janela de 60 dias — frequência, CID recorrente e dias acumulados.
          </p>
          {padroes.length === 0 ? (
            <AtestadoEmptyState variant="absenteismo" />
          ) : (
            <div className="space-y-3">
              {padroes.map((p) => (
                <div
                  key={p.id}
                  className={`card p-4 border-l-4 ${
                    p.severidade === 'alerta'
                      ? 'border-l-red-500'
                      : p.severidade === 'atencao'
                        ? 'border-l-amber-500'
                        : 'border-l-blue-400'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{p.titulo}</p>
                  <p className="text-xs text-gray-600 mt-1">{p.detalhe}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {p.colaborador}
                    {p.matricula ? ` · ${p.matricula}` : ''} · {p.atestados.length} registro(s)
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
