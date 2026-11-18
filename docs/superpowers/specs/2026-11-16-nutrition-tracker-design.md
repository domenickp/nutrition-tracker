# Nutrition Tracker — Design

Date: 2026-11-16
Status: Draft, owner decisions incorporated, pending final approval

## Intent

A personal nutrition tracker. Each day has targets for calories, protein, carbs, fat
and water. The owner logs what they eat and drink, and the app shows how much of each
target remains. Daily activity raises the calorie target. Activity can be entered as
calories directly, as hours in four categories, or by importing workout JSON exported
from the owner's separate workout-logging app.

It is built for one user (the owner) today. It must be structured so other people can
use it later without a data migration.

## Goals

1. Show today's remaining calories, protein, carbs, fat and water at a glance.
2. Make logging fast: saved foods first, then USDA search, then manual macro entry.
3. Turn a pasted or uploaded workout JSON file into activity calories with no manual math.
4. Produce targets from the owner's profile and goal, and let any target be overridden.
5. Run as a hosted web app, installable on a phone home screen (PWA).

## Non-goals (for this build)

- Public sign-up, sharing, or social features. Accounts exist, but only the owner signs in.
- Barcode scanning, micronutrients, meal planning, recipes built from several foods.
- Automatic sync from Google Drive or the workout app. Import is paste or upload only.
- Native mobile apps; full offline mode. Installable PWA shell only.
- Charts and history analytics beyond viewing a past day.

## Anti-goals (failure even if it "works")

- Any user can read or change another user's data.
- Editing a saved food silently changes calories already logged on past days.
- A workout imported twice is counted twice.
- A late-evening workout lands on the wrong day because of UTC.
- The USDA API key is shipped to the browser.
- Presenting targets as medical advice. Show them as estimates.

## Constraints

- Owner has no existing hosting. Use free tiers: GitHub (repo), Cloudflare Pages
  (static frontend), Supabase (Postgres, auth, Edge Functions).
- USDA FoodData Central requires an API key (free, from api.data.gov). It is kept as a
  Supabase Edge Function secret.
- Units: imperial by default (lb, in, fl oz), because the workout app records lb.
  A metric toggle in settings. Store everything in metric internally (kg, cm, ml, g).

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| A. Static app + browser storage | Free and simplest, but no cross-device sync, data lost if browser data is cleared, no path to multi-user | Rejected |
| **B. Static app + Supabase** | Real Postgres, built-in auth and row-level security, Edge Functions for the USDA proxy, free tier | **Chosen by owner** |
| C. Cloudflare Pages + Workers + D1 | Cheap, single platform, but auth and API are hand-built | Rejected |
| D. Next.js on Vercel + Postgres | More framework than a single-user app needs | Rejected |

## Stack (builder's call, stated here)

- React + TypeScript + Vite, PWA via `vite-plugin-pwa`.
- `@supabase/supabase-js` called directly from the client; access controlled by RLS.
- One Supabase Edge Function (Deno) for USDA search and detail lookups.
- Vitest for unit tests on calculation and import logic.
- Hosting: Cloudflare Pages, deployed from the GitHub repo's `main` branch.

## Data model

Every user-owned table has `user_id uuid not null references auth.users` and an RLS
policy limiting select, insert, update and delete to `auth.uid() = user_id`.

- **profiles**: `user_id` (PK), `birth_month` (1–12), `birth_year`, `sex`
  (`male`/`female`, used for the BMR formula), `height_cm`, `goal`
  (`lose_fat`/`maintain`/`build_muscle`), `units` (`imperial`/`metric`), `timezone`
  (IANA name, defaulted from the browser), and **rule overrides**, all nullable:
  `override_kcal_adjust_pct` (e.g. −15 replaces the goal's −20), `override_protein_g_per_lb`,
  `override_fat_pct`, `override_water_base_ml_per_kg`. Overrides change the *rules*, not
  the resulting numbers, so targets still move with activity and weight. Carbs are never
  overridden; they always fill the remaining calories. *(Owner decision.)*
- **weights**: `id`, `user_id`, `date`, `weight_kg`. The weight for a day is the most
  recent entry on or before that date. Logged occasionally, not daily.
- **foods**: the user's saved foods. Flexible portions *(owner decision)*. `id`,
  `user_id`, `name`, `brand` (nullable), `source` (`manual`/`usda`), `fdc_id`
  (nullable), `last_used_at`, and:
  - a **base serving**: `base_label` (e.g. `100 g`, `1 bar`), `base_grams` (nullable),
    and nutrients for that base serving: `kcal`, `protein_g`, `carbs_g`, `fat_g`,
    `water_ml` (default 0, for drinks).
  - `portions` jsonb: `[{ "label": "1 cup", "grams": 240 }, …]`, which may be empty.
  - USDA Foundation/SR Legacy: base = `100 g` / 100, portions from `foodPortions`.
    USDA Branded: base = the label serving. `base_grams` is set when the unit is `g`,
    and stays null for `ml` (logging then works in servings only). Manual foods: the base
    serving the owner typed, with optional grams, and the owner can add portions.
  - When `base_grams` is known, any amount in grams or any portion converts by ratio.
    When it isn't, only "× base serving" is available.
  - Unique on (`user_id`, `fdc_id`) where `fdc_id` is not null.
- **food_logs**: `id`, `user_id`, `date`, `logged_at`, `food_id` (nullable, set null on
  delete), `name`, the amount as entered (`quantity` numeric, `unit_label` such as
  `servings`, `g` or `1 cup`, and `grams` nullable), and a **snapshot of the entry's
  totals**: `kcal`, `protein_g`, `carbs_g`, `fat_g`, `water_ml`. Day totals sum the
  snapshots, so editing or deleting a saved food never changes history. Editing a log's
  amount recomputes from the saved food if it still exists. Otherwise it scales the
  snapshot by the ratio of new to old quantity.
- **water_logs**: `id`, `user_id`, `date`, `logged_at`, `ml`.
- **daily_activity**: `user_id`, `date` (PK together), `mode`
  (`direct`/`hours`), `direct_kcal` (nullable), `sedentary_h`, `light_cardio_h`,
  `strenuous_cardio_h`, `lifting_h` (numeric, default 0).
- **workouts**: imported workout files. `id` (the workout's own `id` from the JSON),
  `user_id`, `date`, `started_at`, `completed_at`, `raw` (jsonb), and the derived
  `light_cardio_h`, `strenuous_cardio_h`, `lifting_h`. Primary key (`user_id`, `id`), so
  re-importing the same workout is detected rather than double-counted.
- **exercise_categories**: `user_id`, `exercise_id` (PK together), `name`, `category`
  (`light_cardio`/`strenuous_cardio`/`lifting`). Remembers how the owner classified each
  exercise.

"Date" everywhere means the calendar date in the profile's `timezone`.

## Target calculation

All in one pure TypeScript module with unit tests.

1. **Age** from birth month/year and the day being viewed (whole years).
2. **BMR** (Mifflin-St Jeor), weight kg, height cm:
   male `10w + 6.25h − 5a + 5`, female `10w + 6.25h − 5a − 161`.
3. **Activity calories** for the day:
   - `direct` mode: `direct_kcal`, read as *all* active calories for the day, like a
     fitness watch's "active calories" figure. It replaces everything else: no
     sedentary baseline, and imported workouts for that day are listed but not counted
     toward calories. *(Builder-check call.)*
   - A day with no `daily_activity` row is `hours` mode with all hours 0, which gives
     the 16 h sedentary default below. Importing a workout into a `direct`-mode day
     leaves the mode alone; the Activity screen notes that the workout isn't counted.
   - `hours` mode: `Σ (MET − 1) × weight_kg × hours` per category, with METs
     sedentary 1.3, light cardio 4.0, strenuous cardio 8.0, lifting 5.0. Subtracting 1
     avoids counting resting burn twice, since BMR already covers it.
   - Hours from imported workouts for that day are **added** to the manually entered
     hours for light cardio, strenuous cardio and lifting.
   - If `sedentary_h` is 0 or unset, it defaults to `16 − (exercise hours)`, floored at 0.
     (16 waking hours.)
   - If `sedentary_h` is entered (> 0), the hours of that day's logged or imported workouts
     are subtracted from it, floored at 0, so a fixed "16" never double-counts workout time.
     Manually entered exercise hours are not subtracted: the owner accounts for those when
     entering sedentary hours. *(Owner request, 2026-11-18.)*
4. **Burn** = `BMR × 1.1 + activity calories`. The 1.1 factor covers the energy used
   digesting food.
5. **Calorie target** by goal: lose fat `burn × 0.80`, maintain `burn`, build muscle
   `burn × 1.10`.
6. **Protein**: lose fat 1.0 g/lb, maintain 0.8 g/lb, build muscle 1.0 g/lb body weight.
7. **Fat**: lose fat 25%, maintain 30%, build muscle 25% of calorie target, ÷ 9.
8. **Carbs**: remaining calories ÷ 4, floored at 0.
9. **Water**: `0.5 fl oz × body weight lb` + `12 fl oz per 30 min` of exercise hours
   (light + strenuous + lifting). Exercise hours come from manual hours plus imported
   workouts in both modes, so water still rises in `direct` mode when a workout is
   imported.
10. Any non-null rule override in `profiles` replaces that rule's default: the
    calorie adjustment % (step 5), protein g/lb (step 6), fat % (step 7), or the
    water base (step 9, stored per kg and shown per lb in imperial). The order stays
    as listed: calories, then protein, then fat, then carbs as the remainder.

The settings and day screens label all targets as estimates.

## Workout import

Input: pasted JSON text or an uploaded `.json` file, containing one workout object
(`schemaVersion: 1`) or an array of them. Example fields: `id`, `startedAt`,
`completedAt`, `entries[]` with `exerciseId`, `name`, and `sets[]` holding `reps`,
`weightLb`, `timeMin`, `timeSec`, `done`.

A real export is committed at `docs/samples/workout-2026-11-16-d3.json` and is the
reference for the parser and its tests. In it, unused set fields (`reps`, `weightLb`,
`timeMin`, `timeSec`) are present and `null`. The parser also accepts missing or `0`
as "unused". Top level: `id`, `day`, `schemaVersion`, `startedAt`, `completedAt`,
`savedAt`, `notes`, `entries[]`. Exercise ids are prefixed by program day (`d3-…`), so
the same movement can have a different id on another day.

Processing, as a pure, tested function plus a review screen:

1. Validate the shape; reject unknown `schemaVersion` with a clear message. If
   `completedAt` is missing, use `savedAt`; if both are missing, lifting time is 0 and
   the review screen asks for a duration. *(Builder-check call.)*
2. **Date**: the calendar date of `startedAt` in the profile timezone. Example:
   `2026-11-16T01:59Z` is Nov 15 in America/New_York.
3. Only sets with `done: true` count.
4. **Classify each exercise.** Use the saved `exercise_categories` entry for the
   `exerciseId` if there is one, or else a saved entry with the same name
   (case-insensitive, ignoring a `Warm Up:` prefix). *(Builder-check call.)* Otherwise guess.
   With the sample, the guess gives: stationary bike = light cardio (40 min);
   everything else = lifting; lifting time ≈ 77 − 40 = 37 min. An entry where every done set has time and no reps and no weight,
   and whose name matches a cardio keyword (bike, cycle, run, jog, treadmill,
   elliptical, rower, row machine, walk, swim, stair, jump rope), is light cardio.
   Everything else is lifting, including timed bodyweight holds such as dead hangs. The
   review screen shows the guesses, lets the owner change them, and saves the choices
   to `exercise_categories`.
5. **Durations**: cardio time per exercise = sum of `timeMin×60 + timeSec` over done
   sets. Lifting time = `(completedAt − startedAt) − total cardio time`, floored at 0.
   This is the time for the whole session, rests included.
6. If (`user_id`, `id`) already exists, show "already imported" and offer to replace it.
7. Save to `workouts`; that day's activity totals update.

## USDA FoodData Central

- Edge Function `usda` with two operations: `search?q=` (calls `/v1/foods/search`,
  data types Foundation, SR Legacy, Branded; page size 25) and `food?fdcId=` (calls
  `/v1/food/{id}`). It requires a signed-in user (Supabase JWT) and reads the key from a
  secret `USDA_API_KEY`.
- Map nutrients: energy kcal (nutrient number 208), protein (203), fat (204), carbs (205).
- The function returns a normalized shape matching `foods` (base serving, base grams,
  nutrients, portions), so the client never handles raw USDA formats.
  Foundation/SR Legacy: per 100 g, plus `foodPortions` turned into `{label, grams}`.
  Branded: the `servingSize`/`servingSizeUnit` label serving, using `labelNutrients`
  when present.
- Choosing a USDA result saves it to `foods` (`source: usda`, deduplicated by
  `fdc_id`), then logs it.

## Screens

1. **Today** (home): a date switcher (previous/next day). Remaining vs target for
   calories, protein, carbs, fat, water, shown as progress bars. A list of logged foods
   (delete or edit servings), water quick-add buttons (8, 12, 16 fl oz, custom), and an
   activity summary with a link to edit.
2. **Add food**: one search box. Saved foods appear first, sorted by `last_used_at`,
   then USDA results. A "manual entry" form asks for name, serving, kcal, P/C/F and
   optional water and grams, and saves the food. Then the owner sets an amount: a
   quantity plus a unit picker listing the base serving, each portion, and `g` (when
   grams are known). A live preview shows the entry's calories and macros before
   logging.
3. **Activity** (per day): choose direct kcal or hours; four hour inputs; a list of
   imported workouts for the day; "Import workout" (paste box + file picker) leading to
   the review screen.
4. **Settings**: birth month/year, sex, height, goal, units, timezone, current weight
   (adds a `weights` entry), rule overrides (each showing its default), sign out.

## Auth and multi-user readiness

- Supabase Auth by email, sending both a magic link and a 6-digit code. On iOS an
  installed PWA doesn't share sign-in with Safari, so the code is how you sign in
  there. *(Builder-check call.)* Public sign-up is disabled in the Supabase
  dashboard for now; the owner's account is created by invite.
- The first sign-in with no `profiles` row leads to the Settings screen to fill it in.
- Nothing in the code assumes a single user. All queries are scoped by RLS. Enabling
  sign-up later is a dashboard setting change, not a code change.

## Deployment

- GitHub repo under the owner's account. The owner creates the GitHub, Cloudflare and
  Supabase accounts and gets a USDA API key. The builder provides step-by-step
  instructions in the README.
- Database schema as SQL migrations in `supabase/migrations/`, applied with the Supabase CLI.
- Cloudflare Pages builds `npm run build` from `main`, with env vars
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Left to the builder

- Component structure, styling, state management, routing library.
- Exact PWA icons and manifest details.
- Error and loading states, as long as failures are visible and never lose input.
- Test coverage beyond the required unit tests for target calculation, portion/amount
  conversion, workout
  parsing/classification, and USDA nutrient mapping.
