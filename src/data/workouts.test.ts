import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  // Results returned, in order, for each `from('workouts')` query.
  results: [] as Array<{ data?: unknown; error?: { message: string } | null }>,
  ops: [] as Array<Array<[string, unknown[]]>>,
  getProfile: vi.fn(),
  listExerciseRules: vi.fn(),
  saveExerciseRules: vi.fn(),
  saveWorkout: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const ops: Array<[string, unknown[]]> = [];
      h.ops.push(ops);
      const proxy: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            const res = h.results.shift() ?? { data: [], error: null };
            return (resolve: (v: unknown) => void) => resolve({ data: res.data ?? null, error: res.error ?? null });
          }
          return (...args: unknown[]) => { ops.push([prop, args]); return proxy; };
        },
      });
      return proxy;
    },
  },
}));
vi.mock('./api', () => ({
  getProfile: h.getProfile,
  listExerciseRules: h.listExerciseRules,
  saveExerciseRules: h.saveExerciseRules,
  saveWorkout: h.saveWorkout,
}));

import { getWorkoutSession, importWorkoutSessions, loadWorkoutData, saveWorkoutSession } from './workouts';
import type { WorkoutSession } from '../lib/workoutSession';

const sample = (): WorkoutSession =>
  JSON.parse(readFileSync('docs/samples/workout-2026-11-16-d3.json', 'utf8'));

const mk = (id: string, day: number, startedAt: string, completedAt: string | null): WorkoutSession => ({
  schemaVersion: 1, id, day, startedAt, completedAt, notes: null,
  entries: [{ exerciseId: 'x', name: 'X', notes: null, sets: [{ reps: 1, weightLb: 1, timeMin: null, timeSec: null, done: true }] }],
});

beforeEach(() => {
  h.results.length = 0;
  h.ops.length = 0;
  h.getProfile.mockReset().mockResolvedValue({ timezone: 'America/New_York' });
  h.listExerciseRules.mockReset().mockResolvedValue([]);
  h.saveExerciseRules.mockReset().mockResolvedValue(undefined);
  h.saveWorkout.mockReset().mockResolvedValue('saved');
});

describe('loadWorkoutData', () => {
  it('skips invalid raw rows and summarizes recent; lastByDay uses raw.completedAt', async () => {
    const a = mk('a', 1, '2026-11-10T10:00:00.000Z', '2026-11-10T11:00:00.000Z');
    const b = mk('b', 2, '2026-11-09T10:00:00.000Z', null);
    h.results.push({ data: [{ raw: a }, { raw: { junk: true } }, { raw: null }, { raw: b }] });
    // per-day queries for days 1..4
    h.results.push({ data: [{ raw: { junk: 1 } }, { raw: mk('a-old', 1, '2026-11-01T10:00:00.000Z', null) }, { raw: a }] });
    h.results.push({ data: [] });
    h.results.push({ data: [{ raw: mk('c', 3, '2026-11-05T10:00:00.000Z', '2026-11-05T11:00:00.000Z') }] });
    h.results.push({ data: [] });

    const out = await loadWorkoutData();
    expect(out.recent.map((s) => s.id)).toEqual(['a', 'b']);
    expect(out.recent[0]).toMatchObject({ exerciseCount: 1, setsDone: 1, completedAt: '2026-11-10T11:00:00.000Z' });
    expect(Object.keys(out.lastByDay)).toEqual(['1', '2', '3', '4']);
    expect(out.lastByDay['1']?.id).toBe('a');
    expect(out.lastByDay['2']).toBeNull();
    expect(out.lastByDay['3']?.id).toBe('c');
    expect(out.lastByDay['4']).toBeNull();
    expect(h.ops[0].find(([op]) => op === 'limit')?.[1]).toEqual([20]);
  });

  it('throws on a query error', async () => {
    h.results.push({ error: { message: 'boom' } });
    await expect(loadWorkoutData()).rejects.toThrow('boom');
  });
});

describe('getWorkoutSession', () => {
  it('returns the session', async () => {
    const s = mk('a', 1, '2026-11-10T10:00:00.000Z', null);
    h.results.push({ data: { raw: s } });
    expect((await getWorkoutSession('a')).id).toBe('a');
  });
  it('throws Session not found', async () => {
    h.results.push({ data: null });
    await expect(getWorkoutSession('nope')).rejects.toThrow('Session not found: nope');
    h.results.push({ data: { raw: { junk: true } } });
    await expect(getWorkoutSession('bad')).rejects.toThrow('Session not found: bad');
  });
});

describe('saveWorkoutSession', () => {
  it('rejects an invalid session without saving', async () => {
    const s = { ...sample(), day: 9 };
    await expect(saveWorkoutSession(s)).rejects.toThrow(/^Invalid session: .*not in the routine/);
    expect(h.saveWorkout).not.toHaveBeenCalled();
  });

  it('sets savedAt from now, replaces, and returns the profile-timezone date', async () => {
    const now = new Date('2026-11-18T12:00:00.000Z');
    const res = await saveWorkoutSession(sample(), now);
    expect(res).toEqual({ id: sample().id, date: '2026-11-15', savedAt: '2026-11-18T12:00:00.000Z' });
    expect(h.saveWorkout).toHaveBeenCalledTimes(1);
    const [summary, replace] = h.saveWorkout.mock.calls[0];
    expect(replace).toBe(true);
    expect(summary.date).toBe('2026-11-15');
    expect(summary.raw.savedAt).toBe('2026-11-18T12:00:00.000Z');
    expect(h.saveExerciseRules).toHaveBeenCalledTimes(1);
  });

  it('throws when there is no profile', async () => {
    h.getProfile.mockResolvedValue(null);
    await expect(saveWorkoutSession(sample())).rejects.toThrow(/profile/);
    expect(h.saveWorkout).not.toHaveBeenCalled();
  });
});

describe('importWorkoutSessions', () => {
  it('counts imported, existing and invalid, saving with replace=false', async () => {
    const s1 = sample();
    const s2 = { ...sample(), id: 'second-id' };
    h.saveWorkout.mockResolvedValueOnce('saved').mockResolvedValueOnce('exists');
    const out = await importWorkoutSessions([s1, { nope: true }, s2]);
    expect(out.imported).toBe(1);
    expect(out.existing).toBe(1);
    expect(out.invalid).toHaveLength(1);
    expect(out.invalid[0].index).toBe(1);
    expect(out.invalid[0].errors.length).toBeGreaterThan(0);
    expect(h.saveWorkout).toHaveBeenCalledTimes(2);
    expect(h.saveWorkout.mock.calls.every((c) => c[1] === false)).toBe(true);
    expect(h.saveExerciseRules).toHaveBeenCalledTimes(1);
  });

  it('with only invalid items touches nothing', async () => {
    const out = await importWorkoutSessions([1, null]);
    expect(out).toMatchObject({ imported: 0, existing: 0 });
    expect(out.invalid.map((i) => i.index)).toEqual([0, 1]);
    expect(h.saveWorkout).not.toHaveBeenCalled();
    expect(h.saveExerciseRules).not.toHaveBeenCalled();
  });
});
