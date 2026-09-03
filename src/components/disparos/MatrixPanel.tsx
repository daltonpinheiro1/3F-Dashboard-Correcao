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

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-800">Decision matrix</h3>
        {version && <code className="text-xs text-gray-500">mx:{version}</code>}
      </div>
      {loading && !data ? (
        <p className="text-xs text-gray-400">Carregando matrix…</p>
      ) : data?.error ? (
        <p className="text-xs text-red-600">{data.error}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <StratCard title="Decisões" rows={data?.decisoes} />
          <StratCard title="Motivos" rows={data?.motivos} />
          <StratCard title="Cancelamentos" rows={categorias} />
        </div>
      )}
    </section>
  );
}
