import { useEffect, useMemo } from 'react';
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
  fmtPerda,
  isTabDrop,
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
  preverSaida,
  tabsDoOperador,
  type FocoId,
} from '../lib/ofensorOp';
import { SortTh } from './SortTh';
import { useTableSortFields } from '../lib/tableSort';

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
  const fused = jornadaParaFicha(jornada.filter((j) => (j.login || String(j.id_user)) === login));
  const analise = fused ? analisarOperador(fused) : null;
  const aoVivo = estadoAtivo(login, ativas);
  const tabs = tabsDoOperador(login, ofensoresTab, tmaTabs);
  const recs = chamadasDoOperador(login, chamadas);
  const dropN = tabs.reduce((s, t) => s + (isTabDrop(t.nome) ? t.total || 0 : 0), 0);
  const tabsN = tabs.reduce((s, t) => s + (t.total || 0), 0);
  const dropPct = dropRate(dropN, tabsN);

  const tabRows = useMemo(
    () =>
      tabs.map((t) => ({
        ...t,
        _pct_cpc: t.pct_cpc || 0,
        _tma_seg: t.tma_seg || 0,
        _drop: isTabDrop(t.nome) ? 1 : 0,
      })),
    [tabs],
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ficha-op-titulo">
      <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" aria-label="Fechar ficha" onClick={onClose} />
      <div className="relative h-full w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {!analise || !j ? (
          <div className="p-6">
            <div className="flex justify-between items-start">
              <h2 id="ficha-op-titulo" className="text-lg font-black">Operador {login}</h2>
              <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-4">Sem jornada neste recorte para montar a ficha.</p>
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
                  label="DROP%"
                  value={tabsN ? `${dropPct}%` : '—'}
                  warn={tabsN >= 5 && dropPct >= 25}
                  icon={PhoneCall}
                />
                <MiniF label="Vendas perdidas" value={fmtPerda(analise.perdas.vendas_perdidas)} warn={analise.perdas.vendas_perdidas >= 0.5} icon={AlertTriangle} />
                <MiniF label="DROP qtd" value={tabsN ? String(dropN) : '—'} warn={dropN >= 5} icon={AlertTriangle} />
              </section>

              {(() => {
                const saida = preverSaida(j);
                return (
                  <section className={`rounded-2xl border p-4 ${saida.atrasada ? 'border-red-300 bg-red-50' : saida.entregue ? 'border-emerald-200 bg-emerald-50' : 'border-indigo-200 bg-indigo-50'}`}>
                    <h3 className="text-sm font-bold text-gray-900 mb-1">Jornada · saída prevista</h3>
                    <p className="text-xs text-gray-600">
                      1º login {fmtHora(analise.primeiroLogin)} + 05:50 logado + pausas {fmtDur(j.pausa_seg)}
                      {(j.tempo_perdido_seg || 0) > 0 ? ` + deslogues ${fmtDur(j.tempo_perdido_seg)}` : ''}
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
                  1º alerta = atraso na entrada (manhã 09:00 / tarde 15:00). Relogin depois disso gera alerta na dela (15s–12min).
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
                <p className="text-[11px] text-gray-400 mb-2">
                  DROP = DESLIGOU / QUEDA DE LIGAÇÃO · {dropN} de {tabsN || 0} ({tabsN ? `${dropPct}%` : '—'})
                </p>
                {tabs.length === 0 ? (
                  <p className="text-xs text-gray-400">Sem recorte por tabulação neste payload.</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-gray-100">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <SortTh label="Tabulação" col="nome" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="left" className="px-3 py-1.5" />
                          <SortTh label="Qtd" col="total" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="right" className="px-3 py-1.5" />
                          <SortTh label="TMA" col="_tma_seg" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="right" className="px-3 py-1.5" />
                          <SortTh label="CPC%" col="_pct_cpc" sortKey={tabKey} sortDir={tabDir} onSort={toggleTab} align="right" className="px-3 py-1.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {(tabsSorted as typeof tabRows).slice(0, 12).map((t) => {
                          const fora = isTabNaoCpc(t.nome);
                          const drop = isTabDrop(t.nome);
                          return (
                            <tr key={`${t.nome}-${t.campanha_op}`} className={`border-t border-gray-50 ${drop ? 'bg-red-50/60' : ''}`}>
                              <td className="px-3 py-1.5 text-gray-800">
                                {t.nome}
                                {drop && (
                                  <span className="ml-1.5 inline-flex rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                    DROP
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right">{t.total}</td>
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
                      const drop = isTabDrop(c.classification_name);
                      return (
                        <li key={c.id} className={`flex justify-between gap-2 text-xs border-b border-gray-50 py-1.5 ${drop ? 'bg-red-50/50' : ''}`}>
                          <span className="text-gray-500 tabular-nums">{fmtHora(c.call_time)}</span>
                          <span className="flex-1 truncate text-gray-800">
                            {c.classification_name}
                            {drop ? ' · DROP' : ''}
                          </span>
                          <span className={
                            drop ? 'text-red-600 font-bold'
                              : c.success ? 'text-emerald-700'
                                : (c.cpc_op ?? c.cpc) ? 'text-teal-700' : 'text-gray-400'
                          }>
                            {drop ? 'DROP' : c.success ? 'OK' : (c.cpc_op ?? c.cpc) ? 'CPC' : '—'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <p className="text-[11px] text-gray-400">
                Tab. {j.tabuladas || 0} · DROP {dropN} ({tabsN ? `${dropPct}%` : '—'}) · sucesso {j.sucesso || 0} · TMA {fmtHms(j.tma_seg)} · perda deslogue {fmtDur(j.tempo_perdido_seg)}
                {analise.perdas.vendas_perdidas ? ` · vendas est. ${fmtPerda(analise.perdas.vendas_perdidas)}` : ''}
                {' · '}CPC meta {resolveCpcMeta()}%
              </p>
            </div>
          </>
        )}
      </div>
    </div>
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
