import type { DailyActivity, Goal, Profile, TargetResult, WorkoutHours } from './types';

const LB_PER_KG = 2.20462;
const ML_PER_FLOZ = 29.5735;
const MET = { sedentary: 1.3, light: 4.0, strenuous: 8.0, lifting: 5.0 };
const WAKING_HOURS = 16;
const DIGESTION_FACTOR = 1.1;
const WATER_ML_PER_HALF_HOUR = 12 * ML_PER_FLOZ; // 354.882 ml per 0.5 h of exercise
const DEFAULT_WATER_ML_PER_KG = 0.5 * ML_PER_FLOZ * LB_PER_KG;

const KCAL_ADJUST_PCT: Record<Goal, number> = { lose_fat: -20, maintain: 0, build_muscle: 10 };
const PROTEIN_G_PER_LB: Record<Goal, number> = { lose_fat: 1.0, maintain: 0.8, build_muscle: 1.0 };
const FAT_PCT: Record<Goal, number> = { lose_fat: 25, maintain: 30, build_muscle: 25 };

/** Whole years of age on `date` (YYYY-MM-DD); the birthday is the 1st of the birth month. */
export function ageOn(birthMonth: number, birthYear: number, date: string): number {
  const [y, m] = date.split('-').map(Number);
  return y - birthYear - (m < birthMonth ? 1 : 0);
}

export function computeTargets(input: {
  profile: Profile;
  weightKg: number;
  date: string;
  activity: DailyActivity | null;
  workouts: WorkoutHours[];
}): TargetResult {
  const { profile, weightKg, date, activity, workouts } = input;
  const age = ageOn(profile.birthMonth, profile.birthYear, date);
  const bmr =
    10 * weightKg + 6.25 * profile.heightCm - 5 * age + (profile.sex === 'male' ? 5 : -161);

  const direct = activity?.mode === 'direct';
  // Manual hours only apply in hours mode; workout hours count in both modes (for water).
  let light = direct || !activity ? 0 : activity.hours.lightCardioH;
  let strenuous = direct || !activity ? 0 : activity.hours.strenuousCardioH;
  let lifting = direct || !activity ? 0 : activity.hours.liftingH;
  for (const w of workouts) {
    light += w.lightCardioH;
    strenuous += w.strenuousCardioH;
    lifting += w.liftingH;
  }
  const exerciseH = light + strenuous + lifting;

  let activityKcal: number;
  if (direct) {
    activityKcal = activity?.directKcal ?? 0;
  } else {
    const sedentary =
      activity && activity.hours.sedentaryH > 0
        ? activity.hours.sedentaryH
        : Math.max(0, WAKING_HOURS - exerciseH);
    activityKcal =
      (MET.sedentary - 1) * weightKg * sedentary +
      (MET.light - 1) * weightKg * light +
      (MET.strenuous - 1) * weightKg * strenuous +
      (MET.lifting - 1) * weightKg * lifting;
  }

  const burn = bmr * DIGESTION_FACTOR + activityKcal;
  const adjustPct = profile.overrideKcalAdjustPct ?? KCAL_ADJUST_PCT[profile.goal];
  const kcal = burn * (1 + adjustPct / 100);
  const proteinG =
    (profile.overrideProteinGPerLb ?? PROTEIN_G_PER_LB[profile.goal]) * weightKg * LB_PER_KG;
  const fatG = (kcal * (profile.overrideFatPct ?? FAT_PCT[profile.goal])) / 100 / 9;
  const carbsG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);
  const baseMlPerKg = profile.overrideWaterBaseMlPerKg ?? DEFAULT_WATER_ML_PER_KG;
  const waterMl = baseMlPerKg * weightKg + WATER_ML_PER_HALF_HOUR * (exerciseH / 0.5);

  return {
    targets: {
      kcal: Math.round(kcal),
      proteinG: Math.round(proteinG),
      carbsG: Math.round(carbsG),
      fatG: Math.round(fatG),
      waterMl: Math.round(waterMl),
    },
    bmr: Math.round(bmr),
    activityKcal: Math.round(activityKcal),
    burn: Math.round(burn),
    exerciseH,
    countsWorkouts: !direct,
  };
}
