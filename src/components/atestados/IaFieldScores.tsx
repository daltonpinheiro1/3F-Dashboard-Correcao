import type { FieldScore } from '../../lib/atestadosFieldScores';

const STATUS_STYLE: Record<FieldScore['status'], string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  calculated: 'bg-blue-100 text-blue-800',
  warn: 'bg-gray-100 text-gray-600',
  missing: 'bg-amber-100 text-amber-900',
  manual: 'bg-violet-100 text-violet-800',
};

const STATUS_LABEL: Record<FieldScore['status'], string> = {
  ok: 'OK',
  calculated: 'Calc.',
  warn: '—',
  missing: 'Pend.',
  manual: 'Manual',
};

export function IaFieldScores({ scores }: { scores: FieldScore[] }) {
  if (!scores.length) return null;
  return (
    <div className="rounded-lg border border-violet-100 bg-white p-3 space-y-2">
      <p className="text-xs font-semibold text-violet-900">Confiança por campo</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {scores.map((s) => (
          <div key={s.key} className="rounded-lg border border-gray-100 p-2 bg-gray-50/50" title={s.hint}>
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[10px] font-medium text-gray-700 truncate">{s.label}</span>
              <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${STATUS_STYLE[s.status]}`}>
                {STATUS_LABEL[s.status]}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  s.score >= 75 ? 'bg-emerald-500' : s.score >= 50 ? 'bg-amber-500' : 'bg-red-400'
                }`}
                style={{ width: `${s.score}%` }}
              />
            </div>
            <p className="text-[9px] text-gray-500 mt-0.5 tabular-nums">{s.score}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}
