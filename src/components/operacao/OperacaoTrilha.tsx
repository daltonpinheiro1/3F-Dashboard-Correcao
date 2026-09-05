import type { TrilhaPonto } from '../../lib/operacaoVisoes';

export function OperacaoTrilha({ pontos, meta }: { pontos: TrilhaPonto[]; meta: number }) {
  const vals = pontos.map((p) => p.cpc);
  const nums = vals.filter((n): n is number => n != null);
  if (nums.length < 2) {
    return <p className="text-[10px] text-gray-400 mt-2">Trilha CPC: poucos dias no recorte</p>;
  }
  const min = Math.min(...nums, meta);
  const max = Math.max(...nums, meta);
  const span = Math.max(1, max - min);
  const w = 120;
  const h = 28;
  const step = (w - 4) / (pontos.length - 1);
  const y = (v: number) => h - 3 - ((v - min) / span) * (h - 6);
  const pts = pontos
    .map((p, i) => (p.cpc == null ? null : `${2 + i * step},${y(p.cpc)}`))
    .filter(Boolean)
    .join(' ');
  const metaY = y(meta);

  return (
    <div className="mt-2">
      <svg width={w} height={h} className="overflow-visible" aria-label="Trilha CPC 7 dias">
        <line x1={2} x2={w - 2} y1={metaY} y2={metaY} stroke="#94a3b8" strokeDasharray="2 2" strokeWidth="1" />
        <polyline fill="none" stroke="#4f46e5" strokeWidth="1.6" points={pts} />
        {pontos.map((p, i) =>
          p.cpc == null ? null : (
            <circle
              key={p.dia}
              cx={2 + i * step}
              cy={y(p.cpc)}
              r={p.ka ? 2.6 : 1.8}
              fill={p.ka ? '#dc2626' : p.cpc < meta ? '#d97706' : '#4f46e5'}
            />
          ),
        )}
      </svg>
      <p className="text-[10px] text-gray-400 leading-tight">
        7d CPC
        {(() => {
          const last = pontos[pontos.length - 1]?.cpc;
          return last != null ? ` · hoje ${last.toFixed(0)}%` : '';
        })()}
        {pontos.some((p) => (p.ka || 0) > 0) ? ' · ponto vermelho = KA no dia' : ''}
      </p>
    </div>
  );
}
