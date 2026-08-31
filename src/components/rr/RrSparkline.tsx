export function RrSparkline({
  values,
  labels,
}: {
  values: number[];
  labels?: string[];
}) {
  const w = 160;
  const h = 36;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const pts = values.map((v, i) => {
    const x = values.length <= 1 ? w / 2 : (i / (values.length - 1)) * w;
    const y = h - 4 - ((v - min) / span) * (h - 8);
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <polyline fill="none" stroke="#0f766e" strokeWidth="2" points={pts.join(' ')} />
      {values.map((v, i) => {
        const x = values.length <= 1 ? w / 2 : (i / (values.length - 1)) * w;
        const y = h - 4 - ((v - min) / span) * (h - 8);
        return <circle key={i} cx={x} cy={y} r={i === values.length - 1 ? 3 : 2} fill="#0f766e">
          <title>{`${labels?.[i] || i}: ${v}`}</title>
        </circle>;
      })}
    </svg>
  );
}
