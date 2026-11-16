import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyzeWorkout, parseWorkoutJson, rulesFromAnalysis, summarizeWorkout,
} from './workoutImport';
import type { ExerciseRule } from './types';

const sampleText = readFileSync('docs/samples/workout-2026-11-16-d3.json', 'utf8');
const NY = 'America/New_York';

function mk(over: Record<string, unknown> = {}, entries: unknown[] = []) {
  return {
    id: 'w1', schemaVersion: 1, startedAt: '2026-11-16T15:00:00Z',
    completedAt: '2026-11-16T16:00:00Z', entries, ...over,
  };
}
const bike = (name = 'Stationary Bike', id = 'x-bike', min = 30) => ({
  name, exerciseId: id, sets: [{ done: true, timeMin: min, timeSec: null, reps: null, weightLb: null }],
});

describe('sample export', () => {
  const parsed = parseWorkoutJson(sampleText);
  it('parses', () => {
    expect(parsed.ok).toBe(true);
  });
  it('analyzes and summarizes', () => {
    if (!parsed.ok) throw new Error('parse');
    const a = analyzeWorkout(parsed.workouts[0], { timeZone: NY, rules: [] });
    expect(a.date).toBe('2026-11-15');
    expect(analyzeWorkout(parsed.workouts[0], { timeZone: 'UTC', rules: [] }).date).toBe('2026-11-16');
    const b = a.exercises.find((e) => /bike/i.test(e.name))!;
    expect(b.category).toBe('light_cardio');
    expect(b.source).toBe('guess');
    expect(b.timedMin).toBe(40);
    const hang = a.exercises.find((e) => /hang/i.test(e.name));
    expect(hang?.category).toBe('lifting');
    const s = summarizeWorkout(a);
    expect(s.lightCardioH).toBeCloseTo(0.6667, 3);
    expect(s.liftingH).toBeCloseTo(0.6216, 3);
    expect(s.strenuousCardioH).toBe(0);
    expect(s.raw).toBe(parsed.workouts[0]);
  });
});

describe('parseWorkoutJson', () => {
  it('rejects bad JSON', () => {
    const r = parseWorkoutJson('{nope');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Not valid JSON: /);
  });
  it('rejects wrong schemaVersion', () => {
    const r = parseWorkoutJson(JSON.stringify(mk({ schemaVersion: 2 })));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/schemaVersion/);
  });
  it('rejects missing id', () => {
    const w = mk();
    delete (w as Record<string, unknown>).id;
    const r = parseWorkoutJson(JSON.stringify(w));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/"id"/);
  });
  it('rejects missing entries, non-objects and empty arrays', () => {
    expect(parseWorkoutJson(JSON.stringify(mk({ entries: 'x' }))).ok).toBe(false);
    expect(parseWorkoutJson('[1]').ok).toBe(false);
    expect(parseWorkoutJson('null').ok).toBe(false);
    expect(parseWorkoutJson('[]').ok).toBe(false);
  });
  it('accepts an array', () => {
    const r = parseWorkoutJson(JSON.stringify([mk(), mk({ id: 'w2' })]));
    expect(r.ok && r.workouts.length).toBe(2);
  });
  it('wraps a single object', () => {
    const r = parseWorkoutJson(JSON.stringify(mk()));
    expect(r.ok && r.workouts.length).toBe(1);
  });
});

describe('classification precedence', () => {
  const raw = mk({}, [bike('Warm Up: Stationary Bike', 'd3-bike')]);
  const rule = (exerciseId: string, name: string, category: ExerciseRule['category']): ExerciseRule =>
    ({ exerciseId, name, category });

  it('guess when no rules', () => {
    const e = analyzeWorkout(raw, { timeZone: NY, rules: [] }).exercises[0];
    expect([e.category, e.source]).toEqual(['light_cardio', 'guess']);
  });
  it('name rule matches through Warm Up prefix, case-insensitively', () => {
    const e = analyzeWorkout(raw, { timeZone: NY, rules: [rule('other', 'stationary bike', 'lifting')] })
      .exercises[0];
    expect([e.category, e.source]).toEqual(['lifting', 'rule-name']);
  });
  it('id rule beats name rule beats guess', () => {
    const e = analyzeWorkout(raw, {
      timeZone: NY,
      rules: [rule('other', 'Stationary Bike', 'lifting'), rule('d3-bike', 'zzz', 'strenuous_cardio')],
    }).exercises[0];
    expect([e.category, e.source]).toEqual(['strenuous_cardio', 'rule-id']);
  });
  it('timed holds, keyword-with-reps and mixed sets stay lifting', () => {
    const r = mk({}, [
      { name: 'Dead Hang', exerciseId: 'a', sets: [{ done: true, timeSec: 30 }] },
      { name: 'Treadmill Lunges', exerciseId: 'b', sets: [{ done: true, reps: 10, timeMin: 1 }] },
      { name: 'Run', exerciseId: 'c', sets: [{ done: true, timeMin: 5 }, { done: true, reps: 3 }] },
    ]);
    const ex = analyzeWorkout(r, { timeZone: NY, rules: [] }).exercises;
    expect(ex.map((e) => e.category)).toEqual(['lifting', 'lifting', 'lifting']);
  });
});

describe('done sets and timing', () => {
  it('ignores undone sets and counts timeSec', () => {
    const r = mk({}, [{
      name: 'Rowing Machine', exerciseId: 'r',
      sets: [{ done: true, timeMin: 10, timeSec: 30 }, { done: false, timeMin: 99 }, { done: true, timeSec: 90 }],
    }, { name: 'Bench', exerciseId: 'b', sets: [{ done: false, reps: 5, weightLb: 100 }] }]);
    const a = analyzeWorkout(r, { timeZone: NY, rules: [] });
    expect(a.exercises[0]).toMatchObject({ category: 'light_cardio', doneSets: 2 });
    expect(a.exercises[0].timedMin).toBeCloseTo(12, 6);
    expect(a.exercises[1]).toMatchObject({ doneSets: 0, timedMin: 0, category: 'lifting' });
    expect(summarizeWorkout(a).liftingH).toBeCloseTo((60 - 12) / 60, 6);
  });
  it('treats 0 as unused', () => {
    const r = mk({}, [{ name: 'Walk', exerciseId: 'w', sets: [{ done: true, reps: 0, weightLb: 0, timeMin: 20 }] }]);
    expect(analyzeWorkout(r, { timeZone: NY, rules: [] }).exercises[0].category).toBe('light_cardio');
  });
});

describe('session time', () => {
  const entries = [bike()];
  it('falls back to savedAt', () => {
    const r = mk({ completedAt: undefined, savedAt: '2026-11-16T15:45:00Z' }, entries);
    const a = analyzeWorkout(r, { timeZone: NY, rules: [] });
    expect(a.completedAt).toBe('2026-11-16T15:45:00Z');
    expect(a.sessionMin).toBe(45);
  });
  it('null when both missing; override works', () => {
    const r = mk({ completedAt: null }, entries);
    const a = analyzeWorkout(r, { timeZone: NY, rules: [] });
    expect(a.completedAt).toBeNull();
    expect(a.sessionMin).toBeNull();
    expect(summarizeWorkout(a).liftingH).toBe(0);
    expect(summarizeWorkout(a).lightCardioH).toBeCloseTo(0.5, 6);
    expect(summarizeWorkout(a, { sessionMin: 90 }).liftingH).toBeCloseTo(1, 6);
  });
  it('floors lifting at 0', () => {
    const a = analyzeWorkout(mk({}, [bike('Bike', 'b', 90)]), { timeZone: NY, rules: [] });
    expect(summarizeWorkout(a).liftingH).toBe(0);
  });
});

describe('overrides and rules', () => {
  const a = analyzeWorkout(mk({}, [bike()]), { timeZone: NY, rules: [] });
  it('override to strenuous moves hours', () => {
    const s = summarizeWorkout(a, { categories: { 'x-bike': 'strenuous_cardio' } });
    expect(s.lightCardioH).toBe(0);
    expect(s.strenuousCardioH).toBeCloseTo(0.5, 6);
    expect(s.liftingH).toBeCloseTo(0.5, 6);
  });
  it('override to lifting drops cardio', () => {
    const s = summarizeWorkout(a, { categories: { 'x-bike': 'lifting' } });
    expect(s.lightCardioH).toBe(0);
    expect(s.liftingH).toBeCloseTo(1, 6);
  });
  it('rulesFromAnalysis applies overrides', () => {
    expect(rulesFromAnalysis(a)).toEqual([
      { exerciseId: 'x-bike', name: 'Stationary Bike', category: 'light_cardio' },
    ]);
    expect(rulesFromAnalysis(a, { 'x-bike': 'lifting' })[0].category).toBe('lifting');
  });
});
