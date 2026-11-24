import { describe, expect, it } from 'vitest';
import type { DailyActivity, ExerciseRule, NewFood, NewFoodLog, ProfileInput, WorkoutSummary } from '../lib/types';
import {
  fromActivity,
  fromExerciseRule,
  fromFood,
  fromFoodLog,
  fromFoodLogPatch,
  fromProfile,
  fromWaterLog,
  fromWeight,
  fromWorkout,
  toActivity,
  toExerciseRule,
  toFood,
  toFoodLog,
  toProfile,
  toSuggestionRecord,
  fromSuggestionRecord,
  toWaterLog,
  toWeightKg,
  toWorkout,
} from './mappers';

describe('profile', () => {
  const input: ProfileInput = {
    birthMonth: 3, birthYear: 1990, sex: 'male', heightCm: 180.5, goal: 'maintain', everydayActivity: 'sedentary', units: 'metric',
    timezone: 'America/New_York', overrideKcalAdjustPct: -15, overrideProteinGPerLb: null,
    overrideFatPct: 30, overrideWaterBaseMlPerKg: null,
  };
  it('round-trips and keeps null overrides', () => {
    const row = fromProfile(input);
    expect(row.override_protein_g_per_lb).toBeNull();
    expect(toProfile({ ...row, user_id: 'u1' })).toEqual({ ...input, userId: 'u1' });
  });
  it('defaults a missing everyday_activity to sedentary and round-trips the value', () => {
    const row = fromProfile(input);
    delete row.everyday_activity;
    expect(toProfile({ ...row, user_id: 'u1' }).everydayActivity).toBe('sedentary');
    const active = fromProfile({ ...input, everydayActivity: 'active' });
    expect(toProfile({ ...active, user_id: 'u1' }).everydayActivity).toBe('active');
  });
  it('coerces numeric strings', () => {
    const p = toProfile({ ...fromProfile(input), user_id: 'u', height_cm: '180.5', override_fat_pct: '30', override_kcal_adjust_pct: '-15' });
    expect(p.heightCm).toBe(180.5);
    expect(p.overrideFatPct).toBe(30);
    expect(p.overrideKcalAdjustPct).toBe(-15);
  });
});

describe('weight', () => {
  it('maps', () => {
    expect(fromWeight('2026-11-16', 80)).toEqual({ date: '2026-11-16', weight_kg: 80 });
    expect(toWeightKg({ weight_kg: '80.25' })).toBe(80.25);
  });
});

describe('food', () => {
  const usda: NewFood = {
    name: 'Oats', brand: 'Acme', source: 'usda', fdcId: 123, baseLabel: '40 g', baseGrams: 40,
    nutrients: { kcal: 150, proteinG: 5, carbsG: 27, fatG: 3, waterMl: 0 },
    portions: [{ label: '1 cup', grams: 80 }],
  };
  it('round-trips', () => {
    const row = { ...fromFood(usda), id: 'f1', last_used_at: '2026-11-16T10:00:00Z' };
    expect(toFood(row)).toEqual({ ...usda, id: 'f1', lastUsedAt: '2026-11-16T10:00:00Z' });
  });
  it('handles nulls and numeric strings', () => {
    const manual: NewFood = { ...usda, brand: null, source: 'manual', fdcId: null, baseGrams: null, portions: [] };
    const row = fromFood(manual);
    expect(row.brand).toBeNull();
    expect(row.fdc_id).toBeNull();
    expect(row.base_grams).toBeNull();
    const f = toFood({ ...row, id: 'f2', kcal: '150.5', protein_g: '5', fdc_id: '99', base_grams: '40', portions: [{ label: 'x', grams: '12' }], last_used_at: null });
    expect(f.nutrients.kcal).toBe(150.5);
    expect(f.fdcId).toBe(99);
    expect(f.baseGrams).toBe(40);
    expect(f.portions).toEqual([{ label: 'x', grams: 12 }]);
    expect(f.lastUsedAt).toBeNull();
    expect(toFood({ ...row, id: 'f3', fdc_id: null, base_grams: null, portions: null }).portions).toEqual([]);
  });
});

describe('food log', () => {
  const log: NewFoodLog = {
    date: '2026-11-16', foodId: 'f1', name: 'Oats', quantity: 1.5, unitLabel: 'servings', grams: 60,
    totals: { kcal: 225, proteinG: 7.5, carbsG: 40.5, fatG: 4.5, waterMl: 0 },
  };
  it('round-trips', () => {
    expect(toFoodLog({ ...fromFoodLog(log), id: 'l1', logged_at: '2026-11-16T12:00:00Z' })).toEqual({
      ...log, id: 'l1', loggedAt: '2026-11-16T12:00:00Z',
    });
  });
  it('handles null foodId/grams and string numerics', () => {
    const row = { ...fromFoodLog({ ...log, foodId: null, grams: null }), id: 'l2', logged_at: 't', quantity: '2', kcal: '100.5', grams: null };
    const l = toFoodLog(row);
    expect(l.foodId).toBeNull();
    expect(l.grams).toBeNull();
    expect(l.quantity).toBe(2);
    expect(l.totals.kcal).toBe(100.5);
  });
  it('patch maps only editable fields', () => {
    expect(Object.keys(fromFoodLogPatch({ quantity: 1, unitLabel: 'g', grams: null, totals: log.totals })).sort()).toEqual(
      ['carbs_g', 'fat_g', 'grams', 'kcal', 'protein_g', 'quantity', 'unit_label', 'water_ml'],
    );
  });
});

describe('water log', () => {
  it('maps', () => {
    expect(fromWaterLog('2026-11-16', 250)).toEqual({ date: '2026-11-16', ml: 250 });
    expect(toWaterLog({ id: 'w', date: 'd', logged_at: 't', ml: '250' })).toEqual({ id: 'w', date: 'd', loggedAt: 't', ml: 250 });
  });
});

describe('activity', () => {
  const a: DailyActivity = {
    date: '2026-11-16', mode: 'hours', directKcal: null,
    hours: { sedentaryH: 8, lightCardioH: 0.5, strenuousCardioH: 0, liftingH: 1 },
    everydayActivity: null,
  };
  it('keeps everydayActivity and maps a missing column to null', () => {
    expect(toActivity(fromActivity({ ...a, everydayActivity: 'moderate' })).everydayActivity).toBe('moderate');
    const row = fromActivity(a);
    delete row.everyday_activity;
    expect(toActivity(row).everydayActivity).toBeNull();
  });
  it('round-trips with null directKcal', () => {
    expect(toActivity(fromActivity(a))).toEqual(a);
    expect(toActivity(fromActivity({ ...a, mode: 'direct', directKcal: 600 })).directKcal).toBe(600);
  });
  it('coerces strings', () => {
    const r = toActivity({ ...fromActivity(a), direct_kcal: '600', lifting_h: '1.25' });
    expect(r.directKcal).toBe(600);
    expect(r.hours.liftingH).toBe(1.25);
  });
});

describe('workout', () => {
  const w: WorkoutSummary = {
    id: 'w1', date: '2026-11-15', startedAt: '2026-11-15T15:00:00Z', completedAt: null,
    lightCardioH: 0.667, strenuousCardioH: 0, liftingH: 0.622, raw: { schemaVersion: 1, id: 'w1' },
  };
  it('round-trips with null completedAt', () => {
    expect(toWorkout(fromWorkout(w))).toEqual(w);
    const done = { ...w, completedAt: '2026-11-15T16:00:00Z' };
    expect(toWorkout(fromWorkout(done))).toEqual(done);
  });
  it('coerces strings', () => {
    expect(toWorkout({ ...fromWorkout(w), lifting_h: '0.622' }).liftingH).toBe(0.622);
  });
});

describe('exercise rule', () => {
  it('round-trips', () => {
    const r: ExerciseRule = { exerciseId: 'e1', name: 'Run', category: 'strenuous_cardio' };
    expect(toExerciseRule(fromExerciseRule(r))).toEqual(r);
  });
});

describe('suggestion record', () => {
  it('round-trips a target_suggestions row', () => {
    const row = {
      id: 's1', kind: 'calorie', action: 'accepted', snooze_until: null,
      old_adjust_pct: '-20', new_adjust_pct: '-15', old_kcal: 2000, new_kcal: 2200,
      reason: 'because', created_at: '2026-11-22T10:00:00Z',
    };
    const rec = toSuggestionRecord(row);
    expect(rec).toEqual({
      id: 's1', kind: 'calorie', action: 'accepted', snoozeUntil: null,
      oldAdjustPct: -20, newAdjustPct: -15, oldKcal: 2000, newKcal: 2200,
      reason: 'because', createdAt: '2026-11-22T10:00:00Z',
    });
    const { id: _id, createdAt: _c, ...input } = rec;
    expect(fromSuggestionRecord(input)).toEqual({
      kind: 'calorie', action: 'accepted', snooze_until: null,
      old_adjust_pct: -20, new_adjust_pct: -15, old_kcal: 2000, new_kcal: 2200, reason: 'because',
    });
  });
  it('maps a snooze row with nulls', () => {
    const rec = toSuggestionRecord({
      id: 's2', kind: 'protein', action: 'snoozed', snooze_until: '2026-11-29',
      old_adjust_pct: null, new_adjust_pct: null, old_kcal: null, new_kcal: null, reason: null,
      created_at: 't',
    });
    expect(rec.snoozeUntil).toBe('2026-11-29');
    expect(rec.oldAdjustPct).toBeNull();
    expect(rec.reason).toBeNull();
  });
});
