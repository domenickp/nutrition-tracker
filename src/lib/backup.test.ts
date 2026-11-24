import { describe, expect, it } from 'vitest';
import {
  BACKUP_TABLES,
  backupFileName,
  buildBackup,
  countRows,
  parseBackup,
  prepareImport,
  type BackupFile,
  type BackupRow,
  type BackupTable,
} from './backup';

function tables(over: Partial<Record<BackupTable, BackupRow[]>> = {}): Record<BackupTable, BackupRow[]> {
  const t = Object.fromEntries(BACKUP_TABLES.map((n) => [n, []])) as unknown as Record<BackupTable, BackupRow[]>;
  return { ...t, ...over };
}

function file(over: Partial<Record<BackupTable, BackupRow[]>> = {}): BackupFile {
  return buildBackup(tables(over), '2026-11-23T00:00:00Z');
}

function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

describe('buildBackup', () => {
  it('buildBackup strips user_id', () => {
    const b = buildBackup(tables({ weights: [{ id: 'w1', user_id: 'u1', weight_kg: 80 }] }), 'x');
    expect(b.tables.weights).toEqual([{ id: 'w1', weight_kg: 80 }]);
    expect(b.app).toBe('nutrition-tracker');
    expect(b.version).toBe(1);
    expect(b.exportedAt).toBe('x');
  });
});

describe('backupFileName', () => {
  it('names by date', () => {
    expect(backupFileName('2026-11-23')).toBe('nutrition-tracker-backup-2026-11-23.json');
  });
});

describe('parseBackup', () => {
  const good = JSON.stringify(file({ weights: [{ id: 'w1', date: '2026-01-01', weight_kg: 80 }] }));

  it('accepts a valid file', () => {
    const r = parseBackup(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.backup.tables.weights).toHaveLength(1);
  });
  it('rejects invalid JSON', () => {
    expect(parseBackup('{nope').ok).toBe(false);
  });
  it('rejects the wrong app', () => {
    expect(parseBackup(JSON.stringify({ app: 'other', version: 1, tables: {} })).ok).toBe(false);
  });
  it('rejects a newer version', () => {
    const r = parseBackup(JSON.stringify({ app: 'nutrition-tracker', version: 2, tables: {} }));
    expect(r.ok).toBe(false);
  });
  it('rejects a table that is not an array', () => {
    const r = parseBackup(JSON.stringify({ app: 'nutrition-tracker', version: 1, tables: { foods: {} } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('foods');
  });
  it('accepts a file missing some tables and ignores unknown ones', () => {
    const r = parseBackup(
      JSON.stringify({ app: 'nutrition-tracker', version: 1, tables: { weights: [], mystery: [{ a: 1 }] } }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.tables.foods).toEqual([]);
      expect(Object.keys(r.backup.tables).sort()).toEqual([...BACKUP_TABLES].sort());
    }
  });
});

describe('countRows', () => {
  it('counts per table', () => {
    const c = countRows(file({ foods: [{ id: 'a' }, { id: 'b' }], weights: [{ id: 'w' }] }));
    expect(c.foods).toBe(2);
    expect(c.weights).toBe(1);
    expect(c.profiles).toBe(0);
  });
});

describe('prepareImport', () => {
  it('new ids and remapped food_id', () => {
    const b = file({
      foods: [
        { id: 'f1', name: 'A' },
        { id: 'f2', name: 'B' },
      ],
      food_logs: [
        { id: 'l1', food_id: 'f1' },
        { id: 'l2', food_id: 'f2' },
        { id: 'l3', food_id: 'gone' },
      ],
    });
    const out = prepareImport(b, counter(), 'NOW');
    const foodIds = out.foods.map((r) => r.id);
    const logIds = out.food_logs.map((r) => r.id);
    const all = [...foodIds, ...logIds];
    expect(new Set(all).size).toBe(all.length);
    for (const old of ['f1', 'f2', 'l1', 'l2', 'l3']) expect(all).not.toContain(old);
    expect(out.food_logs[0].food_id).toBe(foodIds[0]);
    expect(out.food_logs[1].food_id).toBe(foodIds[1]);
    expect(out.food_logs[2].food_id).toBeNull();
  });
  it('maps a null food_id to null and removes user_id', () => {
    const out = prepareImport(file({ food_logs: [{ id: 'l1', food_id: null, user_id: 'u' }] }), counter(), 'NOW');
    expect(out.food_logs[0].food_id).toBeNull();
    expect('user_id' in out.food_logs[0]).toBe(false);
  });
  it('gives new ids to weights, water_logs and target_suggestions', () => {
    const out = prepareImport(
      file({ weights: [{ id: 'w' }], water_logs: [{ id: 'x' }], target_suggestions: [{ id: 's' }] }),
      counter(),
      'NOW',
    );
    expect(out.weights[0].id).toMatch(/^new-/);
    expect(out.water_logs[0].id).toMatch(/^new-/);
    expect(out.target_suggestions[0].id).toMatch(/^new-/);
  });
  it('fills missing columns', () => {
    const out = prepareImport(
      file({
        profiles: [{ sex: 'male' }],
        foods: [{ id: 'f', name: 'A', created_at: '2020-01-01T00:00:00Z' }],
        daily_activity: [{ date: '2026-01-01', mode: 'direct' }],
      }),
      counter(),
      'NOW',
    );
    expect(out.profiles[0].everyday_activity).toBe('sedentary');
    expect(out.profiles[0].created_at).toBe('NOW');
    expect(out.foods[0].created_at).toBe('2020-01-01T00:00:00Z');
    expect(out.foods[0].updated_at).toBe('NOW');
    expect(out.foods[0].water_ml).toBe(0);
    expect(out.foods[0].portions).toEqual([]);
    expect(out.daily_activity[0].sedentary_h).toBe(0);
    expect(out.daily_activity[0].lifting_h).toBe(0);
    expect(out.daily_activity[0].everyday_activity ?? null).toBeNull();
  });
  it('does not share default objects between rows', () => {
    const out = prepareImport(file({ foods: [{ id: 'a' }, { id: 'b' }] }), counter(), 'NOW');
    expect(out.foods[0].portions).not.toBe(out.foods[1].portions);
  });
  it('keeps natural keys for workouts, daily_activity, exercise_categories and profiles', () => {
    const out = prepareImport(
      file({
        workouts: [{ id: 'wk-1', date: '2026-01-01' }],
        daily_activity: [{ date: '2026-01-01', mode: 'hours' }],
        exercise_categories: [{ exercise_id: 'squat', name: 'Squat', category: 'lifting' }],
        profiles: [{ sex: 'female' }],
      }),
      counter(),
      'NOW',
    );
    expect(out.workouts[0].id).toBe('wk-1');
    expect(out.daily_activity[0].date).toBe('2026-01-01');
    expect(out.exercise_categories[0].exercise_id).toBe('squat');
    expect('id' in out.profiles[0]).toBe(false);
  });
});
