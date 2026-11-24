# Data controls: backup, delete, import (epic nt-gc4)

## Why

A friend (Android) is starting to use the app, maybe a couple more people later. The owner
accepts that, as the database administrator, they can see users' data. In return, each
user should be able to take all their data with them and remove it from the app whenever
they want, and bring it back if they return. Account creation and removal stay manual: the
owner adds and removes users in Supabase.

## Goals

- **Download backup**: one JSON file with every row the user owns, in every table.
- **Delete all my data**: removes every row the user owns, in one all-or-nothing step.
- **Import backup**: restores a backup into an empty account, in one all-or-nothing step,
  including into a different account than the one it came from.
- A user guide in the README, separate from the deploy and development docs.

## Non-goals

- Deleting the sign-in account (owner does it by hand; automation was offered and declined
  for now).
- Merging a backup into an account that already has data.
- Scheduled or automatic backups.

## Anti-goals

- Partial deletes or partial imports. Either everything changes or nothing does.
- Losing data by accident: delete needs a typed confirmation and downloads a backup first.
- A function that can touch another user's rows.

## Approaches (owner's choice)

1. *Two database functions (chosen).* `purge_my_data()` and `import_my_data(jsonb)` run as
   the signed-in user (`security invoker`, so row-level security still applies) inside one
   transaction each. Needs one migration, applied by the owner **before** merging (the
   functions are additive; old app versions ignore them).
2. *Step by step from the app.* No migration, but a dropped connection could leave data
   half deleted or half imported. Rejected.

## Decided

### Where
Settings gets a **Your data** section at the bottom with three buttons: Download backup,
Import backup, Delete all my data.

### Backup file
- Name `nutrition-tracker-backup-YYYY-MM-DD.json` (date in the profile timezone, or the
  browser's when there is no profile).
- Shape: `{ "app": "nutrition-tracker", "version": 1, "exportedAt": "<ISO>", "tables": { "<table>": [rows...] } }`.
- Tables: profiles, weights, foods, food_logs, water_logs, daily_activity, workouts,
  exercise_categories, target_suggestions. Rows are the database rows as the API returns
  them (snake_case columns), without `user_id`.
- Export reads the tables from the app (read-only, no function needed).

### Delete all my data
- The user types `DELETE` to enable the button.
- The app first downloads a backup (same as Download backup); if that fails, nothing is
  deleted.
- Then it calls `purge_my_data()`, clears the on-device workout draft, and shows this
  message (owner's wording, owner name from one constant):

  > All your data has been deleted. Your account is still active, so you can start using
  > the app again at any time without asking anyone. Keeping the account doesn't keep any
  > data. If you'd like your account removed as well, ask Domenick.

- The message has an OK button; after it, the app goes to Settings like a new user
  (profile missing).

### Import backup
- Shown enabled only when the account has no data (no profile and no rows in the other
  tables). Otherwise it explains "Import only works on an empty account. Delete your data
  first."
- The user picks a file; the app checks it (app name, version ≤ supported, tables are
  arrays) and shows the counts per table, then **Import** runs `import_my_data`.
- The app prepares rows before sending them: new ids for tables keyed by a generated uuid
  (weights, foods, food_logs, water_logs, target_suggestions), `food_logs.food_id` remapped
  to the new food ids (unknown ids become null), `user_id` removed, and every column present
  (missing columns get the column's default, so older backups still import after columns are
  added).
- The function refuses if the account has any rows, sets `user_id = auth.uid()` on every
  insert, and inserts all tables in one transaction.
- Afterwards the app reloads the profile and shows "Imported N items."

### Database functions (migration `20261123000000_data_controls.sql`)
- `public.purge_my_data() returns void`, `security invoker`, `set search_path = public`:
  deletes the caller's rows from all nine tables (`where user_id = auth.uid()`), children
  first. Raises if `auth.uid()` is null.
- `public.import_my_data(payload jsonb) returns integer` (rows inserted), same settings:
  raises `'account not empty'` if the caller owns any row in the nine tables; inserts each
  table's array with `jsonb_populate_recordset`, overriding `user_id` with `auth.uid()`.
- `revoke all ... from public, anon; grant execute ... to authenticated`.

### User guide
README becomes the user guide: what the app does, getting an account ("ask the owner to add
you"), installing on iPhone (Safari → Share → Add to Home Screen) and Android (Chrome →
menu → Install app / Add to Home screen), signing in with the 6-digit code, daily use (Today,
Add food, Workout, Activity, Progress, Settings), and backups/deleting data. Development
and project layout move to `docs/development.md`; deploy stays in `docs/deploy.md` (Step 8's
phone steps point to the README). Both are linked from a short "Running your own copy"
section.

## Constraints

- No new dependencies. Pure, tested preparation logic in `src/lib/`.
- The SQL can't run in CI (no local database), so it stays small, and the owner verifies it
  once on a test account after applying the migration.

## Left to the builder

Component layout, file-picker handling, exact wording other than the delete message.
