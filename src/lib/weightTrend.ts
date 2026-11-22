import { addDays } from './dates';
import type { Goal, WeighIn } from './types';

export const TREND_SMOOTHING = 0.1;
export const KCAL_PER_LB = 3500;
export const WINDOW_DAYS = 21;
/** Signed % of body weight per week the goal aims for (negative = losing). */
export const AIM_PCT_PER_WEEK: Record<Goal, number> = {
  lose_fat: -0.75,
  maintain: 0,
  build_muscle: 0.3,
};

export interface TrendPoint {
  date: string;
  kg: number | null;
  trendKg: number;
}
export interface Rate {
  kgPerWeek: number;
  pctPerWeek: number;
}
export type RateStatus = 'below' | 'slow' | 'on_track' | 'above';

/** One point per day from the first weigh-in (or `from`, if later) to `to`, inclusive. Seeds
 *  with the first weigh-in ever; trend += 0.1 x (weight - trend) on weigh-in days, carried
 *  forward otherwise. Weigh-ins may be unsorted. Empty when no weigh-in is on or before `to`. */
export function weightTrend(weighIns: WeighIn[], from: string, to: string): TrendPoint[] {
  const byDate = new Map<string, number>();
  for (const w of [...weighIns].sort((a, b) => a.date.localeCompare(b.date))) {
    if (w.date <= to) byDate.set(w.date, w.kg);
  }
  if (byDate.size === 0) return [];
  const first = [...byDate.keys()].sort()[0];
  const points: TrendPoint[] = [];
  let trend = 0;
  for (let date = first; date <= to; date = addDays(date, 1)) {
    const kg = byDate.get(date) ?? null;
    if (date === first) trend = kg as number;
    else if (kg !== null) trend += TREND_SMOOTHING * (kg - trend);
    if (date >= from) points.push({ date, kg, trendKg: trend });
  }
  return points;
}

/** Least-squares slope of trendKg per day x 7; pct relative to the last trendKg. null if < 2 points. */
export function weeklyRate(points: TrendPoint[]): Rate | null {
  const n = points.length;
  if (n < 2) return null;
  const meanX = (n - 1) / 2;
  const meanY = points.reduce((s, p) => s + p.trendKg, 0) / n;
  let num = 0;
  let den = 0;
  points.forEach((p, i) => {
    num += (i - meanX) * (p.trendKg - meanY);
    den += (i - meanX) ** 2;
  });
  const kgPerWeek = (num / den) * 7;
  return { kgPerWeek, pctPerWeek: (kgPerWeek / points[n - 1].trendKg) * 100 };
}

/** Least-squares slope of the actual weigh-ins (kg vs real day number, so gaps are fine) x 7, over
 *  weigh-ins dated from..to; pct relative to their mean. null if < 2 weigh-ins or all on one date. */
export function weighInRate(weighIns: WeighIn[], from: string, to: string): Rate | null {
  const ins = weighIns.filter((w) => w.date >= from && w.date <= to);
  if (ins.length < 2) return null;
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
  const xs = ins.map((w) => day(w.date));
  const n = ins.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ins.reduce((a, w) => a + w.kg, 0) / n;
  let num = 0;
  let den = 0;
  ins.forEach((w, i) => {
    num += (xs[i] - meanX) * (w.kg - meanY);
    den += (xs[i] - meanX) ** 2;
  });
  if (den === 0) return null;
  const kgPerWeek = (num / den) * 7;
  return { kgPerWeek, pctPerWeek: (kgPerWeek / meanY) * 100 };
}

/** Design table; boundaries belong to the band nearer on_track (build_muscle 0 is 'below'). */
export function classifyRate(goal: Goal, pctPerWeek: number): RateStatus {
  const p = pctPerWeek;
  switch (goal) {
    case 'lose_fat':
      if (p < -1.0) return 'below';
      if (p <= -0.5) return 'on_track';
      if (p <= -0.25) return 'slow';
      return 'above';
    case 'maintain':
      if (p < -0.25) return 'below';
      if (p <= 0.25) return 'on_track';
      return 'above';
    case 'build_muscle':
      if (p <= 0) return 'below';
      if (p < 0.1) return 'slow';
      if (p <= 0.5) return 'on_track';
      return 'above';
  }
}
