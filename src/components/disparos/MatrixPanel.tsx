import { n } from '../../lib/disparosFormat';
import type { MatrixPayload, MatrixVersao } from '../../types/portabilidade';
import { StratCard } from './DisparosWidgets';

const fmtData = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';

const pct = (v: number, total: number) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '—');

function Kpi({ label, valor, detalhe, alerta }: { label: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${alerta ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${alerta ? 'text-amber-800' : 'text-slate-800'}`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-slate-500">{detalhe}</p>}
    </div>
  );
}

/** Decisões de cada versão em % das propostas da própria versão, lado a lado. */
function ComparativoVersoes({ versoes }: { versoes: MatrixVersao[] }) {
  if (versoes.length < 2) return null;
  const [atual, anterior] = versoes;
  const labels = [...new Set([...atual.decisoes, ...anterior.decisoes].map((d) => d.label))];
  const de = (v: MatrixVersao, label: string) => v.decisoes.find((d) => d.label === label)?.count ?? 0;
  const linhas = labels
    .map((label) => {
      const a = atual.propostas ? (de(atual, label) / atual.propostas) * 100 : 0;
      const b = anterior.propostas ? (de(anterior, label) / anterior.propostas) * 100 : 0;
      return { label, a, b, delta: a - b };
    })
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 8);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-gray-800">
        Versão vigente × anterior
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        % das propostas de cada versão · <code>mx:{atual.versao}</code> desde {fmtData(atual.desde)} ×{' '}
        <code>mx:{anterior.versao}</code> ({fmtData(anterior.desde)}–{fmtData(anterior.ate)})
      </p>
      <table className="mt-3 w-full text-[11px]">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="font-medium">Decisão</th>
            <th className="text-right font-medium">Vigente</th>
            <th className="text-right font-medium">Anterior</th>
            <th className="text-right font-medium">Δ p.p.</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.label} className="border-t border-slate-100">
              <td className="py-1 text-gray-700">{l.label}</td>
              <td className="py-1 text-right tabular-nums">{l.a.toFixed(1)}%</td>
              <td className="py-1 text-right tabular-nums text-gray-500">{l.b.toFixed(1)}%</td>
              <td className={`py-1 text-right font-semibold tabular-nums ${Math.abs(l.delta) >= 2 ? (l.delta > 0 ? 'text-indigo-700' : 'text-rose-700') : 'text-gray-500'}`}>
                {l.delta > 0 ? '+' : ''}
                {l.delta.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MatrixPanel({
  data,
  loading,
  versionFallback,
  janelaLabel,
}: {
  data: MatrixPayload | null;
  loading?: boolean;
  versionFallback?: string;
  janelaLabel?: string;
}) {
  const version = data?.matrix_version || versionFallback;
  const coverage = data?.cobertura;
  const truncated = coverage ? Object.values(coverage).some((source) => source.truncado) : false;
  const updatedAt = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const categorias =
    data?.canceladas?.categorias_rows ??
    Object.entries(data?.canceladas?.categorias || {})
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));
  const exato = Boolean(data?.exato);
  const propostas = data?.retornos?.propostas ?? 0;
  const semAcao = data?.sem_acao;
  const loops = data?.loops;
  const cancelPropostas = data?.canceladas?.propostas;

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Decision matrix</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {exato
              ? 'Contagem por proposta, exata no banco. Passe o mouse para ver os registros.'
              : 'Executado, intenção da fila e cancelamentos sem misturar conceitos.'}
          </p>
          {janelaLabel && (
            <p className="mt-1 inline-block rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
              {janelaLabel}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {updatedAt && <span>Atualizada {updatedAt}</span>}
          {version && <code title="Versão vigente da matriz">mx:{version}</code>}
          {(data?.versoes?.length ?? 0) > 1 && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]" title={data?.versoes?.map((v) => `mx:${v.versao} ${fmtData(v.desde)}–${fmtData(v.ate)}`).join('\n')}>
              {data?.versoes?.length} versões na janela
            </span>
          )}
        </div>
      </div>
      {loading && !data ? (
        <p className="text-xs text-gray-400">Carregando matrix…</p>
      ) : data?.error ? (
        <p className="text-xs text-red-600">{data.error}</p>
      ) : (
        <>
          {exato ? (
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                label="Propostas com retorno"
                valor={n(propostas)}
                detalhe={`${n(data?.retornos?.linhas)} retornos`}
              />
              <Kpi
                label="Sem ação (finaliza)"
                valor={pct(semAcao?.propostas ?? 0, propostas)}
                detalhe={`${n(semAcao?.propostas)} propostas`}
              />
              <Kpi
                label="Cancelamentos concluídos"
                valor={n(cancelPropostas ?? data?.canceladas?.total_executados)}
                detalhe={`${n(data?.canceladas?.total_executados)} execuções`}
              />
              <Kpi
                label={`Loop sem ação (> ${loops?.limite ?? 20} retornos)`}
                valor={n(loops?.sem_acao)}
                detalhe={`de ${n(loops?.total)} em loop · ${pct(loops?.retornos ?? 0, data?.retornos?.linhas ?? 0)} dos retornos`}
                alerta={(loops?.sem_acao ?? 0) > 0}
              />
            </div>
          ) : (
            coverage && (
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  Retornos lidos: {coverage.retornos.lidos}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  Fila lida: {coverage.fila.lidos}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                  Cancels concluídos: {coverage.cancelamentos.lidos}
                </span>
                {truncated && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">
                    Período truncado; reduza a janela
                  </span>
                )}
              </div>
            )
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <StratCard
              title="Decisões executadas"
              subtitulo={exato ? 'Propostas por ação (sem "sem ação")' : undefined}
              rows={data?.decisoes}
              total={exato ? propostas : undefined}
            />
            {exato ? (
              <StratCard
                title="Sem ação — motivos"
                subtitulo="Por que a matriz finalizou sem agir"
                rows={semAcao?.motivos}
                total={semAcao?.propostas}
              />
            ) : (
              <StratCard title="Ações enfileiradas na janela" rows={data?.fila_acoes} />
            )}
            <StratCard
              title="Cancelamentos concluídos"
              subtitulo={exato ? 'Execuções por categoria do motivo' : undefined}
              rows={categorias}
              total={exato ? data?.canceladas?.total_executados : undefined}
            />
          </div>

          {exato && (data?.fila_status?.length ?? 0) > 0 && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-800">Fila de ações por status</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Propostas criadas na janela. Descartada = cancelada antes de executar.
              </p>
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="font-medium">Ação</th>
                    <th className="text-right font-medium">Executada</th>
                    <th className="text-right font-medium">Pendente</th>
                    <th className="text-right font-medium">Descartada</th>
                    <th className="text-right font-medium">BKO/outros</th>
                    <th className="text-right font-medium">% executada</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.fila_status?.map((f) => {
                    const base = f.executada + f.pendente + f.descartada + f.outros;
                    return (
                      <tr key={f.acao} className="border-t border-slate-100" title={`${n(f.linhas)} registro(s) na fila`}>
                        <td className="py-1.5 font-medium text-gray-700">{f.acao}</td>
                        <td className="py-1.5 text-right tabular-nums text-emerald-700">{n(f.executada)}</td>
                        <td className="py-1.5 text-right tabular-nums text-indigo-700">{n(f.pendente)}</td>
                        <td className="py-1.5 text-right tabular-nums text-rose-700">{n(f.descartada)}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-500">{n(f.outros)}</td>
                        <td className="py-1.5 text-right font-semibold tabular-nums">{pct(f.executada, base)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <StratCard
              title="Motivos dos retornos"
              subtitulo={exato ? 'Retornos com ação; propostas por motivo' : undefined}
              rows={data?.motivos}
            />
            <StratCard
              title="Motivos informados na fila"
              rows={data?.motivos_fila}
              total={exato ? data?.fila_total?.propostas : undefined}
            />
          </div>

          {exato && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {data?.versoes && data.versoes.length > 1 ? (
                <ComparativoVersoes versoes={data.versoes} />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
                  Uma versão da matriz na janela{version ? ` (mx:${version})` : ''}: sem comparativo.
                </div>
              )}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-bold text-gray-800">Propostas em loop</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Mais de {loops?.limite ?? 20} retornos na janela. Ciclos de reconsulta de entrega são esperados; ALWAYS_IGNORE repetido não.
                </p>
                {!loops?.top.length ? (
                  <p className="mt-3 text-xs text-gray-400">Nenhuma</p>
                ) : (
                  <table className="mt-3 w-full text-[11px]">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="font-medium">Proposta</th>
                        <th className="text-right font-medium">Retornos</th>
                        <th className="pl-2 font-medium">Decisão / motivo</th>
                        <th className="text-right font-medium">Último</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loops.top.map((l) => (
                        <tr
                          key={l.proposta}
                          className={`border-t border-slate-100 align-top ${l.operacao === 'no_action' ? 'bg-amber-50' : ''}`}
                        >
                          <td className="py-1 font-mono text-gray-700">{l.proposta}</td>
                          <td className="py-1 text-right font-semibold tabular-nums">{n(l.retornos)}</td>
                          <td className="max-w-[16rem] truncate py-1 pl-2 text-gray-600" title={`${l.operacao} · ${l.motivo}`}>
                            {l.operacao} · {l.motivo}
                          </td>
                          <td className="py-1 text-right text-gray-500">{fmtData(l.ultimo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
