import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: { message: string } | null };
interface Call { table: string; ops: Array<[string, unknown[]]> }

const h = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
  results: {} as Record<string, Array<{ data?: unknown; error?: { message: string } | null }>>,
  user: { id: 'u1' } as { id: string } | null,
  invoke: vi.fn(),
}));

function builder(table: string) {
  const call: Call = { table, ops: [] };
  h.calls.push(call);
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          const res: Result = h.results[table]?.shift() ?? { data: null, error: null };
          return (resolve: (v: Result) => void) => resolve({ data: res.data ?? null, error: res.error ?? null });
        }
        return (...args: unknown[]) => {
          call.ops.push([prop, args]);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t: string) => builder(t),
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    functions: { invoke: h.invoke },
  },
}));

import {
  addFoodLog,
  getLatestWeight,
  listFoods,
  loadDay,
  saveFood,
  saveWorkout,
  searchUsda,
  getUsdaFood,
  addWeight,
  acceptCalorieSuggestion,
  listSuggestionRecords,
  loadAnalysisData,
  recordSuggestion,
  snoozeSuggestion,
} from './api';
import type { NewFood, NewSuggestionRecord, Profile, WorkoutSummary } from '../lib/types';
import type { Suggestion } from '../lib/weightAnalysis';

const queue = (table: string, ...r: Result[]) => {
  (h.results[table] ??= []).push(...r);
};
const callsOn = (table: string) => h.calls.filter((c) => c.table === table);
const op = (c: Call, name: string) => c.ops.find((o) => o[0] === name)?.[1];

beforeEach(() => {
  h.calls.length = 0;
  h.results = {};
  h.user = { id: 'u1' };
  h.invoke.mockReset();
});

const profileRow = {
  user_id: 'u1', birth_month: 1, birth_year: 1990, sex: 'male', height_cm: '180', goal: 'maintain',
  units: 'metric', timezone: 'UTC', override_kcal_adjust_pct: null, override_protein_g_per_lb: null,
  override_fat_pct: null, override_water_base_ml_per_kg: null,
};

describe('loadDay', () => {
  it('assembles DayData', async () => {
    queue('profiles', { data: profileRow });
    queue('weights', { data: [{ weight_kg: '81.5' }] });
    queue('daily_activity', { data: { date: 'd', mode: 'direct', direct_kcal: '500', sedentary_h: 0, light_cardio_h: 0, strenuous_cardio_h: 0, lifting_h: 0 } });
    queue('workouts', { data: [] });
    queue('food_logs', { data: [{ id: 'l', date: 'd', logged_at: 't', food_id: null, name: 'x', quantity: '1', unit_label: 'servings', grams: null, kcal: '100', protein_g: 1, carbs_g: 2, fat_g: 3, water_ml: 0 }] });
    queue('water_logs', { data: [{ id: 'w', date: 'd', logged_at: 't', ml: '250' }] });
    const day = await loadDay('2026-11-16');
    expect(day.date).toBe('2026-11-16');
    expect(day.profile.heightCm).toBe(180);
    expect(day.weightKg).toBe(81.5);
    expect(day.activity?.directKcal).toBe(500);
    expect(day.foodLogs[0].totals.kcal).toBe(100);
    expect(day.waterLogs[0].ml).toBe(250);
    expect(op(callsOn('food_logs')[0], 'order')).toEqual(['logged_at', { ascending: true }]);
    expect(op(callsOn('weights')[0], 'lte')).toEqual(['date', '2026-11-16']);
  });
  it('throws without a profile', async () => {
    queue('profiles', { data: null });
    await expect(loadDay('2026-11-16')).rejects.toThrow('No profile');
  });
});

describe('getLatestWeight / addWeight', () => {
  it('returns null when none', async () => {
    queue('weights', { data: [] });
    expect(await getLatestWeight('2026-11-16')).toBeNull();
  });
  it('addWeight requires sign-in', async () => {
    h.user = null;
    await expect(addWeight('2026-11-16', 80)).rejects.toThrow('Not signed in');
  });
});

describe('saveWorkout', () => {
  const w: WorkoutSummary = {
    id: 'w1', date: '2026-11-15', startedAt: 's', completedAt: null,
    lightCardioH: 0, strenuousCardioH: 0, liftingH: 1, raw: {},
  };
  it("returns 'exists' when present and not replacing", async () => {
    queue('workouts', { data: { id: 'w1' } });
    expect(await saveWorkout(w, false)).toBe('exists');
    expect(callsOn('workouts').some((c) => op(c, 'upsert'))).toBe(false);
  });
  it("returns 'saved' when absent", async () => {
    queue('workouts', { data: null }, { data: null });
    expect(await saveWorkout(w, false)).toBe('saved');
    const up = callsOn('workouts').find((c) => op(c, 'upsert'))!;
    expect((op(up, 'upsert') as unknown[])[0]).toMatchObject({ id: 'w1', user_id: 'u1' });
  });
  it('replace skips the existence check', async () => {
    expect(await saveWorkout(w, true)).toBe('saved');
    expect(callsOn('workouts')).toHaveLength(1);
  });
});

describe('addFoodLog', () => {
  const log = {
    date: '2026-11-16', foodId: 'f1', name: 'Oats', quantity: 1, unitLabel: 'servings', grams: null,
    totals: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1, waterMl: 0 },
  };
  it('bumps last_used_at on the food', async () => {
    queue('food_logs', { data: { id: 'l', date: 'd', logged_at: 't', food_id: 'f1', name: 'Oats', quantity: 1, unit_label: 'servings', grams: null, kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1, water_ml: 0 } });
    const out = await addFoodLog(log);
    expect(out.id).toBe('l');
    const upd = callsOn('foods')[0];
    const patch = (op(upd, 'update') as Array<{ last_used_at: string }>)[0];
    expect(new Date(patch.last_used_at).toISOString()).toBe(patch.last_used_at);
    expect(op(upd, 'eq')).toEqual(['id', 'f1']);
  });
  it('does not touch foods without a foodId', async () => {
    queue('food_logs', { data: { id: 'l', date: 'd', logged_at: 't', food_id: null, name: 'x', quantity: 1, unit_label: 'g', grams: null, kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1, water_ml: 0 } });
    await addFoodLog({ ...log, foodId: null });
    expect(callsOn('foods')).toHaveLength(0);
  });
  it('throws readable errors', async () => {
    queue('food_logs', { error: { message: 'boom' } });
    await expect(addFoodLog(log)).rejects.toThrow('boom');
  });
});

describe('listFoods', () => {
  it('escapes %, _ and backslash in the search', async () => {
    await listFoods('50%_a\\b');
    const c = callsOn('foods')[0];
    expect(op(c, 'ilike')).toEqual(['name', '%50\\%\\_a\\\\b%']);
    expect(op(c, 'limit')).toEqual([50]);
    expect(c.ops.filter((o) => o[0] === 'order').map((o) => o[1])).toEqual([
      ['last_used_at', { ascending: false, nullsFirst: false }],
      ['name', { ascending: true }],
    ]);
  });
  it('omits ilike with no search', async () => {
    await listFoods();
    expect(op(callsOn('foods')[0], 'ilike')).toBeUndefined();
    await listFoods('  , ');
    expect(op(callsOn('foods')[1], 'ilike')).toBeUndefined();
  });
  it('chains one ilike per word', async () => {
    await listFoods('chick brea');
    const c = callsOn('foods')[0];
    expect(c.ops.filter((o) => o[0] === 'ilike').map((o) => o[1])).toEqual([
      ['name', '%chick%'],
      ['name', '%brea%'],
    ]);
  });
  it('escapes each word separately', async () => {
    await listFoods('50%, a_b');
    const c = callsOn('foods')[0];
    expect(c.ops.filter((o) => o[0] === 'ilike').map((o) => o[1])).toEqual([
      ['name', '%50\\%%'],
      ['name', '%a\\_b%'],
    ]);
  });
});

describe('saveFood', () => {
  const base: NewFood = {
    name: 'Oats', brand: null, source: 'usda', fdcId: 5, baseLabel: '100 g', baseGrams: 100,
    nutrients: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1, waterMl: 0 }, portions: [],
  };
  const foodRow = { id: 'f1', name: 'Oats', brand: null, source: 'usda', fdc_id: 5, base_label: '100 g', base_grams: 100, kcal: 1, protein_g: 1, carbs_g: 1, fat_g: 1, water_ml: 0, portions: [], last_used_at: null };
  it('updates an existing usda food', async () => {
    queue('foods', { data: { id: 'f1' } }, { data: foodRow });
    const f = await saveFood(base);
    expect(f.id).toBe('f1');
    expect(callsOn('foods').some((c) => op(c, 'insert'))).toBe(false);
    expect(callsOn('foods')[1].ops.some((o) => o[0] === 'update')).toBe(true);
  });
  it('inserts a new usda food with user_id', async () => {
    queue('foods', { data: null }, { data: foodRow });
    await saveFood(base);
    const ins = callsOn('foods').find((c) => op(c, 'insert'))!;
    expect((op(ins, 'insert') as unknown[])[0]).toMatchObject({ user_id: 'u1', fdc_id: 5 });
  });
  it('inserts manual foods directly', async () => {
    queue('foods', { data: { ...foodRow, source: 'manual', fdc_id: null } });
    await saveFood({ ...base, source: 'manual', fdcId: null });
    expect(callsOn('foods')).toHaveLength(1);
  });
});

describe('USDA', () => {
  it('searchUsda builds the function path and returns foods', async () => {
    h.invoke.mockResolvedValue({ data: { foods: [{ fdcId: 1 }] }, error: null });
    const out = await searchUsda('greek yogurt & oats');
    expect(h.invoke).toHaveBeenCalledWith('usda?op=search&q=greek%20yogurt%20%26%20oats', { method: 'GET' });
    expect(out).toEqual([{ fdcId: 1 }]);
  });
  it('throws on invoke error, preferring the response body message', async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'Missing query parameter q' }) } },
    });
    await expect(searchUsda('x')).rejects.toThrow('Missing query parameter q');
  });
  it('throws on an { error } body', async () => {
    h.invoke.mockResolvedValue({ data: { error: 'USDA request failed (502)' }, error: null });
    await expect(getUsdaFood(5)).rejects.toThrow('USDA request failed (502)');
  });
  it('getUsdaFood builds the path', async () => {
    h.invoke.mockResolvedValue({ data: { fdcId: 5 }, error: null });
    await getUsdaFood(5);
    expect(h.invoke).toHaveBeenCalledWith('usda?op=food&fdcId=5', { method: 'GET' });
  });
});

describe('loadAnalysisData', () => {
  it('builds 21 ordered days from the range queries', async () => {
    queue('profiles', { data: profileRow });
    queue('weights', { data: [{ date: '2026-11-10', weight_kg: '80.5' }, { date: '2026-11-22', weight_kg: '80' }] });
    queue('food_logs', {
      data: [
        { date: '2026-11-03', kcal: '500', protein_g: '30' },
        { date: '2026-11-03', kcal: '250.5', protein_g: '10' },
        { date: '2026-11-05', kcal: '100', protein_g: '1' },
      ],
    });
    queue('daily_activity', {
      data: [{ date: '2026-11-03', mode: 'direct', direct_kcal: '400', sedentary_h: 0, light_cardio_h: 0, strenuous_cardio_h: 0, lifting_h: 0 }],
    });
    queue('workouts', { data: [{ date: '2026-11-04', light_cardio_h: '0.5', strenuous_cardio_h: 0, lifting_h: '1' }] });
    const r = await loadAnalysisData('2026-11-22');
    expect(r.profile.heightCm).toBe(180);
    expect(r.weighIns).toEqual([{ date: '2026-11-10', kg: 80.5 }, { date: '2026-11-22', kg: 80 }]);
    expect(r.days).toHaveLength(21);
    expect(r.days[0].date).toBe('2026-11-01');
    expect(r.days[20].date).toBe('2026-11-21');
    expect(r.days[0].intakeKcal).toBeNull();
    expect(r.days[0].proteinG).toBeNull();
    expect(r.days[2]).toMatchObject({ date: '2026-11-03', intakeKcal: 750.5, proteinG: 40 });
    expect(r.days[2].activity?.directKcal).toBe(400);
    expect(r.days[3].workouts).toEqual([{ lightCardioH: 0.5, strenuousCardioH: 0, liftingH: 1 }]);
    expect(r.days[4].workouts).toEqual([]);
    for (const t of ['food_logs', 'daily_activity', 'workouts']) {
      const c = callsOn(t)[0];
      expect(op(c, 'gte')).toEqual(['date', '2026-11-01']);
      expect(op(c, 'lte')).toEqual(['date', '2026-11-21']);
    }
    expect(op(callsOn('weights')[0], 'lte')).toEqual(['date', '2026-11-22']);
    expect(op(callsOn('workouts')[0], 'not')).toEqual(['completed_at', 'is', null]);
  });
  it('throws without a profile and on read errors', async () => {
    queue('profiles', { data: null });
    await expect(loadAnalysisData('2026-11-22')).rejects.toThrow('No profile');
    queue('profiles', { data: profileRow });
    queue('food_logs', { error: { message: 'boom' } });
    await expect(loadAnalysisData('2026-11-22')).rejects.toThrow('boom');
  });
});

describe('suggestion records', () => {
  const rec: NewSuggestionRecord = {
    kind: 'calorie', action: 'accepted', snoozeUntil: null, oldAdjustPct: -20, newAdjustPct: -15,
    oldKcal: 2000, newKcal: 2200, reason: 'r',
  };
  it('list returns rows newest first', async () => {
    queue('target_suggestions', { data: [{ id: 's', kind: 'protein', action: 'snoozed', snooze_until: '2026-11-29', created_at: 't' }] });
    const list = await listSuggestionRecords();
    expect(list).toHaveLength(1);
    expect(list![0].snoozeUntil).toBe('2026-11-29');
    expect(op(callsOn('target_suggestions')[0], 'order')).toEqual(['created_at', { ascending: false }]);
    expect((op(callsOn('target_suggestions')[0], 'gte') as unknown[])[0]).toBe('created_at');
  });
  it('list returns null on error', async () => {
    queue('target_suggestions', { error: { message: 'relation does not exist' } });
    expect(await listSuggestionRecords()).toBeNull();
  });
  it('list returns null on a thrown exception', async () => {
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('x');
    });
    expect(await listSuggestionRecords()).toBeNull();
    spy.mockRestore();
  });
  it('recordSuggestion returns false on error and when signed out', async () => {
    queue('target_suggestions', { error: { message: 'nope' } });
    expect(await recordSuggestion(rec)).toBe(false);
    h.user = null;
    expect(await recordSuggestion(rec)).toBe(false);
  });
  it('recordSuggestion inserts with user_id', async () => {
    expect(await recordSuggestion(rec)).toBe(true);
    expect(op(callsOn('target_suggestions')[0], 'insert')).toEqual([
      expect.objectContaining({ user_id: 'u1', kind: 'calorie', new_adjust_pct: -15 }),
    ]);
  });
});

describe('acceptCalorieSuggestion / snoozeSuggestion', () => {
  const profile: Profile = {
    userId: 'u1', birthMonth: 1, birthYear: 1990, sex: 'male', heightCm: 180, goal: 'maintain',
    units: 'metric', timezone: 'UTC', overrideKcalAdjustPct: null, overrideProteinGPerLb: null,
    overrideFatPct: null, overrideWaterBaseMlPerKg: null,
  };
  const s: Suggestion = { kind: 'calorie', title: 'Raise your target', oldAdjustPct: 0, newAdjustPct: 5, oldKcal: 2500, newKcal: 2625, reason: 'why' };
  it('saves the override then records acceptance', async () => {
    queue('profiles', { data: { ...profileRow, override_kcal_adjust_pct: 5 } });
    const saved = await acceptCalorieSuggestion(profile, s);
    expect(saved.overrideKcalAdjustPct).toBe(5);
    const up = op(callsOn('profiles')[0], 'upsert') as unknown[];
    expect(up[0]).toMatchObject({ override_kcal_adjust_pct: 5, user_id: 'u1', goal: 'maintain' });
    expect(op(callsOn('target_suggestions')[0], 'insert')).toEqual([
      expect.objectContaining({
        kind: 'calorie', action: 'accepted', snooze_until: null, old_adjust_pct: 0,
        new_adjust_pct: 5, old_kcal: 2500, new_kcal: 2625, reason: 'why', user_id: 'u1',
      }),
    ]);
  });
  it('still resolves when the record insert fails', async () => {
    queue('profiles', { data: { ...profileRow, override_kcal_adjust_pct: 5 } });
    queue('target_suggestions', { error: { message: 'missing table' } });
    const saved = await acceptCalorieSuggestion(profile, s);
    expect(saved.overrideKcalAdjustPct).toBe(5);
  });
  it('snooze inserts snooze_until a week out', async () => {
    expect(await snoozeSuggestion('calorie', '2026-11-22')).toBe(true);
    expect(op(callsOn('target_suggestions')[0], 'insert')).toEqual([
      expect.objectContaining({ kind: 'calorie', action: 'snoozed', snooze_until: '2026-11-29', reason: null, new_kcal: null }),
    ]);
  });
});
