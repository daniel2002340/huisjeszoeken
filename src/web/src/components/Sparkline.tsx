export function Sparkline({ points, width = 260, height = 40 }: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (points.length === 0) return <div className="muted">nog geen data</div>;
  const max = Math.max(...points, 1);
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map(
    (value, i) => `${(i * step).toFixed(1)},${(height - (value / max) * (height - 4) - 2).toFixed(1)}`,
  );

  return (
    <svg className="sparkline" width={width} height={height} role="img" aria-label="nieuwe woningen per dag">
      <polyline points={coords.join(' ')} fill="none" stroke="#0a7d38" strokeWidth="2" strokeLinejoin="round" />
      {points.length === 1 && <circle cx={0} cy={coords[0]?.split(',')[1]} r={3} fill="#0a7d38" />}
    </svg>
  );
}
