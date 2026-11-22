import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import { computeTargets } from './targets';
import type { AnalysisDay, DailyActivity, Goal, Profile, SuggestionRecord, WeighIn } from './types';
import { analyzeWeight } from './weightAnalysis';

const TODAY = '2026-11-22';
const LB = 2.20462;

function profile(goal: Goal, over: Partial<Profile> = {}): Profile {
  return {
    userId: 'u',
    birthMonth: 1,
    birthYear: 1990,
    sex: 'male',
    heightCm: 180,
    goal,
    units: 'imperial',
    timezone: 'UTC',
    overrideKcalAdjustPct: null,
    overrideProteinGPerLb: null,
    overrideFatPct: null,
    overrideWaterBaseMlPerKg: null,
    ...over,
  };
}

/** Weigh-ins every day from today-60 to today-1 on a line ending at 80 kg with the given pct/week slope. */
function weighIns(pctPerWeek: number, from = addDays(TODAY, -60)): WeighIn[] {
  const perDay = (80 * pctPerWeek) / 100 / 7;
  const out: WeighIn[] = [];
  for (let d = from; d < TODAY; d = addDays(d, 1)) {
    const back = (new Date(TODAY).getTime() - new Date(d).getTime()) / 86400000;
    out.push({ date: d, kg: 80 - perDay * back });
  }
  return out;
}

function days(intake: number | null, protein: number | null = 150, over: (d: AnalysisDay, i: number) => AnalysisDay = (d) => d): AnalysisDay[] {
  const out: AnalysisDay[] = [];
  for (let i = 0; i < 21; i++) {
    const date = addDays(TODAY, -21 + i);
    out.push(over({ date, intakeKcal: intake, proteinG: intake === null ? null : protein, activity: null, workouts: [] }, i));
  }
  return out;
}

function run(goal: Goal, pct: number, opts: { intake?: number; protein?: number; over?: Partial<Profile>; records?: SuggestionRecord[] | null; dayList?: AnalysisDay[] } = {}) {
  return analyzeWeight({
    profile: profile(goal, opts.over),
    today: TODAY,
    weighIns: weighIns(pct),
    days: opts.dayList ?? days(opts.intake ?? 2000, opts.protein ?? 150),
    records: opts.records === undefined ? [] : opts.records,
  });
}

const kinds = (a: ReturnType<typeof run>) => a.suggestions.map((s) => s.kind);
const rec = (r: Partial<SuggestionRecord>): SuggestionRecord => ({
  id: 'r', kind: 'calorie', action: 'snoozed', snoozeUntil: null, oldAdjustPct: null, newAdjustPct: null,
  oldKcal: null, newKcal: null, reason: null, createdAt: '2026-11-01T12:00:00Z', ...r,
});

describe('analyzeWeight', () => {
  it('collecting when under 14 days', () => {
    const start = addDays(TODAY, -10);
    const a = analyzeWeight({
      profile: profile('lose_fat'),
      today: TODAY,
      weighIns: weighIns(-0.7, start),
      days: days(2000, 150, (d) => (d.date < start ? { ...d, intakeKcal: null, proteinG: null } : d)),
      records: [],
    });
    expect(a.status).toBe('collecting');
    expect(a.window.days).toBe(10);
    expect(a.missing).toContain('4 more days');
    expect(a.suggestions).toEqual([]);
  });

  it('collecting when weighed under 60 %', () => {
    const a = analyzeWeight({
      profile: profile('lose_fat'),
      today: TODAY,
      weighIns: weighIns(-0.7).filter((w) => w.date < addDays(TODAY, -21) || w.date.endsWith('0')),
      days: days(2000),
      records: [],
    });
    expect(a.status).toBe('collecting');
    expect(a.missing).toContain('weigh in more often');
  });

  it('implied burn', () => {
    const lbPerWeekPct = ((1 / LB) / 80) * 100; // 1 lb/week as % of 80 kg
    const a = run('lose_fat', -lbPerWeekPct);
    expect(a.status).not.toBe('collecting');
    expect(Math.abs((a.impliedBurn as number) - 2500)).toBeLessThanOrEqual(30);
  });

  it('no warm-up bias', () => {
    const kgPerDay = 1 / LB / 7;
    const start = addDays(TODAY, -21);
    const w: WeighIn[] = [];
    for (let i = 0; i < 21; i++) w.push({ date: addDays(start, i), kg: 90.7 - kgPerDay * i }); // ~200 lb
    const a = analyzeWeight({ profile: profile('lose_fat'), today: TODAY, weighIns: w, days: days(2000), records: [] });
    expect(a.window.days).toBe(21);
    expect(Math.abs((a.impliedBurn as number) - 2500)).toBeLessThanOrEqual(30);
    expect(Math.abs((a.rate as { kgPerWeek: number }).kgPerWeek + 0.4536)).toBeLessThan(0.02);
    expect(a.status).toBe('on_track');
  });

  it('lose_fat too fast -> calorie up, never less exercise', () => {
    const a = run('lose_fat', -1.4);
    expect(a.status).toBe('below');
    const c = a.suggestions.find((s) => s.kind === 'calorie');
    expect(c).toBeDefined();
    expect(c!.newAdjustPct as number).toBeGreaterThan(c!.oldAdjustPct);
    for (const s of a.suggestions) {
      expect(`${s.title} ${s.reason}`.toLowerCase()).not.toMatch(/less exercise|exercise less/);
    }
  });

  it('clamped to 10 %', () => {
    const a = run('lose_fat', -2, { intake: 1200 });
    const c = a.suggestions.find((s) => s.kind === 'calorie')!;
    const ratio = (1 + (c.newAdjustPct as number) / 100) / (1 + c.oldAdjustPct / 100);
    expect(ratio).toBeLessThanOrEqual(1.1 + 1e-9);
    expect(ratio).toBeGreaterThan(1.09);
  });

  it('no suggestion under 3 %', () => {
    const base = run('lose_fat', -1.05, { over: { overrideKcalAdjustPct: -10 } }).suggestions.find((s) => s.kind === 'calorie')!;
    expect(base).toBeDefined();
    const n = base.newAdjustPct as number;
    expect((1 + n / 100) / 0.9).toBeGreaterThan(1.03);
    const near = run('lose_fat', -1.05, { over: { overrideKcalAdjustPct: n - 1 } });
    expect(kinds(near)).not.toContain('calorie');
  });

  it('uses goal default when no override', () => {
    const a = run('lose_fat', -1.4);
    expect(a.suggestions.find((s) => s.kind === 'calorie')!.oldAdjustPct).toBe(-20);
    expect(run('lose_fat', -1.4, { over: { overrideKcalAdjustPct: -15 } }).suggestions[0].oldAdjustPct).toBe(-15);
  });

  it('logging gate: 3 low-log days -> only logging', () => {
    const a = run('lose_fat', -1.4, { dayList: days(2000, 150, (d, i) => (i < 3 ? { ...d, intakeKcal: 500 } : d)) });
    expect(a.window.lowLogDays).toBe(3);
    expect(kinds(a)).toEqual(['logging']);
  });

  it('protein: lose_fat too fast and low protein', () => {
    expect(kinds(run('lose_fat', -1.4, { protein: 100 }))).toContain('protein');
    expect(kinds(run('lose_fat', -1.4, { protein: 200 }))).not.toContain('protein');
  });

  it('stalled -> calorie down and cardio', () => {
    const a = run('lose_fat', -0.1);
    const c = a.suggestions.find((s) => s.kind === 'calorie')!;
    expect(c.newAdjustPct as number).toBeLessThan(c.oldAdjustPct);
    const cardio = a.suggestions.find((s) => s.kind === 'cardio')!;
    expect(cardio.newAdjustPct).toBeNull();
    expect(cardio.reason).toMatch(/about (\d+)0 kcal/);
  });

  it('slow -> no suggestion', () => {
    const a = run('lose_fat', -0.4);
    expect(a.status).toBe('slow');
    expect(a.suggestions).toEqual([]);
  });

  it('build_muscle lifting', () => {
    const lift = (n: number) =>
      days(2800, 150, (d, i) => (i >= 21 - n * 2 && i % 2 === 1 ? { ...d, workouts: [{ lightCardioH: 0, strenuousCardioH: 0, liftingH: 1 }] } : d));
    expect(kinds(run('build_muscle', 0.3, { intake: 2800, dayList: lift(2) }))).toContain('lifting');
    expect(kinds(run('build_muscle', 0.3, { intake: 2800, dayList: lift(4) }))).not.toContain('lifting');
    // manual hours count at >= 0.5 h
    const manual = days(2800, 150, (d, i) =>
      i >= 13 && i % 2 === 1
        ? { ...d, activity: { date: d.date, mode: 'hours', directKcal: null, hours: { sedentaryH: 0, lightCardioH: 0, strenuousCardioH: 0, liftingH: 0.5 } } as DailyActivity }
        : d);
    expect(kinds(run('build_muscle', 0.3, { dayList: manual }))).not.toContain('lifting'); // 4 sessions
  });

  it('maintain food only', () => {
    const a = run('maintain', -0.8);
    expect(kinds(a)).toEqual(['calorie']);
  });

  it('snoozed kind hidden', () => {
    expect(kinds(run('maintain', -0.8, { records: [rec({ snoozeUntil: addDays(TODAY, 3) })] }))).toEqual([]);
    expect(kinds(run('maintain', -0.8, { records: [rec({ snoozeUntil: addDays(TODAY, -1) })] }))).toEqual(['calorie']);
  });

  it('cooldown after accept', () => {
    const accepted = (createdAt: string) => rec({ action: 'accepted', createdAt });
    expect(kinds(run('maintain', -0.8, { records: [accepted('2026-11-19T12:00:00Z')] }))).toEqual([]);
    expect(kinds(run('maintain', -0.8, { records: [accepted('2026-11-15T12:00:00Z')] }))).toEqual(['calorie']);
  });

  it('records unavailable', () => {
    const a = run('maintain', -0.8, { records: null });
    expect(a.suggestions).toEqual([]);
    expect(a.status).toBe('below');
  });

  it('direct mode day burn', () => {
    const direct: DailyActivity = { date: '', mode: 'direct', directKcal: 600, hours: { sedentaryH: 0, lightCardioH: 0, strenuousCardioH: 0, liftingH: 0 } };
    const a = run('maintain', 0, { dayList: days(2000, 150, (d) => ({ ...d, activity: { ...direct, date: d.date } })) });
    const expected = computeTargets({ profile: profile('maintain'), weightKg: 80, date: TODAY, activity: direct, workouts: [] }).burn;
    expect(Math.abs((a.avgEstimatedBurn as number) - expected)).toBeLessThanOrEqual(2);
  });
});
