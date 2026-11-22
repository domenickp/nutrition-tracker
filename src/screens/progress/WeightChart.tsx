import type { Units } from '../../lib/types';
import { formatWeight, lbToKg } from '../../lib/units';
import type { TrendPoint } from '../../lib/weightTrend';

export interface WeightChartProps {
  trend: TrendPoint[];
  units: Units;
}

const W = 320;
const H = 170;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 14;
const PAD_B = 28;

function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Hand-drawn SVG: weigh-ins as dots, the smoothed trend as one line. */
export function WeightChart({ trend, units }: WeightChartProps) {
  if (trend.length === 0) return <p className="muted">No weigh-ins yet</p>;

  const values = trend.flatMap((p) => (p.kg === null ? [p.trendKg] : [p.kg, p.trendKg]));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const minPad = units === 'imperial' ? lbToKg(1) : 0.5;
  const pad = Math.max(minPad, (hi - lo) * 0.1);
  const yMin = lo - pad;
  const yMax = hi + pad;

  const n = trend.length;
  const x = (i: number) => (n === 1 ? W / 2 : PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R));
  const y = (kg: number) => PAD_T + (1 - (kg - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);
  const f = (v: number) => v.toFixed(1);

  const line = trend.map((p, i) => `${i === 0 ? 'M' : 'L'}${f(x(i))} ${f(y(p.trendKg))}`).join(' ');
  const first = trend[0];
  const last = trend[n - 1];
  const label = `Weight trend from ${formatWeight(first.trendKg, units)} on ${shortDate(first.date)} to ${formatWeight(last.trendKg, units)} on ${shortDate(last.date)}; range ${formatWeight(lo, units)} to ${formatWeight(hi, units)}.`;

  return (
    <svg className="wchart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line className="wchart__grid" x1={PAD_L} x2={W - PAD_R} y1={y(hi)} y2={y(hi)} />
      <line className="wchart__grid" x1={PAD_L} x2={W - PAD_R} y1={y(lo)} y2={y(lo)} />
      <text className="wchart__label" x={PAD_L} y={y(hi) - 4}>{formatWeight(hi, units)}</text>
      <text className="wchart__label" x={PAD_L} y={y(lo) + 11}>{formatWeight(lo, units)}</text>
      <path className="wchart__trend" d={line} fill="none" />
      {trend.map((p, i) =>
        p.kg === null ? null : <circle key={p.date} className="wchart__dot" cx={x(i)} cy={y(p.kg)} r={2.5} />,
      )}
      <text className="wchart__label" x={PAD_L} y={H - 6}>{shortDate(first.date)}</text>
      <text className="wchart__label" x={W - PAD_R} y={H - 6} textAnchor="end">{shortDate(last.date)}</text>
    </svg>
  );
}
