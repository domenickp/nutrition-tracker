# Weight trend and goal-based suggestions (epic nt-fzp)

## Why

The owner is losing weight (about a pound over the first 5 logged days) and wants to know
why, and to tune food and activity from real results rather than the formula alone. The
app already estimates burn (Mifflin-St Jeor × 1.1 digestion + MET-based activity) and sets
the calorie target from the goal setting (lose fat −20 %, maintain 0 %, build muscle +10 %),
but it never checks that estimate against what the scale does. This feature closes that loop.

The goal setting in Settings (`profiles.goal`) is the reference for everything here. There
is no separate target weight or target date.

## Goals

- Make daily weigh-ins quick (on Today) so a trend exists.
- Show a smoothed weight trend that ignores day-to-day water swings.
- Compare the trend's rate with the rate the goal expects, and say plainly whether it's on track.
- When it's off, **suggest** (never apply on its own) a new calorie target based on the burn
  the data implies, and give goal-specific activity advice.
- Keep a record of accepted suggestions and snoozes that follows the user across devices.

## Non-goals

- Automatic target changes (owner chose suggest-only).
- Target weight or target date settings.
- Proposing a workout calendar (which day to lift or do cardio).
- Body-fat %, measurements, photos, or importing scale data from other apps.
- Changing the protein, fat or water formulas.

## Anti-goals (a failure even if it works)

- Reacting to single-day weights. Every judgement uses the trend.
- Suggesting a change from too little or badly logged data. Missing food logs look exactly
  like a high burn; the app must say "log more" before it says "eat more".
- Big swings: no suggestion changes the target by more than about 10 %.
- Telling a user losing too fast to exercise less. The fix offered is eating more.
- A charting library in the bundle (the main JS is already over Vite's warning, nt-5t0).

## Approaches considered

**Where the analysis runs.** In the app, as pure tested logic in `src/lib/`, from the existing
tables. A database view or Edge Function would add deploy steps and split logic across two
languages for no gain at one user's data size. One sensible way; not a choice put to the owner.

**Where accepted suggestions and snoozes live** (owner's choice):
1. *New table `target_suggestions` (chosen).* Syncs across devices, keeps history. Costs one
   migration the owner applies with `npx supabase db push`.
2. *Device-only storage.* No migration, but snoozes don't sync and there is no history.

**What the app does with the implied burn** (owner's choice):
1. *Suggest only (chosen).* Accepting writes `profiles.override_kcal_adjust_pct`.
2. *Auto-adjust weekly.* Rejected: opaque, and bad logging days push it the wrong way.
3. *Trend only.* Rejected: does no tuning.

## Decided

### Weigh-in

- Today gets a weigh-in row near the top: shows today's weight if entered, otherwise an
  input with Save. Writes the existing `weights` table (one row per date, upsert) via the
  existing `addWeight`. Units follow `profiles.units`.
- The row also shows the trend weight and weekly rate with an on-track mark, and links to
  `/progress`.
- Settings keeps its weight field unchanged.

### Trend (coordinator's call, flagged for the owner)

- Exponentially smoothed moving average over daily weigh-ins, smoothing 0.1 per day
  (the "Hacker's Diet" trend). Days without a weigh-in carry the trend forward.
- The trend is for display (chart, Today) and per-day weights. The weekly rate used for
  judgements is a least-squares line through the actual weigh-ins in the analysis window,
  because the smoothed trend lags about 10 days and would understate a new rate
  (coordinator's call during build). Shown in lb (or kg) per week and % of body weight per week.

### Expected rate per goal (coordinator's call, flagged for the owner)

Rates are signed % of body weight per week (negative = losing). The bands are contiguous:

| Goal | Off: suggest | Slow: status only, no suggestion | On track | Off: suggest |
|---|---|---|---|---|
| lose_fat | > −0.25 (stalled or gaining) | −0.5 to −0.25 | −1.0 to −0.5 | < −1.0 (too fast) |
| maintain | < −0.25 (losing) | — | −0.25 to +0.25 | > +0.25 (gaining) |
| build_muscle | ≤ 0 (not gaining) | 0 to +0.1 | +0.1 to +0.5 | > +0.5 (too fast) |

"Slow" shows a neutral status ("a little slower than your goal aims") and no calorie
suggestion; slow but real progress isn't worth nagging about (coordinator's call). Boundary
values belong to the band nearer on-track. The midpoint of the "on track" band is the aim
used to size a calorie suggestion.

### Analysis window and data sufficiency

- Window: the most recent 21 days (fewer if less history), ending yesterday (today's food
  log is incomplete).
- Enough data = at least 14 days in the window, weigh-ins on at least 60 % of them, and food
  logged on at least 80 % of them. Before that, show "collecting data" with what's missing
  ("8 more days", "weigh in more often").
- A **logged day** has at least one food log. Days with none are not logged: they count
  against the 80 % rule and are left out of average intake.
- A **low-log day** is a logged day whose kcal is under 50 % of that day's target,
  recomputed with the current profile (no target history is stored). If 3 or more days in
  the window are low-log, the only message is to log more completely; no calorie suggestion
  is made. (Counting rules are the coordinator's call.)

### Implied burn and the calorie suggestion

- Average intake = mean logged kcal over logged days in the window.
- Implied burn per day = average intake − (weekly rate in lb ÷ 7 × 3,500).
- Estimated burn per day = mean of `computeTargets(...).burn` for each day in the window,
  using that day's weight trend value, activity and workouts.
- Aimed intake = implied burn − (aimed weekly rate in lb × 3,500 / 7). For maintain the aim is 0.
- Suggested `override_kcal_adjust_pct` = (aimed intake ÷ average estimated burn − 1) × 100,
  rounded to a whole number, and limited so the resulting target moves no more than 10 % from
  the current one.
- Only suggest when the change is at least 3 % (avoid nagging).
- Accepting writes the override on the profile (existing `saveProfile`) and records the
  acceptance. Settings' calorie-adjustment field shows "set from a suggestion on <date>"
  when the latest accepted record matches the current value.
- At most one calorie suggestion per 7 days: after an acceptance, no new calorie suggestion
  for 7 days (the trend needs time to respond).

### Activity and food advice (no Accept button; "Not now" only)

| Goal / situation | Advice |
|---|---|
| lose_fat, too fast | The calorie suggestion is to eat more. Never "exercise less". If average protein < 90 % of target, add "raise protein to keep muscle". |
| lose_fat, stalled or gaining | The calorie suggestion is a deeper cut, shown alongside "or add 1–2 cardio sessions a week" (about 300 kcal each at current weight, computed with the MET table). The owner picks; only the calorie one is acceptable in-app. |
| build_muscle, any time | If completed lifting sessions in the last 14 days average fewer than 2 a week (Workout tab sessions plus manual lifting hours ≥ 0.5 h on a day), flag "gaining without lifting is mostly fat". |
| maintain | Food only. |

### "Not now"

Hides that suggestion kind for 7 days. Kinds: `calorie`, `protein`, `cardio`, `lifting`, `logging`.

### Progress screen `/progress`

- Linked from Today's weigh-in row; not a nav tab (nav stays at four).
- Loaded on demand (route-level lazy import).
- Weight chart: daily weigh-ins as dots, trend as a line, last 8 weeks, hand-drawn SVG.
- This window: average intake, average estimated burn, implied burn, protein vs target,
  days logged / weighed.
- The current suggestion(s) with the full reasoning and the same Accept / Not now.
- History of accepted suggestions (date, old → new target, reason).

### Data

New migration adding `public.target_suggestions`:

| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| user_id | uuid not null default auth.uid() → auth.users on delete cascade | |
| kind | text not null check in (calorie, protein, cardio, lifting, logging) | |
| action | text not null check in (accepted, snoozed) | |
| snooze_until | date | required when snoozed |
| old_adjust_pct, new_adjust_pct | numeric | calorie + accepted only |
| old_kcal, new_kcal | integer | the target on the day accepted, for display |
| reason | text | the explanation shown at the time |
| created_at, updated_at | timestamptz default now() | |

Row-level security and grants exactly as the other user tables in the init migration.
The owner runs `npx supabase db push` after merging; the PR must say so.

**Before the migration is applied** (Cloudflare deploys on merge; the owner applies the
migration by hand afterwards): reads and writes of `target_suggestions` fail soft. Weigh-in,
trend, chart and status still work; suggestions are hidden and Progress shows "suggestions
unavailable until the database update is applied". Nothing else on Today may break
(coordinator's call).

## Constraints

- React 19 / Vite 8 / TypeScript 7 / Vitest; pure logic in `src/lib/` with unit tests, data
  access in `src/data/`, screens in `src/screens/<name>/`.
- Dates are local dates in the profile timezone, as elsewhere.
- No new runtime dependencies.
- Builders never apply migrations; the owner does.

## Left to the builder

Module layout, component structure, chart drawing details, exact wording of messages
(plain and short), loading states, and test fixtures.
