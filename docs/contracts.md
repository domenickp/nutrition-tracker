# Contracts

Builders code against this file. The design is in
`docs/superpowers/specs/2026-11-16-nutrition-tracker-design.md`; read it for the why.
If this file and the design disagree, this file wins, and say so in your report.

## §1 Conventions

- Node 22+, npm. React 18 + TypeScript (strict) + Vite. Router: `react-router-dom` v6.
- Tests: Vitest. `npm test` runs `vitest run`. Test files sit next to their source as
  `*.test.ts(x)`. Vitest `include` covers `src/**/*.test.ts(x)` and
  `supabase/functions/**/*.test.ts`.
- `npm run typecheck` runs `tsc --noEmit` (via `tsc -b` or equivalent). `npm run build`
  produces `dist/`.
- `src/lib/**` is **pure**: no React, no Supabase, no network, no `Date.now()` without an
  injectable parameter. It must be deterministic and unit-tested.
- Internal units are metric: kg, cm, ml, g. Convert only at the UI edge with `src/lib/units.ts`.
- A **date** is a calendar-date string `YYYY-MM-DD` in the profile's IANA `timezone`.
  Timestamps are ISO-8601 strings.
- Domain objects are camelCase (§2). Database columns are snake_case (§6). Only
  `src/data/**` maps between them.
- Sample workout export: `docs/samples/workout-2026-11-16-d3.json`.

## §2 Domain types — `src/lib/types.ts` (owned by scaffold, nt task "scaffold")

```ts
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
```

## §3 Pure library — `src/lib/`

### targets.ts (task "targets")
```ts
export function ageOn(birthMonth: number, birthYear: number, date: string): number;
export function computeTargets(input: {
  profile: Profile; weightKg: number; date: string;
  activity: DailyActivity | null; workouts: WorkoutHours[];
}): TargetResult;
```
Implements design §"Target calculation" exactly, constants:
MET sedentary 1.3, light 4.0, strenuous 8.0, lifting 5.0; waking hours 16; digestion
factor 1.1; goal kcal adjust −20 / 0 / +10 %; protein 1.0 / 0.8 / 1.0 g per lb; fat
25 / 30 / 25 %; water base 0.5 fl oz per lb (= 32.54 ml/kg, use 0.5 × 29.5735 ml per lb),
plus 12 fl oz (354.882 ml) per 0.5 h exercise. Results rounded to whole numbers
(kcal, g, ml). `ageOn` treats the birthday as the 1st of the birth month.
Null activity is the same as hours mode with all zeros.

### units.ts and portions.ts (task "portions")
```ts
// units.ts
export const LB_PER_KG = 2.20462; export const CM_PER_IN = 2.54; export const ML_PER_FLOZ = 29.5735;
export function kgToLb(kg: number): number; export function lbToKg(lb: number): number;
export function cmToIn(cm: number): number; export function inToCm(inches: number): number;
export function mlToFlOz(ml: number): number; export function flOzToMl(oz: number): number;
export function formatWeight(kg: number, units: Units): string;   // "180.4 lb" | "81.8 kg"
export function formatVolume(ml: number, units: Units): string;   // "64 fl oz" | "1.9 L"/"500 ml"

// volume.ts  (added 2026-11-17, see specs/2026-11-17-volume-search-design.md)
export type VolumeUnit = 'cup' | 'tbsp' | 'tsp' | 'fl oz' | 'ml';
export const ML_PER_UNIT: Record<VolumeUnit, number>; // cup 236.588, tbsp 14.7868, tsp 4.92892, fl oz 29.5735, ml 1
export function parseVolumeLabel(label: string):
  { amount: number; unit: VolumeUnit; ml: number; note: string } | null;
export function gramsPerMl(food: Food): { gPerMl: number; basis: string } | null; // first volume portion
export function baseVolumeMl(food: Food): number | null;  // food.baseLabel parsed as volume, else null

// portions.ts
export type AmountUnit =
  | { kind: 'base' }                                  // label shown: food.baseLabel
  | { kind: 'portion'; label: string; grams: number }
  | { kind: 'volume'; unit: VolumeUnit; gramsPerUnit: number | null; servingsPerUnit: number; basis: string }
  | { kind: 'grams' };
export function amountOptions(food: Food): AmountUnit[];
  // base; portions (only if baseGrams); volume units (if gramsPerMl && baseGrams, or baseVolumeMl); grams (only if baseGrams)
export function computeEntry(food: Food, quantity: number, unit: AmountUnit):
  { totals: Nutrients; unitLabel: string; grams: number | null; ml: number | null };
export function unitDisplayLabel(food: Food, unit: AmountUnit): string; // for pickers
export function scaleTotals(totals: Nutrients, ratio: number): Nutrients;
export function sumNutrients(list: Nutrients[]): Nutrients;
```
`unitLabel`: base → `"servings"`, portion → its label, volume → the unit (`"cup"`), grams →
`"g"`. Totals are rounded to 1 decimal place. `ml` is known for volume units and for the
base serving when `baseVolumeMl` is known; `grams`/`ml` are rounded to 1 decimal.

### dates.ts and workoutImport.ts (task "workout-import")
```ts
// dates.ts
export function localDate(iso: string, timeZone: string): string;    // "2026-11-15"
export function todayIn(timeZone: string, now?: Date): string;
export function addDays(date: string, n: number): string;

// workoutImport.ts
export type ParseResult = { ok: true; workouts: unknown[] } | { ok: false; error: string };
export function parseWorkoutJson(text: string): ParseResult; // accepts one object or an array; validates schemaVersion === 1
export interface ExerciseAnalysis {
  exerciseId: string; name: string; category: ExerciseCategory;
  source: 'rule-id' | 'rule-name' | 'guess'; timedMin: number; doneSets: number;
}
export interface WorkoutAnalysis {
  id: string; date: string; startedAt: string; completedAt: string | null; // effective (completedAt ?? savedAt ?? null)
  sessionMin: number | null; exercises: ExerciseAnalysis[]; raw: unknown;
}
export function analyzeWorkout(raw: unknown, opts: { timeZone: string; rules: ExerciseRule[] }): WorkoutAnalysis;
export function summarizeWorkout(a: WorkoutAnalysis, overrides?: {
  categories?: Record<string, ExerciseCategory>; sessionMin?: number;
}): WorkoutSummary;
export function rulesFromAnalysis(a: WorkoutAnalysis, overrides?: Record<string, ExerciseCategory>): ExerciseRule[];
```
Rules from the design §"Workout import". Name matching strips a leading `Warm Up:`
(case-insensitive) and compares case-insensitively. Cardio hours = timed minutes of
cardio exercises; lifting hours = max(0, sessionMin − cardio minutes) / 60, or 0 when
sessionMin is null. Sample must produce: date `2026-11-15` in America/New_York,
lightCardioH ≈ 0.667, liftingH ≈ 0.622 (77.3 − 40 min), strenuousCardioH 0.

## §4 USDA Edge Function — `supabase/functions/usda/` (task "usda")

- `normalize.ts`: pure, no Deno APIs, so Vitest can import it.
  ```ts
  export type UsdaFood = NewFood & { source: 'usda'; fdcId: number; dataType: string };
  export function normalizeSearchFood(f: any): UsdaFood;  // from /v1/foods/search item
  export function normalizeFoodDetail(f: any): UsdaFood;  // from /v1/food/{id}, includes portions
  ```
  Nutrient numbers: 208 kcal, 203 protein, 204 fat, 205 carbs (fall back to 957/958
  for energy if 208 is missing). Foundation/SR Legacy: base `"100 g"` / 100 g, portions
  from `foodPortions` as `{label: "<amount> <modifier or measureUnit.name>", grams: gramWeight}`.
  Branded: base = `"<servingSize> <servingSizeUnit>"`, baseGrams = servingSize when the
  unit is g/grm, else null; nutrients scaled from per-100 g (or taken from `labelNutrients`).
  `waterMl` is 0. `brand` = brandOwner/brandName or null.
- `index.ts`: Deno handler. Requires an `Authorization` bearer JWT (reject 401 otherwise;
  verify with Supabase's built-in JWT verification, `verify_jwt = true`). Handles CORS.
  `GET ?op=search&q=<text>` → `{ foods: UsdaFood[] }` (page size 25, data types Foundation,
  SR Legacy, Branded). `GET ?op=food&fdcId=<n>` → `UsdaFood`. Key from env `USDA_API_KEY`.
  Errors → `{ error: string }` with a 4xx/5xx status.

## §5 Data layer — `src/data/` (task "data")

All functions are async, use the client from `src/lib/supabase.ts`, rely on RLS for
scoping, set `user_id` from the current session on insert, and throw `Error` with a
readable message on failure.

```ts
// auth.ts
export function sendSignInEmail(email: string): Promise<void>;   // signInWithOtp, shouldCreateUser: false
export function verifyCode(email: string, code: string): Promise<void>;
export function signOut(): Promise<void>;
export function useSession(): { session: Session | null; loading: boolean };

// api.ts
export function getProfile(): Promise<Profile | null>;
export function saveProfile(p: ProfileInput): Promise<Profile>;
export function addWeight(date: string, kg: number): Promise<void>;   // upsert per (user, date)
export function getLatestWeight(onOrBefore: string): Promise<number | null>;
export function loadDay(date: string): Promise<DayData>;              // throws if no profile
export function listFoods(search?: string): Promise<Food[]>;           // ilike on name, last_used_at desc nulls last, then name
export function saveFood(f: NewFood): Promise<Food>;                   // usda: upsert on (user_id, fdc_id)
export function updateFood(id: string, f: NewFood): Promise<Food>;
export function deleteFood(id: string): Promise<void>;
export function addFoodLog(l: NewFoodLog): Promise<FoodLog>;          // also sets foods.last_used_at
export function updateFoodLog(id: string, patch: Pick<FoodLog, 'quantity' | 'unitLabel' | 'grams' | 'totals'>): Promise<FoodLog>;
export function deleteFoodLog(id: string): Promise<void>;
export function addWater(date: string, ml: number): Promise<WaterLog>;
export function deleteWater(id: string): Promise<void>;
export function saveActivity(a: DailyActivity): Promise<void>;        // upsert per (user, date)
export function saveWorkout(w: WorkoutSummary, replace: boolean): Promise<'saved' | 'exists'>;
export function deleteWorkout(id: string): Promise<void>;
export function listExerciseRules(): Promise<ExerciseRule[]>;
export function saveExerciseRules(rules: ExerciseRule[]): Promise<void>; // upsert per (user, exercise_id)
export function searchUsda(q: string): Promise<UsdaFood[]>;           // functions.invoke('usda', …)
export function getUsdaFood(fdcId: number): Promise<UsdaFood>;
```
`UsdaFood` is imported from `supabase/functions/usda/normalize.ts` as a type only.

## §6 Database — `supabase/migrations/` (task "schema")

Tables and columns exactly as in the design §"Data model", snake_case:
`profiles`, `weights` (unique `user_id, date`), `foods` (`portions jsonb not null default '[]'`,
nutrient columns `kcal, protein_g, carbs_g, fat_g, water_ml` per base serving, unique
`(user_id, fdc_id)` where `fdc_id is not null`), `food_logs` (totals as
`kcal, protein_g, carbs_g, fat_g, water_ml`; `food_id` FK `on delete set null`),
`water_logs`, `daily_activity` (PK `user_id, date`), `workouts` (PK `user_id, id`,
`id text`), `exercise_categories` (PK `user_id, exercise_id`). Every table: `user_id uuid
not null default auth.uid() references auth.users on delete cascade`, RLS enabled, policies
for select/insert/update/delete with `auth.uid() = user_id`. Check constraints on enums.
Indexes on `(user_id, date)` for log tables.

## §7 Screens and routes (scaffold defines routes; each screen task owns its folder)

| Route | Folder | Task |
|---|---|---|
| `/signin` | `src/screens/signin/` | "settings" |
| `/settings` | `src/screens/settings/` | "settings" |
| `/` and `/day/:date` | `src/screens/today/` | "today" |
| `/day/:date/add` | `src/screens/addfood/` | "addfood" |
| `/day/:date/activity` | `src/screens/activity/` | "activity" |

Each folder exports a default component from `index.tsx`. Shared UI lives in
`src/components/` (owned by scaffold; screen tasks may *add* new files in their own folder
only). The App shell redirects to `/signin` without a session and to `/settings` when
signed in with no profile.
