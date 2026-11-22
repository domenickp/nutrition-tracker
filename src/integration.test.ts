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
  userId: 'u1', birthMonth: 6, birthYear: 1990, sex: 'male', heightCm: 180, goal: 'maintain',
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
