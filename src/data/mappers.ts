// Pure row <-> domain mappers. Only src/data/** maps snake_case rows to camelCase domain types.
// PostgREST may return `numeric` columns as strings, so every numeric goes through Number().
import type {
  DailyActivity,
  ExerciseCategory,
  ExerciseRule,
  Food,
  FoodLog,
  NewFood,
  NewFoodLog,
  NewSuggestionRecord,
  Nutrients,
  Portion,
  Profile,
  ProfileInput,
  SuggestionRecord,
  WaterLog,
  WorkoutSummary,
} from '../lib/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// profiles
export function toProfile(r: Row): Profile {
  return {
    userId: r.user_id,
    birthMonth: num(r.birth_month),
    birthYear: num(r.birth_year),
    sex: r.sex,
    heightCm: num(r.height_cm),
    goal: r.goal,
    everydayActivity: r.everyday_activity ?? 'sedentary',
    units: r.units,
    timezone: r.timezone,
    overrideKcalAdjustPct: numOrNull(r.override_kcal_adjust_pct),
    overrideProteinGPerLb: numOrNull(r.override_protein_g_per_lb),
    overrideFatPct: numOrNull(r.override_fat_pct),
    overrideWaterBaseMlPerKg: numOrNull(r.override_water_base_ml_per_kg),
  };
}
export function fromProfile(p: ProfileInput): Row {
  return {
    birth_month: p.birthMonth,
    birth_year: p.birthYear,
    sex: p.sex,
    height_cm: p.heightCm,
    goal: p.goal,
    everyday_activity: p.everydayActivity,
    units: p.units,
    timezone: p.timezone,
    override_kcal_adjust_pct: p.overrideKcalAdjustPct,
    override_protein_g_per_lb: p.overrideProteinGPerLb,
    override_fat_pct: p.overrideFatPct,
    override_water_base_ml_per_kg: p.overrideWaterBaseMlPerKg,
  };
}

// weights
export function toWeightKg(r: Row): number {
  return num(r.weight_kg);
}
export function fromWeight(date: string, kg: number): Row {
  return { date, weight_kg: kg };
}

// foods
function toPortions(v: unknown): Portion[] {
  if (!Array.isArray(v)) return [];
  return v.map((p: any) => ({ label: String(p.label), grams: Number(p.grams) }));
}
export function toFood(r: Row): Food {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand ?? null,
    source: r.source,
    fdcId: numOrNull(r.fdc_id),
    baseLabel: r.base_label,
    baseGrams: numOrNull(r.base_grams),
    nutrients: {
      kcal: num(r.kcal),
      proteinG: num(r.protein_g),
      carbsG: num(r.carbs_g),
      fatG: num(r.fat_g),
      waterMl: num(r.water_ml),
    },
    portions: toPortions(r.portions),
    lastUsedAt: r.last_used_at ?? null,
  };
}
export function fromFood(f: NewFood): Row {
  return {
    name: f.name,
    brand: f.brand,
    source: f.source,
    fdc_id: f.fdcId,
    base_label: f.baseLabel,
    base_grams: f.baseGrams,
    kcal: f.nutrients.kcal,
    protein_g: f.nutrients.proteinG,
    carbs_g: f.nutrients.carbsG,
    fat_g: f.nutrients.fatG,
    water_ml: f.nutrients.waterMl,
    portions: f.portions.map((p) => ({ label: p.label, grams: p.grams })),
  };
}

// food_logs
function totalsFromRow(r: Row): Nutrients {
  return {
    kcal: num(r.kcal),
    proteinG: num(r.protein_g),
    carbsG: num(r.carbs_g),
    fatG: num(r.fat_g),
    waterMl: num(r.water_ml),
  };
}
function totalsToRow(t: Nutrients): Row {
  return { kcal: t.kcal, protein_g: t.proteinG, carbs_g: t.carbsG, fat_g: t.fatG, water_ml: t.waterMl };
}
export function toFoodLog(r: Row): FoodLog {
  return {
    id: r.id,
    date: r.date,
    loggedAt: r.logged_at,
    foodId: r.food_id ?? null,
    name: r.name,
    quantity: num(r.quantity),
    unitLabel: r.unit_label,
    grams: numOrNull(r.grams),
    totals: totalsFromRow(r),
  };
}
export function fromFoodLog(l: NewFoodLog): Row {
  return {
    date: l.date,
    food_id: l.foodId,
    name: l.name,
    quantity: l.quantity,
    unit_label: l.unitLabel,
    grams: l.grams,
    ...totalsToRow(l.totals),
  };
}
export function fromFoodLogPatch(p: Pick<FoodLog, 'quantity' | 'unitLabel' | 'grams' | 'totals'>): Row {
  return { quantity: p.quantity, unit_label: p.unitLabel, grams: p.grams, ...totalsToRow(p.totals) };
}

// water_logs
export function toWaterLog(r: Row): WaterLog {
  return { id: r.id, date: r.date, loggedAt: r.logged_at, ml: num(r.ml) };
}
export function fromWaterLog(date: string, ml: number): Row {
  return { date, ml };
}

// daily_activity
export function toActivity(r: Row): DailyActivity {
  return {
    date: r.date,
    mode: r.mode,
    directKcal: numOrNull(r.direct_kcal),
    hours: {
      sedentaryH: num(r.sedentary_h),
      lightCardioH: num(r.light_cardio_h),
      strenuousCardioH: num(r.strenuous_cardio_h),
      liftingH: num(r.lifting_h),
    },
  };
}
export function fromActivity(a: DailyActivity): Row {
  return {
    date: a.date,
    mode: a.mode,
    direct_kcal: a.directKcal,
    sedentary_h: a.hours.sedentaryH,
    light_cardio_h: a.hours.lightCardioH,
    strenuous_cardio_h: a.hours.strenuousCardioH,
    lifting_h: a.hours.liftingH,
  };
}

// workouts
export function toWorkout(r: Row): WorkoutSummary {
  return {
    id: r.id,
    date: r.date,
    startedAt: r.started_at,
    completedAt: r.completed_at ?? null,
    lightCardioH: num(r.light_cardio_h),
    strenuousCardioH: num(r.strenuous_cardio_h),
    liftingH: num(r.lifting_h),
    raw: r.raw,
  };
}
export function fromWorkout(w: WorkoutSummary): Row {
  return {
    id: w.id,
    date: w.date,
    started_at: w.startedAt,
    completed_at: w.completedAt,
    raw: w.raw,
    light_cardio_h: w.lightCardioH,
    strenuous_cardio_h: w.strenuousCardioH,
    lifting_h: w.liftingH,
  };
}

// target_suggestions
export function toSuggestionRecord(r: Row): SuggestionRecord {
  return {
    id: r.id,
    kind: r.kind,
    action: r.action,
    snoozeUntil: r.snooze_until ?? null,
    oldAdjustPct: numOrNull(r.old_adjust_pct),
    newAdjustPct: numOrNull(r.new_adjust_pct),
    oldKcal: numOrNull(r.old_kcal),
    newKcal: numOrNull(r.new_kcal),
    reason: r.reason ?? null,
    createdAt: r.created_at,
  };
}
export function fromSuggestionRecord(r: NewSuggestionRecord): Row {
  return {
    kind: r.kind,
    action: r.action,
    snooze_until: r.snoozeUntil,
    old_adjust_pct: r.oldAdjustPct,
    new_adjust_pct: r.newAdjustPct,
    old_kcal: r.oldKcal,
    new_kcal: r.newKcal,
    reason: r.reason,
  };
}

// exercise_categories
export function toExerciseRule(r: Row): ExerciseRule {
  return { exerciseId: r.exercise_id, name: r.name, category: r.category as ExerciseCategory };
}
export function fromExerciseRule(e: ExerciseRule): Row {
  return { exercise_id: e.exerciseId, name: e.name, category: e.category };
}
