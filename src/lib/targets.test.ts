import { describe, expect, it } from 'vitest';
import { ageOn, computeTargets } from './targets';
import type { DailyActivity, Profile, WorkoutHours } from './types';

const profile: Profile = {
  userId: 'u', birthMonth: 6, birthYear: 1990, sex: 'male', heightCm: 180, goal: 'maintain',
  units: 'metric', timezone: 'America/New_York',
  overrideKcalAdjustPct: null, overrideProteinGPerLb: null, overrideFatPct: null,
  overrideWaterBaseMlPerKg: null,
};
const date = '2026-11-15';
const sample: WorkoutHours[] = [{ lightCardioH: 0.667, strenuousCardioH: 0, liftingH: 0.622 }];
const hoursAct = (h: Partial<DailyActivity['hours']>): DailyActivity => ({
  date, mode: 'hours', directKcal: null,
  hours: { sedentaryH: 0, lightCardioH: 0, strenuousCardioH: 0, liftingH: 0, ...h },
});
const run = (over: Partial<Profile> = {}, activity: DailyActivity | null = null,
  workouts: WorkoutHours[] = [], weightKg = 80) =>
  computeTargets({ profile: { ...profile, ...over }, weightKg, date, activity, workouts });

describe('ageOn', () => {
  it('before birthday month', () => expect(ageOn(6, 1990, '2026-05-31')).toBe(35));
  it('in and after birthday month', () => {
    expect(ageOn(6, 1990, '2026-06-01')).toBe(36);
    expect(ageOn(6, 1990, '2026-11-15')).toBe(36);
  });
});

describe('computeTargets', () => {
  it('worked example: male, 80 kg, maintain, 1 h lifting + sample workout', () => {
    // age 36. BMR = 10*80 + 6.25*180 - 5*36 + 5 = 800 + 1125 - 180 + 5 = 1750
    // light 0.667, lifting 1 + 0.622 = 1.622, exercise 2.289, sedentary 16 - 2.289 = 13.711
    // activity = 0.3*80*13.711 + 3*80*0.667 + 4*80*1.622
    //          = 329.064 + 160.08 + 519.04 = 1008.184
    // burn = 1750*1.1 + 1008.184 = 2933.184 -> kcal 2933
    // protein = 0.8 * 80*2.20462 = 141.096 -> 141 g
    // fat = 2933.184*0.30/9 = 97.773 -> 98 g
    // carbs = (2933.184 - 564.383 - 879.955)/4 = 372.211 -> 372 g
    // water = 80*0.5*29.5735*2.20462 + 354.882*(2.289/0.5)
    //       = 2607.88 + 1624.65 = 4232.53 -> 4233 ml
    const r = run({}, hoursAct({ liftingH: 1 }), sample);
    expect(r.bmr).toBe(1750);
    expect(r.activityKcal).toBe(1008);
    expect(r.burn).toBe(2933);
    expect(r.targets).toEqual({ kcal: 2933, proteinG: 141, carbsG: 372, fatG: 98, waterMl: 4233 });
    expect(r.exerciseH).toBeCloseTo(2.289, 6);
    expect(r.countsWorkouts).toBe(true);
  });

  it('female BMR subtracts 161', () => {
    expect(run({ sex: 'female' }).bmr).toBe(1750 - 166);
  });

  it('null activity = 16 h sedentary', () => {
    // 0.3*80*16 = 384; burn = 1925 + 384 = 2309
    const r = run();
    expect(r.activityKcal).toBe(384);
    expect(r.burn).toBe(2309);
    expect(r.exerciseH).toBe(0);
  });

  it('explicit sedentaryH used when > 0', () => {
    expect(run({}, hoursAct({ sedentaryH: 10 })).activityKcal).toBe(240);
  });

  it('sedentary floors at 0 when exercise exceeds 16 h', () => {
    expect(run({}, hoursAct({ lightCardioH: 17 })).activityKcal).toBe(4080);
  });

  it.each([
    ['lose_fat', 0.8, 1.0, 25],
    ['maintain', 1.0, 0.8, 30],
    ['build_muscle', 1.1, 1.0, 25],
  ] as const)('goal %s', (goal, mult, pPerLb, fatPct) => {
    const r = run({ goal });
    const kcal = 2309 * mult;
    expect(r.targets.kcal).toBe(Math.round(kcal));
    expect(r.targets.proteinG).toBe(Math.round(pPerLb * 80 * 2.20462));
    expect(r.targets.fatG).toBe(Math.round((kcal * fatPct) / 100 / 9));
  });

  it('overrides replace defaults', () => {
    const r = run({
      overrideKcalAdjustPct: -15, overrideProteinGPerLb: 1.2, overrideFatPct: 20,
      overrideWaterBaseMlPerKg: 40,
    });
    const kcal = 2309 * 0.85;
    const protein = 1.2 * 80 * 2.20462;
    const fat = (kcal * 0.2) / 9;
    expect(r.targets.kcal).toBe(Math.round(kcal));
    expect(r.targets.proteinG).toBe(Math.round(protein));
    expect(r.targets.fatG).toBe(Math.round(fat));
    expect(r.targets.carbsG).toBe(Math.round((kcal - protein * 4 - fat * 9) / 4));
    expect(r.targets.waterMl).toBe(3200);
  });

  it('carbs floor at 0 with extreme overrides', () => {
    const r = run({ overrideProteinGPerLb: 5, overrideFatPct: 60 });
    expect(r.targets.carbsG).toBe(0);
  });

  describe('direct mode', () => {
    const direct: DailyActivity = {
      date, mode: 'direct', directKcal: 500,
      hours: { sedentaryH: 0, lightCardioH: 0, strenuousCardioH: 0, liftingH: 0 },
    };
    it('uses directKcal, ignores workouts for kcal, no sedentary baseline', () => {
      const r = run({}, direct, sample);
      expect(r.activityKcal).toBe(500);
      expect(r.burn).toBe(1925 + 500);
      expect(r.countsWorkouts).toBe(false);
    });
    it('still counts workout hours for water', () => {
      const r = run({}, direct, sample);
      expect(r.exerciseH).toBeCloseTo(1.289, 6);
      const expected = 80 * 0.5 * 29.5735 * 2.20462 + 354.882 * (1.289 / 0.5);
      expect(r.targets.waterMl).toBe(Math.round(expected));
    });
    it('null directKcal is 0', () => {
      expect(run({}, { ...direct, directKcal: null }).activityKcal).toBe(0);
    });
  });
});
