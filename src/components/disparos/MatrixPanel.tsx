import type { MatrixPayload } from '../../types/portabilidade';
import { StratCard } from './DisparosWidgets';

export function MatrixPanel({
  data,
  loading,
  versionFallback,
}: {
  data: MatrixPayload | null;
  loading?: boolean;
  versionFallback?: string;
}) {
  const categorias = Object.entries(data?.canceladas?.categorias || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));
  const version = data?.matrix_version || versionFallback;
  const coverage = data?.cobertura;
  const truncated = coverage
    ? Object.values(coverage).some((source) => source.truncado)
    : false;
  const updatedAt = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Decision matrix</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Executado, intenção da fila e cancelamentos sem misturar conceitos.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {updatedAt && <span>Atualizada {updatedAt}</span>}
          {version && <code>mx:{version}</code>}
        </div>
      </div>
      {loading && !data ? (
        <p className="text-xs text-gray-400">Carregando matrix…</p>
      ) : data?.error ? (
        <p className="text-xs text-red-600">{data.error}</p>
      ) : (
        <>
          {coverage && (
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
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            <StratCard title="Decisões executadas" rows={data?.decisoes} />
            <StratCard title="Ações atualmente na fila" rows={data?.fila_acoes} />
            <StratCard title="Cancelamentos concluídos" rows={categorias} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <StratCard title="Motivos dos retornos" rows={data?.motivos} />
            <StratCard title="Motivos informados na fila" rows={data?.motivos_fila} />
          </div>
        </>
      )}
    </section>
  );
}
