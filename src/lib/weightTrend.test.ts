import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import type { Goal } from './types';
import {
  AIM_PCT_PER_WEEK,
  classifyRate,
  weeklyRate,
  weightTrend,
  type TrendPoint,
} from './weightTrend';

describe('weightTrend', () => {
  it('empty', () => {
    expect(weightTrend([], '2026-11-01', '2026-11-10')).toEqual([]);
  });

  it('seeds and smooths', () => {
    const pts = weightTrend(
      [
        { date: '2026-11-01', kg: 100 },
        { date: '2026-11-02', kg: 90 },
      ],
      '2026-11-01',
      '2026-11-03',
    );
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ date: '2026-11-01', kg: 100, trendKg: 100 });
    expect(pts[1].date).toBe('2026-11-02');
    expect(pts[1].kg).toBe(90);
    expect(pts[1].trendKg).toBeCloseTo(99, 10);
    expect(pts[2].date).toBe('2026-11-03');
    expect(pts[2].kg).toBeNull();
    expect(pts[2].trendKg).toBeCloseTo(99, 10);
  });

  it('seeds from weigh-in before from', () => {
    const pts = weightTrend([{ date: '2026-10-01', kg: 100 }], '2026-11-01', '2026-11-03');
    expect(pts[0]).toEqual({ date: '2026-11-01', kg: null, trendKg: 100 });
    expect(pts).toHaveLength(3);
  });

  it('unsorted input', () => {
    const a = [
      { date: '2026-11-01', kg: 100 },
      { date: '2026-11-02', kg: 90 },
      { date: '2026-11-04', kg: 95 },
    ];
    const b = [a[2], a[0], a[1]];
    expect(weightTrend(b, '2026-11-01', '2026-11-05')).toEqual(
      weightTrend(a, '2026-11-01', '2026-11-05'),
    );
  });
});

describe('weeklyRate', () => {
  const falling = (n: number): TrendPoint[] =>
    Array.from({ length: n }, (_, i) => ({
      date: addDays('2026-11-01', i),
      kg: null,
      trendKg: 100 - 0.1 * i,
    }));

  it('falling 0.1 kg/day is about -0.7 kg/week', () => {
    const pts = falling(15);
    const r = weeklyRate(pts)!;
    expect(r.kgPerWeek).toBeCloseTo(-0.7, 6);
    expect(r.pctPerWeek).toBeCloseTo((-0.7 / pts[14].trendKg) * 100, 6);
  });

  it('one point is null', () => {
    expect(weeklyRate(falling(1))).toBeNull();
    expect(weeklyRate([])).toBeNull();
  });

  it('rate in kg and pct', () => {
    const r = weeklyRate(falling(10))!;
    expect(r.kgPerWeek).toBeCloseTo(-0.7, 6);
    expect(r.pctPerWeek).toBeCloseTo((-0.7 / 99.1) * 100, 6);
  });
});

describe('classifyRate', () => {
  const table: Array<[Goal, number, string]> = [
    ['lose_fat', -1.2, 'below'],
    ['lose_fat', -1.0, 'on_track'],
    ['lose_fat', -0.75, 'on_track'],
    ['lose_fat', -0.5, 'on_track'],
    ['lose_fat', -0.4, 'slow'],
    ['lose_fat', -0.25, 'slow'],
    ['lose_fat', -0.2, 'above'],
    ['lose_fat', 0.3, 'above'],
    ['maintain', -0.3, 'below'],
    ['maintain', -0.25, 'on_track'],
    ['maintain', 0, 'on_track'],
    ['maintain', 0.25, 'on_track'],
    ['maintain', 0.3, 'above'],
    ['build_muscle', -0.1, 'below'],
    ['build_muscle', 0, 'below'],
    ['build_muscle', 0.05, 'slow'],
    ['build_muscle', 0.1, 'on_track'],
    ['build_muscle', 0.5, 'on_track'],
    ['build_muscle', 0.6, 'above'],
  ];
  it.each(table)('%s %s -> %s', (goal, pct, expected) => {
    expect(classifyRate(goal, pct)).toBe(expected);
  });

  it('aim rates', () => {
    expect(AIM_PCT_PER_WEEK).toEqual({ lose_fat: -0.75, maintain: 0, build_muscle: 0.3 });
  });
});
