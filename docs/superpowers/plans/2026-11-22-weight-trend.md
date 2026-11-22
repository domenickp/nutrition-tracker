# Weight Trend and Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the coordinator dispatches each task to an `agentic-kit:builder` (AGENTS.md).

**Goal:** Daily weigh-ins on Today, a smoothed weight trend judged against the profile goal, and suggest-only calorie and activity advice, with accepted suggestions and snoozes stored in a new table.

**Architecture:** Pure, tested analysis in `src/lib/` (`weightTrend.ts`, `weightAnalysis.ts`) fed by one range loader in `src/data/api.ts`. Today shows the weigh-in row and the top suggestion; a lazily loaded `/progress` screen shows the chart and details. One migration adds `target_suggestions`; all access to it fails soft.

**Tech Stack:** React 19, react-router-dom 7, TypeScript 7 (`tsc -b`), Vite 8, Vitest 5 (jsdom per file), Supabase JS 2.

**Spec:** `docs/superpowers/specs/2026-11-22-weight-trend-design.md`. Interfaces: `docs/contracts.md` §9 (follow exactly).

## Global Constraints

- No new runtime dependencies; no charting library. Chart is hand-written SVG.
- `/progress` is a lazy route (`React.lazy`); not a nav tab (nav stays Today · Workout · Activity · Settings).
- Dates are `YYYY-MM-DD` in the profile timezone (`todayIn(profile.timezone)`); use `addDays` from `src/lib/dates.ts`.
- Weights display in the profile's units (`formatWeight`, `weightToField`/`weightFromField`).
- 3,500 kcal per lb; trend smoothing 0.1; window 21 days ending yesterday; chart range today − 55 .. today.
- No suggestion changes the target by more than 10 %; none under 3 %; one calorie suggestion per 7 days after an acceptance; "Not now" hides a kind for 7 days.
- Never suggest exercising less.
- Every read/write of `target_suggestions` fails soft; nothing else on Today may break if the table is missing.
- Builders never apply migrations or deploy.

## Review Focus

1. **Metric users:** every weight on Today/Progress/suggestion text in kg; burn math still uses lb internally. → Task 1 test `rate in kg and pct`, Task 4 test `metric profile shows kg`.
2. **No weigh-ins, or only weigh-ins older than the chart range:** status `collecting`, trend still seeded from the old weigh-in, no crash. → Task 1 tests `empty` and `seeds from weigh-in before from`.
3. **Direct-calorie activity days** (`mode: 'direct'`): estimated burn uses `computeTargets` as-is. → Task 2 test `direct mode day burn`.
4. **Table missing before `db push`:** Today still renders weigh-in and trend; Progress shows the unavailable note. → Task 3 tests `list returns null on error`, Task 4 test `records unavailable`.
5. **No override yet** (`overrideKcalAdjustPct` null): old adjust = goal default (−20/0/+10). → Task 2 test `uses goal default when no override`.

---

### Task 1: Trend math (`src/lib/weightTrend.ts`)

**Files:**
- (§9.1 types are already in `src/lib/types.ts`, committed by the coordinator)
- Create: `src/lib/weightTrend.ts`, `src/lib/weightTrend.test.ts`

**Interfaces:**
- Produces: §9.2 `weightTrend`, `weeklyRate`, `classifyRate`, constants.

- [ ] **Step 1: Write failing tests** in `weightTrend.test.ts`:
  - `empty`: `weightTrend([], '2026-11-01', '2026-11-10')` → `[]`.
  - `seeds and smooths`: weigh-ins 100 on 11-01, 90 on 11-02 → points 11-01 `{kg:100,trendKg:100}`, 11-02 `{kg:90,trendKg:99}`; 11-03 (no weigh-in) `{kg:null,trendKg:99}`.
  - `seeds from weigh-in before from`: weigh-in 100 on 10-01, from 11-01 → first point is 11-01 with trendKg 100 (carried), `kg: null`.
  - `unsorted input` gives the same result as sorted.
  - `weeklyRate`: trend falling exactly 0.1 kg/day over 15 points → `kgPerWeek` ≈ −0.7; `pctPerWeek` = −0.7 / last trendKg × 100. One point → `null`.
  - `rate in kg and pct`: values are kg (no lb conversion here).
  - `classifyRate` table, including boundaries:
    - lose_fat: −1.2→below, −1.0→on_track, −0.75→on_track, −0.5→on_track, −0.4→slow, −0.25→slow, −0.2→above, +0.3→above
    - maintain: −0.3→below, −0.25→on_track, 0→on_track, 0.25→on_track, 0.3→above
    - build_muscle: −0.1→below, 0→below, 0.05→slow, 0.1→on_track, 0.5→on_track, 0.6→above
- [ ] **Step 2: Run** `npx vitest run src/lib/weightTrend.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** per §9.2. Slope: ordinary least squares of `trendKg` against day index.
- [ ] **Step 4: Run** the test file → PASS; `npm run typecheck` → no errors.
- [ ] **Step 5: Commit** `nt-fzp: weight trend math`.

### Task 2: Analysis and suggestions (`src/lib/weightAnalysis.ts`)

**Files:**
- Create: `src/lib/weightAnalysis.ts`, `src/lib/weightAnalysis.test.ts`

**Interfaces:**
- Consumes: Task 1; `computeTargets` and `MET` from `src/lib/targets.ts`; `kgToLb` from `src/lib/units.ts`.
- Produces: §9.3 `analyzeWeight`, `Suggestion`, `WeightAnalysis`.

Definitions the tests pin (from the design):
- Window = `today − 21 .. today − 1`, clipped to start at the first date with a weigh-in or food log; `days` = its length.
- Enough data = `days ≥ 14`, `weighedDays ≥ 0.6 × days`, `loggedDays ≥ 0.8 × days`; otherwise `status: 'collecting'` with `missing` entries.
- Per day: weight = trendKg that day; `computeTargets({profile, weightKg, date, activity, workouts})` gives `burn` and `targets.kcal`/`proteinG`. Low-log = logged and `intakeKcal < 0.5 × targets.kcal`.
- `rate = weighInRate(weighIns, window)` (least squares over the actual weigh-ins; the EMA trend lags ~10 days and is for display and per-day weights only). `impliedBurn = avgIntake − kgToLb(rate.kgPerWeek / 7) × 3500`.
- `oldAdjust = profile.overrideKcalAdjustPct ?? goal default`; `aimedIntake = impliedBurn + (kgToLb(AIM pct × trendKg / 100) × 3500 / 7)` (AIM is signed, negative = losing); `newAdjust = round((aimedIntake / avgEstimatedBurn − 1) × 100)`, clamped so `(1+new/100)/(1+old/100)` ∈ [0.9, 1.1]; suggest only if that ratio is ≥ 1.03 or ≤ 0.97. `oldKcal`/`newKcal` = `round(avgEstimatedBurn × (1 + adj/100))`.
- Lifting sessions (last 14 days of the window): a workout with `liftingH > 0` counts 1; a day with `activity.mode === 'hours'` and `liftingH ≥ 0.5` counts 1.
- Cardio session kcal = `(MET.strenuous − 1) × trendKg × 0.5` (30 minutes), rounded to 10.

- [ ] **Step 1: Write failing tests** (build fixtures with a helper that makes N days of constant intake and a linear weight series):
  - `collecting when under 14 days` → status `collecting`, `missing` contains `"N more days"`.
  - `collecting when weighed under 60 %` → `missing` contains `"weigh in more often"`.
  - `implied burn`: 21 days, intake 2000, weight falling 1 lb/week (in kg) → `impliedBurn` ≈ 2500 (±30, trend lag tolerance).
  - `lose_fat too fast → calorie up, never less exercise`: rate below −1 %/wk → a `calorie` suggestion with `newAdjustPct > oldAdjustPct`; no suggestion text contains "less exercise"/"exercise less".
  - `clamped to 10 %` and `no suggestion under 3 %`.
  - `uses goal default when no override` (lose_fat → oldAdjustPct −20).
  - `logging gate`: 3 low-log days → only a `logging` suggestion.
  - `protein`: lose_fat too fast and avg protein < 90 % of target → `protein` suggestion present.
  - `stalled → calorie down and cardio`: lose_fat rate −0.1 → `calorie` (new < old) and `cardio`.
  - `slow → no suggestion` (lose_fat −0.4).
  - `build_muscle lifting`: 2 sessions in 14 days → `lifting` suggestion; 4 sessions → none.
  - `maintain food only`: maintain off-band → only `calorie`.
  - `snoozed kind hidden`: record `{kind:'calorie', action:'snoozed', snoozeUntil: today+3}` → no calorie suggestion; `snoozeUntil: today−1` → shown.
  - `cooldown after accept`: accepted calorie record created 3 days ago → no calorie suggestion.
  - `records unavailable`: `records: null` → `suggestions: []`, status still computed.
  - `direct mode day burn`: a day with `{mode:'direct', directKcal: 600}` contributes `computeTargets` burn including 600.
- [ ] **Step 2: Run** `npx vitest run src/lib/weightAnalysis.test.ts` → FAIL.
- [ ] **Step 3: Implement** `analyzeWeight` per §9.3 and the definitions above. Suggestion `reason` states the numbers (rate per week in profile units, avg intake, implied vs estimated burn).
- [ ] **Step 4: Run** → PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `nt-fzp: weight analysis and suggestions`.

### Task 3: Migration and data layer

**Files:**
- Create: `supabase/migrations/20261122000000_target_suggestions.sql`
- Modify: `src/data/api.ts`, `src/data/mappers.ts`, `src/data/api.test.ts`, `src/data/mappers.test.ts`

**Interfaces:**
- Consumes: §9.1 types (already in `src/lib/types.ts`).
- Produces: §9.4 functions.

- [ ] **Step 1: Write failing tests** (mock `../lib/supabase` the way `api.test.ts` already does):
  - mappers round-trip a `target_suggestions` row ↔ `SuggestionRecord`.
  - `loadAnalysisData('2026-11-22')` queries `food_logs`, `daily_activity`, `workouts` for `2026-11-01..2026-11-21` and `weights` `≤ 2026-11-22`; returns 21 `days` in date order; a date with no food logs has `intakeKcal: null`; sums kcal/protein per date; includes only workouts with `completed_at` not null.
  - `list returns null on error`: supabase error → `null` (no throw). `recordSuggestion` error → `false`.
  - `acceptCalorieSuggestion` saves the profile with the new override, then inserts an `accepted` record; if the insert fails it still resolves with the saved profile.
  - `snoozeSuggestion('calorie','2026-11-22')` inserts `snooze_until: '2026-11-29'`.
- [ ] **Step 2: Run** `npx vitest run src/data` → FAIL.
- [ ] **Step 3: Write the migration** per §9.4 (copy the init migration's trigger/policy/revoke shape for the one table).
- [ ] **Step 4: Implement** §9.4 functions and mappers.
- [ ] **Step 5: Run** `npx vitest run src/data` → PASS; `npm run typecheck`.
- [ ] **Step 6: Commit** `nt-fzp: target_suggestions migration and data layer`.

### Task 4: Today weigh-in, suggestion card, Settings note

**Files:**
- Create: `src/components/SuggestionCard.tsx` (+ export in `src/components/index.ts`), `src/screens/today/WeighIn.tsx`
- Modify: `src/screens/today/index.tsx`, `src/screens/today/today.css`, `src/screens/today/today.test.tsx`, `src/screens/settings/index.tsx`, `src/screens/settings/settings.test.tsx`

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces: `SuggestionCard` (§9.5) used by Task 5.

- [ ] **Step 1: Write failing tests:**
  - Today shows a weight input when there's no weigh-in today; Save calls `addWeight(today, kg)` with the unit-converted value, then shows the saved weight.
  - Today shows "Trend <weight> · <±rate>/wk" and a link to `/progress`.
  - `metric profile shows kg`.
  - With a calorie suggestion: card visible; Accept calls `acceptCalorieSuggestion` and the targets refresh; Not now calls `snoozeSuggestion` and hides the card.
  - `listSuggestionRecords` returning `null` → no card, weigh-in still works, no error message.
  - Settings shows "Set from a suggestion on <date>" when the latest accepted calorie record matches the override; not when it doesn't.
- [ ] **Step 2: Run** `npx vitest run src/screens/today src/screens/settings` → FAIL.
- [ ] **Step 3: Implement.** Today loads `loadAnalysisData` + `listSuggestionRecords` alongside its existing load, but only for the real today (not past `/day/:date` pages); an analysis failure hides the row's trend line instead of erroring the screen.
- [ ] **Step 4: Run** → PASS; full `npm test`; `npm run typecheck`.
- [ ] **Step 5: Commit** `nt-fzp: weigh-in on Today, suggestion card, settings note`.

### Task 5: Progress screen

**Files:**
- Create: `src/screens/progress/index.tsx`, `src/screens/progress/WeightChart.tsx`, `src/screens/progress/progress.css`, `src/screens/progress/progress.test.tsx`
- Modify: `src/App.tsx` (lazy route `/progress` inside `Suspense` with `Spinner`)

**Interfaces:**
- Consumes: Tasks 2–4.

- [ ] **Step 1: Write failing tests:**
  - Renders the chart SVG with one dot per weigh-in in range and one trend path.
  - Shows avg intake, estimated burn, implied burn, protein vs target, days logged/weighed.
  - `collecting` state lists the `missing` items.
  - `records unavailable` → "Suggestions unavailable until the database update is applied."
  - Accepted history lists date, old → new kcal, reason (newest first).
  - Accept / Not now behave as on Today.
- [ ] **Step 2: Run** `npx vitest run src/screens/progress` → FAIL.
- [ ] **Step 3: Implement.** Chart: fixed viewBox, y-range padded around min/max weight, x by date index; axis labels for first/last date and min/max weight in profile units.
- [ ] **Step 4: Run** → PASS; `npm test`; `npm run build` — confirm a separate chunk for the progress screen and main JS not larger than before (567 kB) by more than ~2 kB.
- [ ] **Step 5: Commit** `nt-fzp: progress screen`.

### Task 6 (coordinator): integration, docs, PR

- Integration test in `src/integration.test.ts`: a `target_suggestions` row from the mapper feeds `analyzeWeight` and suppresses the snoozed kind.
- README (Progress paragraph), AGENTS.md layout line, `docs/deploy.md` note that this PR needs `npx supabase db push`.
- PR body states the migration step.
