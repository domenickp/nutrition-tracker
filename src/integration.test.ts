// Cross-module check (coordinator-owned): pieces from different builders agree on real data.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeWorkout, parseWorkoutJson, rulesFromAnalysis, summarizeWorkout } from './lib/workoutImport';
import { computeTargets } from './lib/targets';
import { computeEntry, amountOptions, sumNutrients } from './lib/portions';
import { fromWorkout, toWorkout, fromFood, toFood, fromFoodLog, toFoodLog, fromExerciseRule, toExerciseRule } from './data/mappers';
import { normalizeFoodDetail } from '../supabase/functions/usda/normalize';
import type { Profile } from './lib/types';
import { loadReferenceRoutine } from './test/referenceRoutine';

const profile: Profile = {
  userId: 'u1', birthMonth: 6, birthYear: 1990, sex: 'male', heightCm: 180, goal: 'maintain', everydayActivity: 'sedentary',
  units: 'imperial', timezone: 'America/New_York', overrideKcalAdjustPct: null,
  overrideProteinGPerLb: null, overrideFatPct: null, overrideWaterBaseMlPerKg: null,
};

// PostgREST returns numeric columns as JSON numbers or strings; simulate the string case.
const viaDb = <T,>(row: Record<string, unknown>, to: (r: Record<string, unknown>) => T): T =>
  to({ id: 'row-id', user_id: 'u1', logged_at: '2026-11-16T12:00:00Z', last_used_at: null,
    ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])) });

describe('workout import → database row → targets', () => {
  it('sample workout survives the DB round-trip and feeds computeTargets', () => {
    const parsed = parseWorkoutJson(readFileSync('docs/samples/workout-2026-11-16-d3.json', 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const analysis = analyzeWorkout(parsed.workouts[0], { timeZone: profile.timezone, rules: [] });
    const summary = summarizeWorkout(analysis);
    const stored = viaDb(fromWorkout(summary) as Record<string, unknown>, toWorkout);
    expect(stored.date).toBe('2026-11-15');
    expect(stored.lightCardioH).toBeCloseTo(summary.lightCardioH, 6);
    expect(stored.liftingH).toBeCloseTo(summary.liftingH, 6);

    const rules = rulesFromAnalysis(analysis).map((r) => viaDb(fromExerciseRule(r) as Record<string, unknown>, toExerciseRule));
    const again = analyzeWorkout(parsed.workouts[0], { timeZone: profile.timezone, rules });
    expect(again.exercises.every((e) => e.source === 'rule-id')).toBe(true);

    const t = computeTargets({ profile, weightKg: 80, date: stored.date, activity: null, workouts: [stored] });
    expect(t.targets.kcal).toBeGreaterThan(2500);
    expect(t.exerciseH).toBeCloseTo(summary.lightCardioH + summary.liftingH, 6);
  });
});

describe('USDA food → saved food → log entry', () => {
  it('normalized USDA detail round-trips through the foods table and logs by portion', () => {
    const detail = JSON.parse(readFileSync('supabase/functions/usda/fixtures/foundation-banana.json', 'utf8'));
    const usda = normalizeFoodDetail(detail);
    const food = viaDb(fromFood(usda) as Record<string, unknown>, toFood);
    expect(food.fdcId).toBe(usda.fdcId);
    expect(food.portions).toEqual(usda.portions);
    const opts = amountOptions(food);
    const grams = opts.find((o) => o.kind === 'grams');
    expect(grams).toBeDefined();
    const entry = computeEntry(food, 150, grams!);
    const log = viaDb(fromFoodLog({ date: '2026-11-16', foodId: food.id, name: food.name, ...entry, quantity: 150 }) as Record<string, unknown>, toFoodLog);
    expect(log.totals).toEqual(entry.totals);
    expect(sumNutrients([log.totals]).kcal).toBeCloseTo(food.nutrients.kcal * 1.5, 0);
  });
});

describe('workout tab session → workouts row → session again', () => {
  it('a FatherWorkout session survives the workouts table and feeds the workout screen helpers', async () => {
    const { validateSession, normalizeSession, latestCompletedByDay, defaultDay, summarizeSession, initialSets } =
      await import('./lib/workoutSession');
    const { routineDay } = await import('./lib/routine');
    const ROUTINE = loadReferenceRoutine();
    const session = normalizeSession(JSON.parse(readFileSync('docs/samples/workout-2026-11-16-d3.json', 'utf8')));
    expect(validateSession(session, ROUTINE)).toEqual([]);
    const summary = summarizeWorkout(analyzeWorkout(session, { timeZone: profile.timezone, rules: [] }));
    const stored = viaDb(fromWorkout(summary) as Record<string, unknown>, toWorkout);
    expect(stored.date).toBe('2026-11-15');
    // raw is jsonb: numbers stay numbers, so it must still be a valid session when read back.
    const back = normalizeSession(JSON.parse(JSON.stringify(stored.raw)));
    expect(validateSession(back, ROUTINE)).toEqual([]);
    const last = latestCompletedByDay([back], ROUTINE.days.map((d) => d.day));
    expect(last['3']?.id).toBe(session.id);
    expect(defaultDay(ROUTINE, [summarizeSession(back)])).toBe(4);
    const ex = routineDay(ROUTINE, 3)!.exercises.find((e) => !e.warmup && e.reps !== null)!;
    const entry = back.entries.find((e) => e.exerciseId === ex.id);
    if (entry) expect(initialSets(ex, entry)[0].reps).toBe(entry.sets.find((s) => s.done)?.reps ?? null);
  });
});

describe('weight trend: suggestion record → table row → analysis', () => {
  it('a snooze written by the data layer hides that kind in analyzeWeight; an accept starts the cooldown', async () => {
    const { fromSuggestionRecord, toSuggestionRecord } = await import('./data/mappers');
    const { analyzeWeight } = await import('./lib/weightAnalysis');
    const { addDays } = await import('./lib/dates');
    const today = '2026-11-22';
    const loseFat: Profile = { ...profile, goal: 'lose_fat' };
    // 21 days ending yesterday: 2000 kcal a day, losing ~2 % a week (too fast for lose_fat).
    const weighIns = Array.from({ length: 22 }, (_, i) => ({
      date: addDays(today, -21 + i), kg: 90 * (1 - (0.02 / 7) * i),
    }));
    const days = Array.from({ length: 21 }, (_, i) => ({
      date: addDays(today, -21 + i), intakeKcal: 2000, proteinG: 80, activity: null, workouts: [],
    }));
    const row = (r: Parameters<typeof fromSuggestionRecord>[0], createdAt: string) =>
      toSuggestionRecord({ id: 'r', user_id: 'u1', created_at: createdAt, ...fromSuggestionRecord(r) });
    const none = { oldAdjustPct: null, newAdjustPct: null, oldKcal: null, newKcal: null, reason: null };

    const base = analyzeWeight({ profile: loseFat, today, weighIns, days, records: [] });
    expect(base.status).toBe('below');
    expect(base.suggestions.map((s) => s.kind)).toEqual(expect.arrayContaining(['calorie', 'protein']));

    const snoozed = row({ ...none, kind: 'protein', action: 'snoozed', snoozeUntil: addDays(today, 7) },
      '2026-11-22T15:00:00Z');
    const kinds = analyzeWeight({ profile: loseFat, today, weighIns, days, records: [snoozed] })
      .suggestions.map((s) => s.kind);
    expect(kinds).toContain('calorie');
    expect(kinds).not.toContain('protein');

    const accepted = row({ ...none, kind: 'calorie', action: 'accepted', snoozeUntil: null,
      oldAdjustPct: -20, newAdjustPct: -12, oldKcal: 2000, newKcal: 2200, reason: 'x' }, '2026-11-20T02:00:00Z');
    expect(analyzeWeight({ profile: loseFat, today, weighIns, days, records: [accepted] })
      .suggestions.map((s) => s.kind)).not.toContain('calorie');
  });
});
