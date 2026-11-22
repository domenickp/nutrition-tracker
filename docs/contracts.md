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

export interface ActivityPart { hours: number; met: number; kcal: number }   // kcal = (met − 1) × kg × hours, unrounded
export interface TargetResult {
  targets: Nutrients;
  bmr: number;
  activityKcal: number;
  /** Hours mode only (null in direct mode). Hours include manual + workout hours;
   *  sedentary = max(0, 16 − exerciseH). Added 2026-11-18 (nt-rgd). */
  breakdown: { sedentary: ActivityPart; light: ActivityPart; strenuous: ActivityPart; lifting: ActivityPart } | null;
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
| `/workout` | `src/screens/workout/` | nt-7km.3 (see §8) |
| `/workout/history`, `/workout/history/:id`, `/workout/import` | `src/screens/workouthistory/` | nt-7km.4 (see §8) |

Each folder exports a default component from `index.tsx`. Shared UI lives in
`src/components/` (owned by scaffold; screen tasks may *add* new files in their own folder
only). The App shell redirects to `/signin` without a session and to `/settings` when
signed in with no profile.

## §8 Workout tab (epic nt-7km, added 2026-11-18)

Design: `docs/superpowers/specs/2026-11-18-workout-tab-design.md`. The original app is
copied for reference in `docs/reference/fatherworkout/` (FatherWorkout @ a7a085f, MIT, same
author): `index.html` (UI; the pure `FW` module is lines ~222–432, the UI after it), `Lib.js`,
`contracts.md` (its session format §2 and UI behaviour §5), `lib.test.js`, `ui.test.js`,
`routine.json`. **Port behaviour exactly** unless this section says otherwise. No database
migration.

### §8.1 `src/lib/routine.ts` (task nt-7km.1)
```ts
export interface RoutineExercise {
  id: string; name: string; warmup: boolean; sets: number | null; reps: number | null;
  weightLb: number | null; timeMin: number | null; timeSec: number | null;
  rest: string | null; notes: string | null;
}
export interface RoutineDay { day: number; areas: string; exercises: RoutineExercise[] }
export interface Routine { schemaVersion: 1; days: RoutineDay[] }
export const ROUTINE: Routine;   // loaded from config/workouts.yaml (see §8.7)
export function routineDay(routine: Routine, day: number): RoutineDay | null;
```

### §8.2 `src/lib/workoutSession.ts` (task nt-7km.1, pure)
```ts
export interface SessionSet { reps: number | null; weightLb: number | null; timeMin: number | null; timeSec: number | null; done: boolean }
export interface SessionEntry { exerciseId: string; name: string; sets: SessionSet[]; notes: string | null }
export interface WorkoutSession {
  schemaVersion: 1; id: string; day: number; startedAt: string; completedAt: string | null;
  entries: SessionEntry[]; notes: string | null; savedAt?: string;
}
export interface SessionSummary { id: string; day: number; startedAt: string; completedAt: string | null; exerciseCount: number; setsDone: number }
export interface ExerciseLog { sets: SessionSet[]; notes: string }          // UI state per exercise
export interface DraftState {                                              // what localStorage holds
  id: string; day: number; startedAt: string; log: Record<string, ExerciseLog>; notes: string;
}
export const DRAFT_KEY = 'nt-workout-draft';

// From Lib.js (same rules; validateSession also requires schemaVersion === 1):
export function validateSession(s: unknown, routine?: Routine): string[];
export function normalizeSession(s: WorkoutSession): WorkoutSession;   // absent timeSec/notes -> null; new object
export function summarizeSession(s: WorkoutSession): SessionSummary;
export function sortSessionsNewestFirst(s: WorkoutSession[]): WorkoutSession[];
export function latestCompletedByDay(s: WorkoutSession[], days: number[]): Record<string, WorkoutSession | null>;
// From index.html's FW module and UI helpers (same behaviour):
export function toNum(v: unknown): number | null;
export function formatNum(n: number | null | undefined): string;
export function parseRestSeconds(rest: string | null): number | null;
export function formatTarget(ex: RoutineExercise): string;
export function defaultDay(routine: Routine, recent: SessionSummary[]): number | null;
export function formatLastTime(entry: SessionEntry | null | undefined): string;
export function isTimed(ex: RoutineExercise): boolean;
export function isSeconds(ex: RoutineExercise): boolean;
export function initialSets(ex: RoutineExercise, lastEntry: SessionEntry | null | undefined): SessionSet[];
export function newSetFor(sets: SessionSet[], lastEntry: SessionEntry | null | undefined): SessionSet; // index.html newSetFor
export function removeSetAt(sets: SessionSet[], idx: number): SessionSet[];
export function buildSession(state: { id: string; day: number; startedAt: string; completedAt: string | null;
  notes: string; exercises: { id: string; name: string }[]; log: Record<string, ExerciseLog> }): WorkoutSession;
export function countDone(log: Record<string, ExerciseLog>): number;
export function formatClock(totalSec: number): string;
export function formatSessionDate(iso: string, timeZone?: string): string;
```
A session is **completed** when `completedAt` is non-null.

### §8.3 `src/data/workouts.ts` (task nt-7km.1)
Uses the existing `workouts` table via `saveWorkout`, `listExerciseRules`,
`saveExerciseRules` and `getProfile` from `api.ts`, plus the supabase client for reads. Only
rows whose `raw` passes `validateSession(raw)` (no routine) count as sessions; others are
skipped silently.
```ts
export function loadWorkoutData(): Promise<{ recent: SessionSummary[]; lastByDay: Record<string, WorkoutSession | null> }>;
  // recent: 20 newest by started_at. lastByDay: for each ROUTINE day, the newest session whose
  // raw.completedAt is set and raw.day is that day (query per day with raw->> filters, or fetch and filter in code).
export function getWorkoutSession(id: string): Promise<WorkoutSession>;   // throws Error('Session not found: ' + id)
export function saveWorkoutSession(s: WorkoutSession, now?: Date): Promise<{ id: string; date: string; savedAt: string }>;
  // validateSession(s, ROUTINE) -> throw Error('Invalid session: ' + errors.join('; ')) on failure.
  // savedAt = (now ?? new Date()).toISOString(); a = analyzeWorkout(session, { timeZone: profile.timezone,
  // rules: await listExerciseRules() }); saveWorkout(summarizeWorkout(a), true); saveExerciseRules(rulesFromAnalysis(a)).
  // Returns date = the summary's date. Throws if there is no profile.
export function importWorkoutSessions(raws: unknown[]): Promise<{ imported: number; existing: number; invalid: { index: number; errors: string[] }[] }>;
  // per item: validateSession(raw) (no routine) -> normalizeSession -> analyze/summarize as above ->
  // saveWorkout(summary, false); 'exists' counts as existing. Rules from all imported items saved once at the end.
```

### §8.4 Shell (task nt-7km.2)
- Routes in `src/App.tsx`: `/workout` → `src/screens/workout/index.tsx` default export;
  `/workout/history` → `src/screens/workouthistory/index.tsx` default export;
  `/workout/history/:id` → `src/screens/workouthistory/session.tsx` default export;
  `/workout/import` → `src/screens/workouthistory/import.tsx` default export.
- `Layout` nav: Today · **Workout** (`/workout`, active on all `/workout/*`) · Activity · Settings.
- Placeholder screens (a `Layout` with a title) in those four files, replaced by nt-7km.3 / .4.

### §8.5 Workout screen `src/screens/workout/` (task nt-7km.3)
FatherWorkout contracts §5 "Load", "Day picker", "Workout view", "Rest timer", "Saving",
built on §8.2 and §8.3. Differences: Finish calls `saveWorkoutSession`, then shows
"Saved · counts toward <date>'s activity" with a link to `/workout/history`; drafts use
`DRAFT_KEY`. The header links to History. Rest timer: countdown banner with −15 s / +15 s and
dismiss, `navigator.vibrate` at zero when available (index.html `startRest` / `extendRest` /
`tickRest`).

### §8.6 History, session, import `src/screens/workouthistory/` (task nt-7km.4)
- History (`index.tsx`): `recent` from `loadWorkoutData()`; each row shows date ·
  `Day N · areas` · `N sets`, and opens `/workout/history/:id`. Links to Import.
- Session (`session.tsx`): read-only view via `getWorkoutSession` (index.html `renderDetail`).
- Import (`import.tsx`): `<input type="file" multiple accept=".json,application/json">`.
  Parse each file with `JSON.parse` (a file holding an array contributes each element), call
  `importWorkoutSessions`, then show the three counts and each invalid file's name and
  errors. Explain where the files are: Google Drive → "FatherWorkout Data" → "sessions",
  download (Drive zips it), unzip, select all.

### §8.7 Routine config file `config/workouts.yaml` (task nt-5ee, added 2026-11-22)

Design: `docs/superpowers/specs/2026-11-22-workout-config-yaml-design.md`. The plan lives in
`config/workouts.yaml`, shared by all users, and is turned into plain data **at build time**.
No YAML parser may reach the app bundle.

File shape (YAML):
```yaml
schemaVersion: 1
days:                      # list order = display order; day numbers unique
  - day: 1                 # positive integer, required
    areas: Chest, Triceps  # non-empty string, required
    exercises:             # list order = display order; non-empty
      - id: d1-dumbbell-press   # required, non-empty, unique across ALL days; never rename once used
        name: Dumbbell Press    # required, non-empty
        warmup: false           # optional boolean, default false
        sets: 3                 # optional; sets/reps/weightLb/timeMin/timeSec: number or null, default null
        reps: 12
        weightLb: 45
        rest: 2 min             # optional; rest/notes: string or null, default null
```

Code:
```ts
// src/lib/routineConfig.ts (pure; no Vite, Node or DOM imports)
export function parseRoutineConfig(data: unknown): Routine;
//   Returns a fully normalised Routine (every RoutineExercise field present, defaults filled,
//   keys in the §8.1 order). Throws Error whose message lists EVERY problem, one per line,
//   each prefixed with a path like `days[0].exercises[2].reps`. Rejects: non-object root,
//   schemaVersion !== 1, unknown keys at any level, wrong types, missing required fields,
//   empty days/exercises lists, duplicate day numbers, duplicate exercise ids.
```
- A Vite plugin (registered in `vite.config.ts`, so Vitest gets it too) handles imports of
  `config/*.yaml`: parse with the `yaml` package, pass through `parseRoutineConfig`, and emit
  `export default <JSON>`. A validation error fails the build/test with the file path and the
  error lines. Changes to the YAML reload in `npm run dev`.
- `src/lib/routine.ts`: `import routineData from '../../config/workouts.yaml'` and
  `export const ROUTINE: Routine = routineData`. A `declare module '*.yaml'` gives the default
  export the type `Routine`.

## §9 Weight trend and suggestions (epic nt-fzp, added 2026-11-22)

Design: `docs/superpowers/specs/2026-11-22-weight-trend-design.md` (the numbers live there;
this section fixes names and shapes). Plan: `docs/superpowers/plans/2026-11-22-weight-trend.md`.

### §9.1 Types (`src/lib/types.ts`)
```ts
export type SuggestionKind = 'calorie' | 'protein' | 'cardio' | 'lifting' | 'logging';
export interface SuggestionRecord {
  id: string;
  kind: SuggestionKind;
  action: 'accepted' | 'snoozed';
  snoozeUntil: string | null;          // YYYY-MM-DD, set when snoozed
  oldAdjustPct: number | null; newAdjustPct: number | null;   // calorie + accepted only
  oldKcal: number | null; newKcal: number | null;
  reason: string | null;
  createdAt: string;                   // ISO timestamp
}
export type NewSuggestionRecord = Omit<SuggestionRecord, 'id' | 'createdAt'>;
export interface WeighIn { date: string; kg: number }
export interface AnalysisDay {
  date: string;
  intakeKcal: number | null;           // null = no food logs that day
  proteinG: number | null;             // null = no food logs that day
  activity: DailyActivity | null;
  workouts: WorkoutHours[];            // completed workouts that day
}
```

### §9.2 `src/lib/weightTrend.ts` (pure)
```ts
export const TREND_SMOOTHING = 0.1;
export const KCAL_PER_LB = 3500;
export const WINDOW_DAYS = 21;
export const AIM_PCT_PER_WEEK: Record<Goal, number>;   // lose_fat −0.75, maintain 0, build_muscle 0.3
export interface TrendPoint { date: string; kg: number | null; trendKg: number }
export interface Rate { kgPerWeek: number; pctPerWeek: number }   // signed; negative = losing
export type RateStatus = 'below' | 'slow' | 'on_track' | 'above';  // below/above = off, sign of pct

/** One point per day from the first weigh-in (or `from`, if later) to `to`, inclusive. Seeds
 *  with the first weigh-in ever; trend += 0.1 × (weight − trend) on weigh-in days, carried
 *  forward otherwise. Weigh-ins may be unsorted. Empty when no weigh-in is on or before `to`. */
export function weightTrend(weighIns: WeighIn[], from: string, to: string): TrendPoint[];
/** Least-squares slope of trendKg per day × 7; pct relative to the last trendKg. null if < 2 points. */
export function weeklyRate(points: TrendPoint[]): Rate | null;
/** Design table; boundaries belong to the band nearer on_track. */
export function classifyRate(goal: Goal, pctPerWeek: number): RateStatus;
```

### §9.3 `src/lib/weightAnalysis.ts` (pure)
```ts
export interface Suggestion {
  kind: SuggestionKind;
  title: string;                 // one short sentence
  reason: string;                // the numbers behind it, plain language
  oldAdjustPct: number; oldKcal: number;                 // always present
  newAdjustPct: number | null; newKcal: number | null;   // calorie only
}
export interface WeightAnalysis {
  status: 'collecting' | RateStatus;
  missing: string[];             // when collecting, e.g. ["8 more days", "weigh in more often"]
  window: { from: string; to: string; days: number; loggedDays: number; weighedDays: number; lowLogDays: number };
  trend: TrendPoint[];           // chart range: today − 55 .. today
  rate: Rate | null;             // over the window
  avgIntakeKcal: number | null; avgEstimatedBurn: number | null; impliedBurn: number | null;
  avgProteinG: number | null; proteinTargetG: number | null;
  suggestions: Suggestion[];     // after snooze/cooldown filtering; empty when records === null
}
export function analyzeWeight(input: {
  profile: Profile;
  today: string;                 // YYYY-MM-DD in profile timezone
  weighIns: WeighIn[];           // all weigh-ins on or before today
  days: AnalysisDay[];           // every date from today − 21 to today − 1 (missing dates = empty days)
  records: SuggestionRecord[] | null;   // null = table unavailable
}): WeightAnalysis;
```

### §9.4 Data (`src/data/api.ts`, `src/data/mappers.ts`)
```ts
export async function loadAnalysisData(today: string):
  Promise<{ profile: Profile; weighIns: WeighIn[]; days: AnalysisDay[] }>;   // throws like loadDay
export async function listSuggestionRecords(): Promise<SuggestionRecord[] | null>; // last 90 days; null on ANY error
export async function recordSuggestion(r: NewSuggestionRecord): Promise<boolean>;  // false on ANY error
export async function acceptCalorieSuggestion(profile: Profile, s: Suggestion): Promise<Profile>;
//   saveProfile({...profile minus userId, overrideKcalAdjustPct: s.newAdjustPct}); then recordSuggestion
//   (accepted, with old/new pct and kcal, reason) — a failed record does not undo or throw.
export async function snoozeSuggestion(kind: SuggestionKind, today: string): Promise<boolean>;  // until today + 7
```
Migration `supabase/migrations/20261122000000_target_suggestions.sql`: table per the design,
`check (action <> 'snoozed' or snooze_until is not null)`, index on (user_id, created_at),
updated_at trigger, the four `_own` policies, `revoke all ... from anon` — same shape as init.

### §9.5 UI
- `src/components/SuggestionCard.tsx`: `<SuggestionCard suggestion onAccept? onSnooze busy? />`. Accept
  button only when `suggestion.kind === 'calorie'`. Exported from `src/components/index.ts`.
- Today: weigh-in row + first suggestion card. Progress (`/progress`, lazy route): chart, window
  numbers, all suggestions, accepted history. Settings: "Set from a suggestion on <date>" under
  the calorie-adjust field when the latest accepted calorie record's `newAdjustPct` equals the
  saved override.
