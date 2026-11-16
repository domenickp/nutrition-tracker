export type Sex = 'male' | 'female';
export type Goal = 'lose_fat' | 'maintain' | 'build_muscle';
export type Units = 'imperial' | 'metric';

export interface Profile {
  userId: string;
  birthMonth: number;        // 1–12
  birthYear: number;
  sex: Sex;
  heightCm: number;
  goal: Goal;
  units: Units;
  timezone: string;          // IANA, e.g. "America/New_York"
  overrideKcalAdjustPct: number | null;     // e.g. -15 means burn × 0.85
  overrideProteinGPerLb: number | null;
  overrideFatPct: number | null;            // percent of calories, e.g. 30
  overrideWaterBaseMlPerKg: number | null;
}
export type ProfileInput = Omit<Profile, 'userId'>;

export interface Nutrients {
  kcal: number; proteinG: number; carbsG: number; fatG: number; waterMl: number;
}

export interface Portion { label: string; grams: number }

export interface Food {
  id: string;
  name: string;
  brand: string | null;
  source: 'manual' | 'usda';
  fdcId: number | null;
  baseLabel: string;         // e.g. "100 g", "1 bar", "1 serving"
  baseGrams: number | null;  // grams in one base serving, if known
  nutrients: Nutrients;      // per ONE base serving
  portions: Portion[];
  lastUsedAt: string | null;
}
export type NewFood = Omit<Food, 'id' | 'lastUsedAt'>;

export interface FoodLog {
  id: string;
  date: string;
  loggedAt: string;
  foodId: string | null;
  name: string;
  quantity: number;
  unitLabel: string;         // "servings" | "g" | a portion label such as "1 cup"
  grams: number | null;      // total grams of this entry, if known
  totals: Nutrients;         // snapshot for this entry
}
export type NewFoodLog = Omit<FoodLog, 'id' | 'loggedAt'>;

export interface WaterLog { id: string; date: string; loggedAt: string; ml: number }

export interface ActivityHours {
  sedentaryH: number; lightCardioH: number; strenuousCardioH: number; liftingH: number;
}
export type ActivityMode = 'direct' | 'hours';
export interface DailyActivity {
  date: string;
  mode: ActivityMode;
  directKcal: number | null;
  hours: ActivityHours;
}

export type ExerciseCategory = 'light_cardio' | 'strenuous_cardio' | 'lifting';
export interface ExerciseRule { exerciseId: string; name: string; category: ExerciseCategory }

export interface WorkoutHours { lightCardioH: number; strenuousCardioH: number; liftingH: number }
export interface WorkoutSummary extends WorkoutHours {
  id: string;                // the workout's own id from its JSON
  date: string;
  startedAt: string;
  completedAt: string | null;
  raw: unknown;              // the original workout object
}

export interface TargetResult {
  targets: Nutrients;
  bmr: number;
  activityKcal: number;
  burn: number;
  exerciseH: number;         // light + strenuous + lifting hours counted for water
  countsWorkouts: boolean;   // false in direct mode
}

export interface DayData {
  date: string;
  profile: Profile;
  weightKg: number | null;   // latest weight on or before date
  activity: DailyActivity | null;
  workouts: WorkoutSummary[];
  foodLogs: FoodLog[];
  waterLogs: WaterLog[];
}
