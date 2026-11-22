import { describe, expect, it } from 'vitest';
import { parseRoutineConfig } from './routineConfig';

const ex = (o: Record<string, unknown> = {}) => ({ id: 'd1-a', name: 'A', ...o });
const day = (o: Record<string, unknown> = {}) => ({ day: 1, areas: 'Chest', exercises: [ex()], ...o });
const cfg = (o: Record<string, unknown> = {}) => ({ schemaVersion: 1, days: [day()], ...o });
const errorsOf = (data: unknown): string[] => {
  try { parseRoutineConfig(data); } catch (e) { return (e as Error).message.split('\n'); }
  throw new Error('expected parseRoutineConfig to throw');
};

describe('parseRoutineConfig', () => {
  it('fills defaults and orders keys as in contracts 8.1', () => {
    const r = parseRoutineConfig(cfg());
    expect(r).toEqual({
      schemaVersion: 1,
      days: [{ day: 1, areas: 'Chest', exercises: [{
        id: 'd1-a', name: 'A', warmup: false, sets: null, reps: null, weightLb: null,
        timeMin: null, timeSec: null, rest: null, notes: null,
      }] }],
    });
    expect(Object.keys(r.days[0])).toEqual(['day', 'areas', 'exercises']);
    expect(Object.keys(r.days[0].exercises[0])).toEqual(
      ['id', 'name', 'warmup', 'sets', 'reps', 'weightLb', 'timeMin', 'timeSec', 'rest', 'notes']);
  });
  it('keeps given values', () => {
    const r = parseRoutineConfig(cfg({ days: [day({ exercises: [ex({ warmup: true, sets: 3, rest: '2 min', reps: null })] })] }));
    expect(r.days[0].exercises[0]).toMatchObject({ warmup: true, sets: 3, rest: '2 min', reps: null });
  });
  it('rejects a non-object root', () => {
    for (const bad of [null, [], 'x', 3]) expect(errorsOf(bad)).toEqual(['(root): must be an object']);
  });
  it('rejects a wrong schemaVersion', () => {
    expect(errorsOf(cfg({ schemaVersion: 2 }))).toEqual(['schemaVersion: must be 1']);
  });
  it('rejects unknown keys at every level', () => {
    const errs = errorsOf({ ...cfg({ days: [day({ extra: 1, exercises: [ex({ colour: 'red' })] })] }), top: 1 });
    expect(errs).toEqual(expect.arrayContaining([
      'top: unknown key', 'days[0].extra: unknown key', 'days[0].exercises[0].colour: unknown key']));
  });
  it('rejects wrong types', () => {
    const errs = errorsOf(cfg({ days: [day({ day: 1.5, areas: 5, exercises: [ex({ id: 3, name: '', warmup: 'yes', sets: '3', reps: NaN, rest: 2, notes: [] })] })] }));
    for (const p of ['day', 'areas', 'exercises[0].id', 'exercises[0].name', 'exercises[0].warmup', 'exercises[0].sets', 'exercises[0].reps', 'exercises[0].rest', 'exercises[0].notes']) {
      expect(errs.some((e) => e.startsWith(`days[0].${p}:`)), p).toBe(true);
    }
  });
  it('rejects missing required fields', () => {
    const errs = errorsOf(cfg({ days: [{ exercises: [{}] }] }));
    expect(errs).toEqual(expect.arrayContaining([
      'days[0].day: must be a positive integer', 'days[0].areas: must be a non-empty string',
      'days[0].exercises[0].id: must be a non-empty string', 'days[0].exercises[0].name: must be a non-empty string']));
  });
  it('rejects empty days and exercises lists, and non-lists', () => {
    expect(errorsOf(cfg({ days: [] }))).toEqual(['days: must not be empty']);
    expect(errorsOf(cfg({ days: [day({ exercises: [] })] }))).toEqual(['days[0].exercises: must not be empty']);
    expect(errorsOf(cfg({ days: {} }))).toEqual(['days: must be a list']);
  });
  it('rejects duplicate day numbers', () => {
    expect(errorsOf(cfg({ days: [day(), day({ exercises: [ex({ id: 'd1-b' })] })] })))
      .toEqual(['days[1].day: duplicate day number 1']);
  });
  it('rejects duplicate exercise ids across days', () => {
    expect(errorsOf(cfg({ days: [day(), day({ day: 2 })] })))
      .toEqual(['days[1].exercises[0].id: duplicate id "d1-a"']);
  });
  it('collects all errors, one per line', () => {
    const errs = errorsOf(cfg({ schemaVersion: 0, days: [day({ areas: '' }), day({ exercises: [] })] }));
    expect(errs).toHaveLength(4);
  });
});
