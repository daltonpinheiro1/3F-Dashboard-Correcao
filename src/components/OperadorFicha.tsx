import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Clock,
  PauseCircle,
  PhoneCall,
  Target,
  X,
} from 'lucide-react';
import {
  resolveCpcMeta,
  PAUSA_META_PCT,
  fmtDur,
  fmtHms,
  fmtHora,
  fmtInt,
  fmtPerda,
  isTabDrop,
  isTabEventoQueda,
  isTabNaoCpc,
  dropRate,
  type EvaAtivo,
  type EvaChamada,
  type EvaJornada,
  type EvaOfensorTab,
  type EvaTabulacao,
} from '../lib/evaDash';
import {
  analisarOperador,
  chamadasDoOperador,
  estadoAtivo,
  jornadaParaFicha,
  matchOperadorKey,
  preverSaida,
  tabsDoOperador,
  tempoDeslogueEfetivo,
  type FocoId,
} from '../lib/ofensorOp';
import { SortTh } from './SortTh';
import { CopyablePhone } from './CopyablePhone';
import { useTableSortFields } from '../lib/tableSort';
import { ErrorBoundary } from './ErrorBoundary';

const NIVEL_CLS = {
  critico: 'bg-red-600 text-white',
  alto: 'bg-orange-500 text-white',
  medio: 'bg-amber-100 text-amber-800',
  ok: 'bg-emerald-50 text-emerald-700',
};

const FOCO_CLS: Record<FocoId, string> = {
  atraso: 'border-red-300 bg-red-50',
  deslogue: 'border-orange-300 bg-orange-50',
  pausa: 'border-rose-300 bg-rose-50',
  cpc: 'border-fuchsia-300 bg-fuchsia-50',
  logado: 'border-amber-300 bg-amber-50',
};

export function OperadorFicha({
  login,
  jornada,
  ativas,
  chamadas,
  ofensoresTab,
  tmaTabs = [],
  onClose,
}: {
  login: string;
  jornada: EvaJornada[];
  ativas: EvaAtivo[];
  chamadas: EvaChamada[];
  ofensoresTab: EvaOfensorTab[];
  tmaTabs?: EvaTabulacao[];
  onClose: () => void;
}) {
  const fused = jornadaParaFicha(jornada.filter((j) => matchOperadorKey(j, login)));
  const analise = fused ? analisarOperador(fused) : null;
  const aoVivo = estadoAtivo(login, ativas);
  const tabs = tabsDoOperador(login, ofensoresTab, tmaTabs);
  const recs = chamadasDoOperador(login, chamadas);

  /** DROP agente por motivo: prioriza chamadas com bit EVA; senão ofensores.drop_agente por tab. */
  const dropByMotivo = useMemo(() => {
    const fromCalls: Record<string, number> = {};
    for (const c of chamadas) {
      if ((c.login || '') !== login) continue;
      if (c.agente_desligou !== true) continue;
      const nome = (c.classification_name || '—').trim() || '—';
      fromCalls[nome] = (fromCalls[nome] || 0) + 1;
    }
    if (Object.keys(fromCalls).length > 0) return fromCalls;

    const fromTabs: Record<string, number> = {};
    for (const t of tabs) {
      const n = typeof t.drop_agente === 'number' ? Math.max(0, t.drop_agente) : 0;
      if (n <= 0) continue;
      // Legado: total do dia na 1ª linha (drop > qtd da tab) — ignora
      if (n > (t.total || 0)) continue;
      fromTabs[t.nome] = n;
    }
    return fromTabs;
  }, [tabs, chamadas, login]);

  const dropN = useMemo(
    () => Object.values(dropByMotivo).reduce((s, n) => s + n, 0),
    [dropByMotivo],
  );
  const eventoN = tabs.reduce((s, t) => s + (isTabEventoQueda(t.nome) ? t.total || 0 : 0), 0);
  const tabsN = tabs.reduce((s, t) => s + (t.total || 0), 0);
  const dropPct = dropRate(dropN, tabsN);
  const eventoPct = dropRate(eventoN, tabsN);
  const motivoPrincipalDrop = useMemo(() => {
    let best = '';
    let bestN = 0;
    for (const [nome, n] of Object.entries(dropByMotivo)) {
      if (n > bestN) {
        best = nome;
        bestN = n;
      }
    }
    return bestN > 0 ? { nome: best, n: bestN, share: dropRate(bestN, dropN) } : null;
  }, [dropByMotivo, dropN]);

  const tabRows = useMemo(
    () =>
      tabs.map((t) => {
        const dropQtd = dropByMotivo[t.nome] || 0;
        const qtd = t.total || 0;
        return {
          ...t,
          _pct_cpc: t.pct_cpc || 0,
          _tma_seg: t.tma_seg || 0,
          _drop_n: dropQtd,
          _drop: dropQtd > 0 ? 1 : 0,
          _evento: dropQtd <= 0 && isTabEventoQueda(t.nome) ? 1 : 0,
          _pct_tabs: tabsN ? dropRate(qtd, tabsN) : 0,
          // DROP% nesta tab = Agente Desligou ÷ tabs desta tab
          _drop_pct: qtd ? dropRate(dropQtd, qtd) : 0,
          // participação do motivo no total de DROPs do operador
          _drop_share: dropN ? dropRate(dropQtd, dropN) : 0,
        };
      }),
    [tabs, tabsN, dropByMotivo, dropN],
  );
  const {
    sorted: tabsSorted,
    sortKey: tabKey,
    sortDir: tabDir,
    toggleSort: toggleTab,
  } = useTableSortFields(tabRows as Record<string, unknown>[], 'total', 'desc');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const j = analise?.jornada;
  const houveAtraso = (analise?.atrasoSeg || 0) > 0;

  const drawer = (
    <div className="fixed inset-0 z-[80] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ficha-op-titulo">
      <button type="button" className="absolute inset-0 z-0 bg-black/45 backdrop-blur-[2px]" aria-label="Fechar ficha" onClick={onClose} />
      <div className="relative z-10 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {!analise || !j ? (
          <div className="p-6">
            <div className="flex justify-between items-start">
              <h2 id="ficha-op-titulo" className="text-lg font-black text-gray-900">Operador {login}</h2>
              <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-4">Sem jornada neste recorte para montar a ficha.</p>
            <p className="text-xs text-gray-400 mt-2">
              Confira campanha/filtro ou atualize o live. O login precisa existir em jornada EVA.
            </p>
          </div>
        ) : (
          <>
            <header className={`px-5 py-4 border-b ${analise.ofensor ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {analise.ofensor && (
                      <span className={`badge ${NIVEL_CLS[analise.nivel]}`}>
                        OFENSOR · {analise.nivel === 'critico' ? 'crítico' : 'alto'}
                      </span>
                    )}
                    {aoVivo && (
                      <span className="badge bg-blue-50 text-blue-700">
                        {aoVivo.estado === 'pausa' ? 'Em pausa agora' : aoVivo.estado === 'instavel' ? 'Keep-alive atrasado' : 'No piso'}
                      </span>
                    )}
                  </div>
                  <h2 id="ficha-op-titulo" className="text-lg font-black text-gray-900 leading-tight">{analise.nome}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {analise.login} · {analise.supervisor} · {analise.campanha}
                    {analise.turno ? ` · ${analise.turno === 'tarde' ? 'tarde 15:00' : 'manhã 09:00'}` : ''}
                  </p>
                </div>
                <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/80" aria-label="Fechar ficha">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Focos · pior primeiro</h3>
                {analise.focos.length === 0 ? (
                  <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">Sem alerta neste recorte.</p>
                ) : (
                  <ol className="space-y-2">
                    {analise.focos.map((f, i) => (
                      <li key={f.id} className={`rounded-xl border px-3 py-2.5 ${FOCO_CLS[f.id]}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-gray-900">
                            {i + 1}. {f.titulo}
                          </p>
                          <span className={`badge ${NIVEL_CLS[f.nivel]}`}>{f.nivel}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{f.detalhe}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="grid grid-cols-2 gap-2">
                <MiniF label="CPC" value={`${(j.pct_cpc || 0).toFixed(1)}%`} warn={!!j.alerta_cpc} icon={Target} />
                <MiniF label="TMA" value={fmtHms(j.tma_seg)} icon={Clock} />
                <MiniF label="Pausa" value={`${(j.pct_pausa || 0).toFixed(1)}%`} warn={!!j.acima_meta_pausa} icon={PauseCircle} />
                <MiniF
                  label="DROP agente%"
                  value={tabsN ? `${dropPct.toFixed(1)}%` : '—'}
                  warn={tabsN >= 5 && dropPct >= 25}
                  icon={PhoneCall}
                />
                <MiniF label="Vendas perdidas" value={fmtPerda(analise.perdas.vendas_perdidas)} warn={analise.perdas.vendas_perdidas >= 0.5} icon={AlertTriangle} />
                <MiniF
                  label="DROP agente qtd"
                  value={tabsN ? `${dropN} / ${tabsN}` : '—'}
                  warn={dropN >= 5}
                  icon={AlertTriangle}
                />
                <MiniF
                  label="Evento queda%"
                  value={tabsN ? `${eventoPct.toFixed(1)}%` : '—'}
                  icon={PhoneCall}
                />
              </section>

              {(() => {
                const saida = preverSaida(j);
                return (
                  <section className={`rounded-2xl border p-4 ${saida.atrasada ? 'border-red-300 bg-red-50' : saida.entregue ? 'border-emerald-200 bg-emerald-50' : 'border-indigo-200 bg-indigo-50'}`}>
                    <h3 className="text-sm font-bold text-gray-900 mb-1">Jornada · saída prevista</h3>
                    <p className="text-xs text-gray-600">
                      1º login {fmtHora(analise.primeiroLogin)} + 05:50 logado + pausas {fmtDur(j.pausa_seg)}
                      {tempoDeslogueEfetivo(j) > 0 ? ` + deslogues ${fmtDur(tempoDeslogueEfetivo(j))}` : ''}
                    </p>
                    <p className="text-lg font-black mt-1 text-gray-900">
                      Saída {saida.hora}
                      {saida.entregue ? ' · entregue' : saida.emAndamento ? ` · em jornada · falta ${fmtDur(saida.faltaLogado)}` : ` · atrasada · falta ${fmtDur(saida.faltaLogado)}`}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1">Logado {fmtHms(j.logged_time)} de 05:50</p>
                  </section>
                );
              })()}

              <section className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4">
                <h3 className="text-sm font-bold text-orange-900 mb-1">Linha do tempo · entrada e deslogs</h3>
                <p className="text-[11px] text-orange-800/80 mb-3">
                  1º alerta = atraso na entrada (manhã 09:00 / tarde 15:00). Relogin só com{' '}
                  <strong>logout registrado</strong> e gap 15s–12min. KA aberto = última sessão do dia
                  sem sinal &gt;3 min (teto 12 min). Sessão fantasma sem logout não conta como deslogue.
                </p>
                <ol className="space-y-2">
                  <li className={`rounded-xl px-3 py-2 border ${houveAtraso ? 'bg-red-600 text-white border-red-700' : 'bg-white border-orange-100 text-gray-700'}`}>
                    <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">
                      {houveAtraso ? '1º alerta · atraso de entrada' : 'Entrada no horário'}
                    </p>
                    <p className="text-sm font-semibold">
                      Login {fmtHora(analise.primeiroLogin)} · meta {analise.metaEntrada}
                      {houveAtraso ? ` · +${fmtDur(analise.atrasoSeg)}` : ''}
                    </p>
                  </li>
                  {analise.deslogs.length === 0 && (
                    <li className="text-xs text-orange-800/70 px-1">Nenhum deslogue operacional (15s–12min) neste dia.</li>
                  )}
                  {analise.deslogs.map((d, i) => {
                    const aberto = d.status === 'aberto' || !d.relogin;
                    return (
                      <li key={`${d.logout}-${d.relogin || 'aberto'}-${i}`} className="rounded-xl bg-white border border-orange-200 px-3 py-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-orange-700">
                          {aberto ? 'Keep-alive aberto' : houveAtraso || i === 0 ? `Alerta · relogin ${i + 1}` : `Relogin ${i + 1}`}
                        </p>
                        <p className="text-sm text-gray-800">
                          {aberto ? (
                            <>
                              Último sinal {fmtHora(d.logout)} · <span className="font-bold text-red-600">{fmtDur(d.seg)}</span> sem keep-alive
                            </>
                          ) : (
                            <>
                              Saiu {fmtHora(d.logout)} → voltou {fmtHora(d.relogin)} · <span className="font-bold text-red-600">{fmtDur(d.seg)}</span> fora
                            </>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </section>

              <section className={`rounded-2xl border p-4 ${j.acima_meta_pausa ? 'border-rose-300 bg-rose-50' : 'border-gray-100 bg-gray-50'}`}>
                <h3 className="text-sm font-bold text-gray-900 mb-1">Pausas deste colaborador</h3>
                <p className="text-xs text-gray-500 mb-3">
                  {j.pausa_qtd || 0} pausas · {fmtHms(j.pausa_seg)} · média {fmtDur(j.pausa_media_seg)} · {(j.pct_pausa || 0).toFixed(1)}% do logado (meta {PAUSA_META_PCT}%)
                </p>
                {j.acima_meta_pausa && (
                  <p className="text-sm font-bold text-rose-700 mb-3">
                    Estouro {((j.pct_pausa || 0) - PAUSA_META_PCT).toFixed(1)} p.p. · excedente {fmtDur(analise.perdas.tempo_pausa_excedente_seg)}
                  </p>
                )}
                <div className="space-y-2">
                  {(() => {
                    const lista = (j.pausas_detalhe || []).filter((p) => p.qtd || p.segundos).sort((a, b) => b.segundos - a.segundos);
                    const max = Math.max(1, ...lista.map((p) => p.segundos));
                    if (!lista.length) return <p className="text-xs text-gray-400">Sem pausa registrada neste recorte.</p>;
                    return lista.map((p) => (
                      <div key={p.chave}>
                        <div className="flex items-center justify-between text-sm mb-0.5">
                          <span className="font-medium text-gray-800">{p.tipo}</span>
                          <span className="tabular-nums text-gray-700">
                            {p.qtd}x · {fmtDur(p.segundos)} · méd {fmtDur(p.media_seg)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/80 overflow-hidden">
                          <div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.round((100 * p.segundos) / max)}%` }} />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-2">Tabulações · TMA e CPC</h3>
                {tabsN > 0 && (
                  <div
                    className={`mb-3 rounded-xl border px-3 py-2.5 ${
                      dropPct >= 25 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">DROP agente (culpa)</p>
                      <p className={`text-xl font-black tabular-nums ${dropPct >= 25 ? 'text-red-600' : 'text-gray-900'}`}>
                        {dropPct.toFixed(1)}%
                      </p>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {dropN} DROP agente de {tabsN} tabs · eventos queda/desligue {eventoN} ({eventoPct.toFixed(1)}%) · demais{' '}
                      {fmtInt(Math.max(0, tabsN - dropN))}
                    </p>
                    {motivoPrincipalDrop && (
                      <p className="text-xs text-red-700 mt-1 font-medium">
                        Motivo que mais desligou: {motivoPrincipalDrop.nome} · {motivoPrincipalDrop.n} DROP (
                        {motivoPrincipalDrop.share.toFixed(1)}% dos DROPs)
                      </p>
                    )}
                    <div className="mt-2 h-2 rounded-full bg-white overflow-hidden flex">
                      <div
                        className="h-full bg-red-500"
                        style={{ width: `${Math.min(100, dropPct)}%` }}
                        title={`DROP agente ${dropPct.toFixed(1)}%`}
                      />
                      <div
                        className="h-full bg-slate-300"
                        style={{ width: `${Math.max(0, 100 - dropPct)}%` }}
                        title={`Demais ${(100 - dropPct).toFixed(1)}%`}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-gray-400">
                      DROP = agente encerrou (EVA Agente Desligou). Badge só nas tabs com bit — não pelo nome “desligou/queda”.
                    </p>
                  </div>
                )}
                {tabs.length === 0 ? (
                  <p className="text-xs text-gray-400">Sem recorte por tabulação neste payload.</p>
                ) : (
                  <div className="overflow-x-auto overflow-hidden rounded-xl border border-gray-100">
                    <table className="w-full text-xs min-w-[520px]">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <SortTh label="Tabulação" col="nome" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="left" className="px-3 py-1.5" />
                          <SortTh label="Qtd" col="total" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="right" className="px-3 py-1.5" />
                          <SortTh label="% tabs" col="_pct_tabs" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="right" className="px-3 py-1.5" />
                          <SortTh label="DROP" col="_drop_n" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="right" className="px-3 py-1.5" title="Qtd Agente Desligou nesta tab" />
                          <SortTh label="DROP%" col="_drop_pct" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="right" className="px-3 py-1.5" title="Agente Desligou ÷ tabs desta tabulação" />
                          <SortTh label="% DROPs" col="_drop_share" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="right" className="px-3 py-1.5" title="Participação deste motivo no total de DROPs do operador" />
                          <SortTh label="TMA" col="_tma_seg" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="right" className="px-3 py-1.5" />
                          <SortTh label="CPC%" col="_pct_cpc" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="right" className="px-3 py-1.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {(tabsSorted as typeof tabRows).slice(0, 12).map((t) => {
                          const fora = isTabNaoCpc(t.nome);
                          const drop = (t._drop_n || 0) > 0;
                          const evento = !drop && isTabEventoQueda(t.nome);
                          const principal = motivoPrincipalDrop?.nome === t.nome;
                          return (
                            <tr key={`${t.nome}-${t.campanha_op}`} className={`border-t border-gray-50 ${drop ? 'bg-red-50/60' : ''}`}>
                              <td className="px-3 py-1.5 text-gray-800">
                                {t.nome}
                                {drop && (
                                  <span className="ml-1.5 inline-flex rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                    DROP
                                  </span>
                                )}
                                {principal && (
                                  <span className="ml-1 inline-flex rounded border border-red-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">
                                    + desligou
                                  </span>
                                )}
                                {evento && (
                                  <span className="ml-1.5 inline-flex rounded bg-slate-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                    Evento
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{t.total}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{(t._pct_tabs || 0).toFixed(1)}%</td>
                              <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${drop ? 'text-red-600' : 'text-gray-400'}`}>
                                {t._drop_n || 0}
                              </td>
                              <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${drop ? 'text-red-600' : 'text-gray-400'}`}>
                                {(t._drop_pct || 0).toFixed(1)}%
                              </td>
                              <td className={`px-3 py-1.5 text-right tabular-nums ${drop ? 'text-red-700' : 'text-gray-400'}`}>
                                {dropN > 0 ? `${(t._drop_share || 0).toFixed(1)}%` : '—'}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{fmtHms(t.tma_seg)}</td>
                              <td className={`px-3 py-1.5 text-right font-bold ${fora ? 'text-gray-400' : t.alerta_cpc ? 'text-red-600' : 'text-teal-700'}`}>
                                {(t.pct_cpc || 0).toFixed(1)}%{fora ? ' · n/CPC' : ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <PhoneCall size={14} /> Últimas chamadas
                </h3>
                {recs.length === 0 ? (
                  <p className="text-xs text-gray-400">Sem chamadas recentes deste login no recorte.</p>
                ) : (
                  <ul className="space-y-1">
                    {recs.slice(0, 12).map((c) => {
                      const drop = isTabDrop(c.classification_name, c.agente_desligou);
                      const evento = !drop && isTabEventoQueda(c.classification_name);
                      return (
                        <li key={c.id} className={`flex justify-between gap-2 text-xs border-b border-gray-50 py-1.5 ${drop ? 'bg-red-50/50' : ''}`}>
                          <span className="text-gray-500 tabular-nums shrink-0">{fmtHora(c.call_time)}</span>
                          <span className="flex-1 min-w-0 truncate text-gray-800" title={c.classification_name || ''}>
                            {c.classification_name}
                            {drop ? ' · DROP' : evento ? ' · Evento' : ''}
                          </span>
                          <CopyablePhone
                            areaCode={c.area_code}
                            phone={c.phone_number}
                            className="shrink-0 text-[11px]"
                          />
                          <span className={
                            drop ? 'text-red-600 font-bold shrink-0'
                              : evento ? 'text-slate-600 font-semibold shrink-0'
                              : c.success ? 'text-emerald-700 shrink-0'
                                : (c.cpc_op ?? c.cpc) ? 'text-teal-700 shrink-0' : 'text-gray-400 shrink-0'
                          }>
                            {drop ? 'DROP' : evento ? 'Evento' : c.success ? 'OK' : (c.cpc_op ?? c.cpc) ? 'CPC' : '—'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <p className="text-[11px] text-gray-400">
                Tab. {j.tabuladas || 0} · DROP agente {dropN}/{tabsN || 0} ({tabsN ? `${dropPct.toFixed(1)}%` : '—'}) · evento{' '}
                {eventoN} · sucesso {j.sucesso || 0} · TMA {fmtHms(j.tma_seg)} · perda deslogue{' '}
                {fmtDur(analise.perdas.tempo_deslogue_seg ?? tempoDeslogueEfetivo(j))}
                {analise.perdas.vendas_perdidas ? ` · vendas est. ${fmtPerda(analise.perdas.vendas_perdidas)}` : ''}
                {' · '}CPC meta {resolveCpcMeta()}%
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(
    <ErrorBoundary fallbackLabel="Erro ao abrir ficha do operador">{drawer}</ErrorBoundary>,
    document.body,
  );
}

function MiniF({
  label, value, warn, icon: Icon,
}: {
  label: string;
  value: string;
  warn?: boolean;
  icon: typeof Clock;
}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${warn ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
      <p className="text-[10px] font-semibold uppercase text-gray-400 flex items-center gap-1">
        <Icon size={11} /> {label}
      </p>
      <p className={`text-lg font-black ${warn ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
