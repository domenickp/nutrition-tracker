# Workout tab (FatherWorkout merged in) — Design

Date: 2026-11-18
Status: Approved by owner ("Let's build it", after the evaluation in conversation)

## Why

The owner tracks lifting in FatherWorkout, a separate Google Apps Script app that saves one
JSON file per workout in Google Drive. To count a workout toward nutrition targets they export
that file and paste it into Activity → Import. Merging the tracker into this app removes that
step and keeps all their data in one place. No one else uses FatherWorkout.

## Goals

1. A **Workout** tab that does what FatherWorkout does: pick a day of the 4-day routine (next
   day suggested), log sets with last time's numbers prefilled, rest timer, notes, resume an
   unfinished workout, finish, and browse history.
2. Finishing a workout saves it to Supabase and **counts toward that day's activity
   automatically**, exactly as an imported workout does today.
3. Import the owner's existing FatherWorkout session files in one go.

## Non-goals

- Per-person or editable routines (the routine stays bundled, as in FatherWorkout).
- Analytics or charts.
- Metric weights in the workout logger (FatherWorkout is lb-only; kept as is).
- Editing or deleting past sessions from history (Activity already can delete a workout).
- Retiring FatherWorkout itself; the owner keeps it until the tab works.

## Approaches considered

| Option | Trade-off | Decision |
|---|---|---|
| New `workout_sessions` table | Clean separation, but needs a migration the owner runs by hand, and duplicates the session already stored in `workouts.raw` | No |
| **Reuse the existing `workouts` table** | It already stores the full session JSON (`raw`) keyed by the session's own id, plus date and activity hours. No migration; imported and newly logged sessions are the same rows | **Chosen** (coordinator's call) |
| Keep FatherWorkout, add a Drive sync | Two apps, Google OAuth in this app | No |

## Design

- **Routine:** FatherWorkout's `data/routine.json` bundled as `src/lib/routine.ts`.
- **Logic:** FatherWorkout's `Lib.js` and the pure `FW` helpers in its `index.html` ported to
  TypeScript in `src/lib/workoutSession.ts`, same behaviour, with their tests ported too.
- **Storage:** a finished session is upserted into `workouts` (`raw` = the session) with date
  and hours from the existing `analyzeWorkout` / `summarizeWorkout`, using the profile time
  zone and saved exercise rules, then `saveExerciseRules(rulesFromAnalysis(...))`, the same
  path as Activity → Import. "Completed" for the workout tab means `raw.completedAt` is set.
- **Drafts:** an in-progress workout lives only in `localStorage` (key `nt-workout-draft`), as
  in FatherWorkout, and is offered for resume on return. Nothing reaches the database until
  Finish.
- **Import:** a Workout → Import screen takes many `.json` files at once (the unzipped Drive
  `FatherWorkout Data/sessions` folder). Each is validated structurally (not against the
  current routine, so old sessions still import), and saved with `replace = false`, so
  re-importing is harmless. The screen reports imported / already there / invalid.
- **Navigation:** bottom nav becomes Today · Workout · Activity · Settings. Routes
  `/workout`, `/workout/history`, `/workout/history/:id`, `/workout/import`.
- **Look:** the app's existing components and tokens, not FatherWorkout's CSS. 360 px wide
  with no horizontal scroll, tap targets ≥ 44 px, light/dark.

## Left to the builders

Exact layout of the workout and history screens, stepper styling, and how the rest timer
banner looks, within contracts §8.
