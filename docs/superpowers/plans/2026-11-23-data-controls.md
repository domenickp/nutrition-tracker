# Data Controls Implementation Plan

> **For agentic workers:** in this repo the coordinator dispatches each task to an `agentic-kit:builder` (AGENTS.md). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Users can download a backup, delete all their data, and import a backup into an empty account.

**Architecture:** Pure backup logic in `src/lib/backup.ts`; reads via supabase-js; atomic delete and import via two `security invoker` SQL functions; a "Your data" section in Settings.

**Tech Stack:** React 19, TypeScript 7, Vitest 5, Supabase (Postgres, supabase-js 2).

**Spec:** `docs/superpowers/specs/2026-11-23-data-controls-design.md`; interfaces `docs/contracts.md` §10.

## Global Constraints

- No new dependencies. No `supabase` CLI commands against the remote project (the owner applies the migration).
- Delete message text exactly as the design states; owner name from `OWNER_NAME`.
- Delete never runs unless the user typed `DELETE` and the backup download step succeeded.
- Import only into an empty account.

## Review Focus

1. **Backup from before a column existed** (e.g. no `everyday_activity`): import fills the default. → Task 1 test `fills missing columns`.
2. **Import into a different account while the original still exists:** uuids must be new or inserts collide. → Task 1 test `new ids and remapped food_id`.
3. **Food log whose food was deleted** (`food_id` null or unknown): imports with `food_id: null`. → Task 1 test.
4. **Not a backup file / wrong app / newer version:** clear error, nothing sent. → Task 1 `parseBackup` tests; Task 2 UI test.
5. **Account not empty:** Import disabled with the explanation; the server also refuses. → Task 2 test; migration check.

---

### Task 1: Backup logic, data functions, migration (nt-gc4.1)

**Files:** create `src/lib/backup.ts`, `src/lib/backup.test.ts`, `supabase/migrations/20261123000000_data_controls.sql`; modify `src/data/api.ts`, `src/data/api.test.ts`.
**Produces:** contracts §10.1–§10.3.

- [ ] Tests (`backup.test.ts`): `buildBackup strips user_id`; `backupFileName`; `parseBackup` rejects invalid JSON, wrong `app`, `version > 1`, a table that isn't an array, and accepts a file missing some tables (→ `[]`); `countRows`; `new ids and remapped food_id` (two foods, three logs including one pointing to an unknown id → null; all uuid-keyed ids differ from the originals and from each other); `fills missing columns` (profile without `everyday_activity` → `'sedentary'`; row without `created_at` → `now`); workouts, daily_activity, exercise_categories and profiles keep their natural keys.
- [ ] Tests (`api.test.ts`, mocked supabase): `exportMyData` selects `*` from all nine tables; `accountIsEmpty` is true only when every table has no row; `purgeMyData` calls `rpc('purge_my_data')` and throws on error; `importMyData` calls `rpc('import_my_data', { payload })` and returns the count.
- [ ] Implement. `COLUMN_DEFAULTS` must match the column defaults in `supabase/migrations/*.sql` (read them).
- [ ] Migration per the design's "Database functions" section and contracts §10.3. Delete children first (food_logs before foods). Insert parents first (foods before food_logs). `jsonb_populate_recordset(null::public.<table>, payload-><table>)` with `user_id` overridden by `auth.uid()`.
- [ ] `npx vitest run src/lib/backup.test.ts src/data`, `npm run typecheck`, `npm test` pass. Commit.

### Task 2: Settings "Your data" (nt-gc4.2)

**Files:** create `src/lib/appInfo.ts`, `src/screens/settings/YourData.tsx`; modify `src/screens/settings/index.tsx`, `settings.test.tsx`, `settings.module.css`.
**Consumes:** Task 1.

- [ ] Tests: Download builds and saves a file named by `backupFileName`; the Delete button is disabled until `DELETE` is typed; delete runs export → download → `purgeMyData` in that order and shows the exact message with "Domenick"; if export fails, `purgeMyData` is not called; the workout draft key `nt-workout-draft` is removed from localStorage; Import is disabled with the explanation when `accountIsEmpty()` is false; a bad file shows the parse errors; a good file shows counts, then Import calls `importMyData` with prepared rows and shows "Imported N items."
- [ ] Implement. After OK on the delete message and after an import, make the app re-check the profile (navigate to `/settings` so App's profile check reruns).
- [ ] `npx vitest run src/screens/settings`, `npm run typecheck`, `npm test`, `npm run build` pass. Commit.

### Task 3 (coordinator, nt-gc4.3)

README user guide, `docs/development.md`, deploy.md Step 8 pointer, PR with "apply the migration before merging" and a test-account checklist.
