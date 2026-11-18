import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUTINE, type Routine, type RoutineExercise } from './routine';
import {
  buildSession, countDone, defaultDay, DRAFT_KEY, formatClock, formatLastTime, formatNum,
  formatSessionDate, formatTarget, initialSets, isSeconds, isTimed, latestCompletedByDay,
  newSetFor, normalizeSession, parseRestSeconds, removeSetAt, sortSessionsNewestFirst,
  summarizeSession, toNum, validateSession, type SessionSet, type WorkoutSession,
} from './workoutSession';

const routine = {
  schemaVersion: 1,
  days: [
    { day: 1, areas: 'Chest', exercises: [
      { id: 'd1-bike', name: 'Warm Up: Bike' },
      { id: 'd1-press', name: 'Incline Dumbbell Press' },
    ] },
    { day: 2, areas: 'Back', exercises: [{ id: 'd2-row', name: 'Chest-Supported Incline Row' }] },
    { day: 3, areas: 'Legs', exercises: [{ id: 'd3-calf', name: 'Single-Leg Calf Raise' }] },
  ],
} as unknown as Routine;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function valid(): any {
  return {
    schemaVersion: 1,
    id: '0b9c6a8e-3f2d-4c1e-9a77-2f6f1d2c4b10',
    day: 1,
    startedAt: '2026-10-11T14:30:00.000Z',
    completedAt: '2026-10-11T15:25:00.000Z',
    entries: [{
      exerciseId: 'd1-press',
      name: 'Incline Dumbbell Press',
      sets: [
        { reps: 12, weightLb: 40, timeMin: null, done: true },
        { reps: null, weightLb: null, timeMin: null, done: false },
      ],
      notes: 'heavy',
    }],
    notes: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expectError(mutate: (s: any) => void, pattern: RegExp, rt: Routine | undefined = routine) {
  const s = valid();
  mutate(s);
  const errs = validateSession(s, rt);
  expect(errs.length).toBeGreaterThan(0);
  expect(errs.some((e) => pattern.test(e)), JSON.stringify(errs)).toBe(true);
}

describe('validateSession', () => {
  it('accepts valid sessions', () => {
    expect(validateSession(valid(), routine)).toEqual([]);
    expect(validateSession(valid())).toEqual([]);
    const partial = valid(); partial.completedAt = null;
    expect(validateSession(partial, routine)).toEqual([]);
  });
  it('reports broken rules', () => {
    expectError((s) => { delete s.id; }, /id/);
    expectError((s) => { s.id = '   '; }, /id/);
    expectError((s) => { s.schemaVersion = 2; }, /schemaVersion/);
    expectError((s) => { delete s.schemaVersion; }, /schemaVersion/);
    expectError((s) => { s.day = 1.5; }, /day must be an integer/);
    expectError((s) => { s.day = '1'; }, /day must be an integer/);
    expectError((s) => { s.day = 9; }, /not in the routine/);
    expectError((s) => { s.startedAt = 'yesterday'; }, /startedAt/);
    expectError((s) => { delete s.startedAt; }, /startedAt/);
    expectError((s) => { s.completedAt = 'nope'; }, /completedAt/);
    expectError((s) => { delete s.completedAt; }, /completedAt/);
    expectError((s) => { s.entries = []; }, /entries/);
    expectError((s) => { s.entries = null; }, /entries/);
    expectError((s) => { s.entries[0].exerciseId = 'd1-nope'; }, /not in the routine/);
    expectError((s) => { s.entries[0].exerciseId = 'd2-row'; }, /not in the routine/);
    expectError((s) => { s.entries[0].sets = []; }, /sets must be a non-empty array/);
    expectError((s) => { s.entries[0].sets[0].reps = -1; }, /reps/);
    expectError((s) => { s.entries[0].sets[0].weightLb = '40'; }, /weightLb/);
    expectError((s) => { s.entries[0].sets[0].timeMin = NaN; }, /timeMin/);
    expectError((s) => { s.entries[0].sets[0].timeSec = -5; }, /timeSec/);
    expectError((s) => { s.entries[0].sets[0].timeSec = '60'; }, /timeSec/);
    expectError((s) => { s.entries[0].sets[0].done = 'yes'; }, /done must be a boolean/);
    expectError((s) => { s.entries[0].notes = 5; }, /entries\[0\]\.notes/);
    expectError((s) => { s.notes = 5; }, /^notes/);
  });
  it('rejects non-objects', () => {
    expect(validateSession(null, routine).length).toBeGreaterThan(0);
    expect(validateSession('x', routine).length).toBeGreaterThan(0);
  });
  it('skips routine checks without a routine', () => {
    const s = valid(); s.day = 9; s.entries[0].exerciseId = 'whatever';
    expect(validateSession(s)).toEqual([]);
  });
  it('timeSec number, null or absent is valid', () => {
    for (const v of [60, 0, null, undefined]) {
      const s = valid();
      if (v === undefined) delete s.entries[0].sets[0].timeSec; else s.entries[0].sets[0].timeSec = v;
      expect(validateSession(s, routine)).toEqual([]);
    }
  });
  it('validates the sample workout with and without ROUTINE', () => {
    const sample = JSON.parse(readFileSync('docs/samples/workout-2026-11-16-d3.json', 'utf8'));
    expect(validateSession(sample)).toEqual([]);
    expect(validateSession(sample, ROUTINE)).toEqual([]);
  });
});

describe('normalizeSession', () => {
  it('fills absent timeSec and notes with null, returning a new object', () => {
    const s = valid();
    delete s.notes; delete s.entries[0].notes; delete s.entries[0].sets[0].timeSec;
    const n = normalizeSession(s);
    expect(n).not.toBe(s);
    expect(n.notes).toBeNull();
    expect(n.entries[0].notes).toBeNull();
    expect(n.entries[0].sets[0].timeSec).toBeNull();
    expect('timeSec' in s.entries[0].sets[0]).toBe(false);
  });
});

describe('summaries and ordering', () => {
  it('summarizeSession', () => {
    const s = valid();
    s.entries.push({ exerciseId: 'd1-bike', name: 'Warm Up: Bike', sets: [{ reps: null, weightLb: null, timeMin: 10, done: true }], notes: null });
    expect(summarizeSession(s)).toEqual({
      id: s.id, day: 1, startedAt: s.startedAt, completedAt: s.completedAt, exerciseCount: 2, setsDone: 2,
    });
  });
  const mk = (id: string, day: number, startedAt: string, completedAt: string | null) =>
    ({ id, day, startedAt, completedAt, entries: [] }) as unknown as WorkoutSession;
  it('sortSessionsNewestFirst does not mutate', () => {
    const input = [mk('a', 1, '2026-01-01T10:00:00.000Z', null), mk('b', 1, '2026-03-01T10:00:00.000Z', null), mk('c', 2, '2026-02-01T10:00:00.000Z', null)];
    const copy = input.slice();
    const out = sortSessionsNewestFirst(input);
    expect(out.map((s) => s.id)).toEqual(['b', 'c', 'a']);
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
  });
  it('latestCompletedByDay', () => {
    const out = latestCompletedByDay([
      mk('old1', 1, '2026-01-01T10:00:00.000Z', '2026-01-01T11:00:00.000Z'),
      mk('new1', 1, '2026-02-01T10:00:00.000Z', '2026-02-01T11:00:00.000Z'),
      mk('partial1', 1, '2026-03-01T10:00:00.000Z', null),
      mk('partial2', 2, '2026-03-02T10:00:00.000Z', null),
      mk('d3', 3, '2026-01-05T10:00:00.000Z', '2026-01-05T11:00:00.000Z'),
    ], [1, 2, 3, 4]);
    expect(Object.keys(out)).toEqual(['1', '2', '3', '4']);
    expect(out['1']?.id).toBe('new1');
    expect(out['2']).toBeNull();
    expect(out['3']?.id).toBe('d3');
    expect(out['4']).toBeNull();
  });
});

const ex = (id: string, over: Partial<RoutineExercise> = {}): RoutineExercise =>
  ({ id, name: id, warmup: false, sets: 3, reps: 12, weightLb: 40, timeMin: null, timeSec: null, rest: '2 min', notes: null, ...over });

describe('FW helpers', () => {
  it('DRAFT_KEY', () => expect(DRAFT_KEY).toBe('nt-workout-draft'));

  it('parseRestSeconds', () => {
    expect(parseRestSeconds('2 min')).toBe(120);
    expect(parseRestSeconds('60–90 sec')).toBe(90);
    expect(parseRestSeconds('60-90 sec')).toBe(90);
    expect(parseRestSeconds('90 sec')).toBe(90);
    expect(parseRestSeconds('60 sec')).toBe(60);
    expect(parseRestSeconds('1-2 min')).toBe(120);
    expect(parseRestSeconds(null)).toBeNull();
    expect(parseRestSeconds('')).toBeNull();
    expect(parseRestSeconds('as needed')).toBeNull();
  });

  it('formatTarget', () => {
    expect(formatTarget(ex('a', { weightLb: 45 }))).toBe('3 × 12 @ 45 lb · rest 2 min');
    expect(formatTarget(ex('b', { sets: 1, reps: null, weightLb: null, timeMin: 10, rest: null }))).toBe('10 min');
    expect(formatTarget(ex('c', { reps: 20, weightLb: null, rest: null }))).toBe('3 × 20');
    expect(formatTarget(ex('d', { reps: null, weightLb: null, timeMin: 1, rest: '60 sec' }))).toBe('3 × 1 min · rest 60 sec');
    expect(formatTarget(ex('e', { weightLb: 17.5, rest: '60–90 sec' }))).toBe('3 × 12 @ 17.5 lb · rest 60–90 sec');
  });

  it('formatTarget renders every real exercise without empty output', () => {
    for (const d of ROUTINE.days) for (const e of d.exercises) expect(formatTarget(e).length, e.id).toBeGreaterThan(0);
  });

  it('defaultDay', () => {
    const r = { schemaVersion: 1, days: [1, 2, 3, 4].map((day) => ({ day, areas: '', exercises: [] })) } as Routine;
    const s = (day: number, startedAt: string, completedAt: string | null) =>
      ({ id: 'x', day, startedAt, completedAt, exerciseCount: 1, setsDone: 1 });
    expect(defaultDay(r, [])).toBe(1);
    expect(defaultDay(r, [s(1, '2026-10-01T10:00:00.000Z', '2026-10-01T11:00:00.000Z')])).toBe(2);
    expect(defaultDay(r, [s(4, '2026-10-02T10:00:00.000Z', '2026-10-02T11:00:00.000Z')])).toBe(1);
    expect(defaultDay(r, [
      s(3, '2026-10-05T10:00:00.000Z', null),
      s(2, '2026-10-04T10:00:00.000Z', '2026-10-04T11:00:00.000Z'),
      s(1, '2026-10-03T10:00:00.000Z', '2026-10-03T11:00:00.000Z'),
    ])).toBe(3);
    expect(defaultDay(r, [s(3, '2026-10-05T10:00:00.000Z', null)])).toBe(1);
    expect(defaultDay(r, [
      s(1, '2026-10-03T10:00:00.000Z', '2026-10-03T11:00:00.000Z'),
      s(2, '2026-10-04T10:00:00.000Z', '2026-10-04T11:00:00.000Z'),
    ])).toBe(3);
    expect(defaultDay({ schemaVersion: 1, days: [] }, [])).toBeNull();
  });

  it('formatLastTime', () => {
    const sets: SessionSet[] = [
      { reps: 12, weightLb: 40, timeMin: null, timeSec: null, done: true },
      { reps: 12, weightLb: 40, timeMin: null, timeSec: null, done: true },
      { reps: 10, weightLb: 40, timeMin: null, timeSec: null, done: true },
      { reps: 8, weightLb: 40, timeMin: null, timeSec: null, done: false },
    ];
    const entry = (ss: SessionSet[]) => ({ exerciseId: 'x', name: 'x', sets: ss, notes: null });
    expect(formatLastTime(entry(sets))).toBe('12×40, 12×40, 10×40');
    expect(formatLastTime(null)).toBe('—');
    expect(formatLastTime(undefined)).toBe('—');
    expect(formatLastTime(entry([sets[3]]))).toBe('—');
    expect(formatLastTime(entry([{ reps: 20, weightLb: null, timeMin: null, timeSec: null, done: true }]))).toBe('20');
    expect(formatLastTime(entry([{ reps: 12, weightLb: 17.5, timeMin: null, timeSec: null, done: true }]))).toBe('12×17.5');
    expect(formatLastTime(entry([{ reps: null, weightLb: null, timeMin: 10, timeSec: null, done: true }]))).toBe('10 min');
    expect(formatLastTime(entry([{ reps: null, weightLb: 30, timeMin: null, timeSec: null, done: true }]))).toBe('30 lb');
    expect(formatLastTime(entry([{ reps: null, weightLb: null, timeMin: null, timeSec: null, done: true }]))).toBe('✓');
  });

  it('initialSets prefills from last time, else target', () => {
    const e = ex('x', { sets: 3, reps: 12, weightLb: 40 });
    const last = { exerciseId: 'x', name: 'x', notes: null, sets: [
      { reps: 12, weightLb: 45, timeMin: null, timeSec: null, done: true },
      { reps: 10, weightLb: 45, timeMin: null, timeSec: null, done: true },
    ] };
    expect(initialSets(e, last)).toEqual([
      { reps: 12, weightLb: 45, timeMin: null, timeSec: null, done: false },
      { reps: 10, weightLb: 45, timeMin: null, timeSec: null, done: false },
      { reps: 12, weightLb: 40, timeMin: null, timeSec: null, done: false },
    ]);
    expect(initialSets(e, null)).toHaveLength(3);
    expect(initialSets(ex('bw', { reps: 20, weightLb: null }), null)[0])
      .toEqual({ reps: 20, weightLb: null, timeMin: null, timeSec: null, done: false });
    expect(initialSets(ex('t', { sets: 1, reps: null, weightLb: null, timeMin: 10 }), null))
      .toEqual([{ reps: null, weightLb: null, timeMin: 10, timeSec: null, done: false }]);
  });

  it('removeSetAt removes one set, keeps at least one, never mutates', () => {
    const mkSet = (reps: number) => ({ reps, weightLb: null, timeMin: null, timeSec: null, done: false });
    const sets = [mkSet(1), mkSet(2), mkSet(3)];
    expect(removeSetAt(sets, 1)).toEqual([mkSet(1), mkSet(3)]);
    expect(removeSetAt(sets, 0)).toEqual([mkSet(2), mkSet(3)]);
    expect(removeSetAt(sets, 2)).toEqual([mkSet(1), mkSet(2)]);
    expect(sets).toHaveLength(3);
    expect(removeSetAt([mkSet(9)], 0)).toEqual([mkSet(9)]);
    expect(removeSetAt(sets, 5)).toEqual(sets);
    expect(removeSetAt(sets, -1)).toEqual(sets);
  });

  it('newSetFor copies last time\'s matching done set, else the previous row', () => {
    const st = (reps: number, weightLb: number, done = false) => ({ reps, weightLb, timeMin: null, timeSec: null, done });
    const sets = [st(12, 40, true), st(10, 40, true)];
    const last = { exerciseId: 'x', name: 'x', notes: null, sets: [st(12, 45, true), st(12, 45, true), st(8, 50, true)] };
    expect(newSetFor(sets, last)).toEqual(st(8, 50));
    expect(newSetFor(sets, null)).toEqual(st(10, 40));
    expect(newSetFor([], null)).toEqual({ reps: null, weightLb: null, timeMin: null, timeSec: null, done: false });
  });

  it('timeSec exercises: target, last time, prefill (incl. legacy timeMin), session', () => {
    const hang = ex('h', { reps: null, weightLb: null, timeMin: null, timeSec: 60, rest: '60 sec' });
    expect(formatTarget(hang)).toBe('3 × 60 s · rest 60 sec');
    expect(formatTarget(ex('h1', { sets: 1, reps: null, weightLb: null, timeSec: 45, rest: null }))).toBe('45 s');
    expect(isTimed(hang) && isSeconds(hang)).toBe(true);
    expect(isSeconds(ex('m', { reps: null, weightLb: null, timeMin: 10 }))).toBe(false);
    const entry = (sets: object[]) => ({ exerciseId: 'h', name: 'h', notes: null, sets }) as never;
    expect(formatLastTime(entry([
      { reps: null, weightLb: null, timeMin: null, timeSec: 60, done: true },
      { reps: null, weightLb: null, timeMin: null, timeSec: 55, done: true },
      { reps: null, weightLb: null, timeMin: null, timeSec: 50, done: false },
    ]))).toBe('60 s, 55 s');
    expect(initialSets(hang, null)[0]).toEqual({ reps: null, weightLb: null, timeMin: null, timeSec: 60, done: false });
    const last = entry([{ reps: null, weightLb: null, timeMin: null, timeSec: 55, done: true }]);
    expect(initialSets(hang, last)[0].timeSec).toBe(55);
    expect(initialSets(hang, last)[1].timeSec).toBe(60);
    const legacy = entry([{ reps: null, weightLb: null, timeMin: 1, done: true }]);
    expect(initialSets(hang, legacy)[0]).toEqual({ reps: null, weightLb: null, timeMin: null, timeSec: 60, done: false });
    const mins = ex('m2', { sets: 1, reps: null, weightLb: null, timeMin: 10 });
    expect(initialSets(mins, entry([{ reps: null, weightLb: null, timeMin: 12, done: true }]))[0])
      .toEqual({ reps: null, weightLb: null, timeMin: 12, timeSec: null, done: false });
    const s = buildSession({
      id: 'i', day: 3, startedAt: '2026-10-11T14:30:00.000Z', completedAt: null, notes: '',
      exercises: [hang],
      log: { h: { sets: [{ reps: null, weightLb: null, timeMin: null, timeSec: '55' as never, done: true }], notes: '' } },
    });
    expect(s.entries[0].sets[0]).toEqual({ reps: null, weightLb: null, timeMin: null, timeSec: 55, done: true });
  });
});

describe('buildSession', () => {
  const day = ROUTINE.days[0];
  it('includes only touched exercises and matches the contract shape', () => {
    const [a, b, c, d] = day.exercises;
    const s = buildSession({
      id: '0b9c6a8e-3f2d-4c1e-9a77-2f6f1d2c4b10', day: 1,
      startedAt: '2026-10-11T14:30:00.000Z', completedAt: '2026-10-11T15:25:00.000Z',
      notes: '  good session ', exercises: day.exercises,
      log: {
        [a.id]: { sets: [{ reps: null, weightLb: null, timeMin: 10, timeSec: null, done: true }], notes: '' },
        [b.id]: { sets: [{ reps: 12, weightLb: 25, timeMin: null, timeSec: null, done: false }], notes: '' },
        [c.id]: { sets: [
          { reps: '12', weightLb: '45', timeMin: null, done: true },
          { reps: 10, weightLb: 45, timeMin: null, done: true },
          { reps: '', weightLb: '', timeMin: null, done: false },
        ] as never, notes: ' Felt heavy ' },
        [d.id]: { sets: [{ reps: 12, weightLb: 40, timeMin: null, timeSec: null, done: false }], notes: 'skipped, shoulder' },
      },
    });
    expect(Object.keys(s).sort()).toEqual(['completedAt', 'day', 'entries', 'id', 'notes', 'schemaVersion', 'startedAt']);
    expect(s.entries.map((e) => e.exerciseId)).toEqual([a.id, c.id, d.id]);
    expect(s.entries[1].name).toBe(c.name);
    expect(s.entries[1].sets[0]).toEqual({ reps: 12, weightLb: 45, timeMin: null, timeSec: null, done: true });
    expect(s.entries[1].sets[2]).toEqual({ reps: null, weightLb: null, timeMin: null, timeSec: null, done: false });
    expect(s.entries[1].notes).toBe('Felt heavy');
    expect(s.entries[0].notes).toBeNull();
    expect(s.notes).toBe('good session');
    expect(s.completedAt).toBe('2026-10-11T15:25:00.000Z');
    expect(validateSession(s, ROUTINE)).toEqual([]);
  });

  it('empty workout has no entries; bad numbers become null', () => {
    const d2 = ROUTINE.days[1];
    const log: Record<string, { sets: never[]; notes: string | null }> = {};
    for (const e of d2.exercises) log[e.id] = { sets: [{ reps: 5, weightLb: 5, timeMin: null, done: false }] as never, notes: '' };
    const base = { id: 'i', day: 2, startedAt: '2026-10-11T14:30:00.000Z', completedAt: null, exercises: d2.exercises };
    const none = buildSession({ ...base, notes: '', log: log as never });
    expect(none.entries).toEqual([]);
    expect(none.completedAt).toBeNull();
    expect(none.notes).toBeNull();
    log[d2.exercises[0].id] = { sets: [{ reps: -3, weightLb: 'abc', timeMin: NaN, done: true }] as never, notes: null };
    const bad = buildSession({ ...base, notes: null as never, log: log as never });
    expect(bad.entries[0].sets[0]).toEqual({ reps: null, weightLb: null, timeMin: null, timeSec: null, done: true });
  });
});

describe('small formatters', () => {
  it('countDone, formatClock, toNum, formatNum', () => {
    const set = (done: boolean) => ({ reps: 1, weightLb: 1, timeMin: null, timeSec: null, done });
    expect(countDone({ a: { sets: [set(true), set(false)], notes: '' }, b: { sets: [set(true)], notes: '' } })).toBe(2);
    expect(formatClock(125)).toBe('2:05');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59.2)).toBe('1:00');
    expect(toNum('')).toBeNull();
    expect(toNum('17.5')).toBe(17.5);
    expect(toNum(0)).toBe(0);
    expect(toNum(-1)).toBeNull();
    expect(formatNum(17.5)).toBe('17.5');
    expect(formatNum(12)).toBe('12');
    expect(formatNum(null)).toBe('');
  });

  it('formatSessionDate honours timeZone and tolerates bad input', () => {
    const out = formatSessionDate('2026-11-16T03:16:44.642Z', 'UTC');
    expect(out).toContain('Mon');
    expect(out).toContain(':16');
    expect(out).toContain(' · ');
    const ny = formatSessionDate('2026-11-16T03:16:44.642Z', 'America/New_York');
    expect(ny).toContain('Sun');
    expect(formatSessionDate('garbage')).toBe('garbage');
  });
});
