# Workout routine as a YAML config file (nt-5ee)

**Why.** The owner wants the workout plan (days, exercises, their order and targets) in a
discrete configuration file rather than a TypeScript constant, in a new top-level `config/`
directory. The plan is the same for every user. Users only record what they did; there is no
per-user plan customisation, now or planned.

**Goals**
- `config/workouts.yaml` is the single source of the plan. Editing it and merging a PR is how
  the plan changes.
- A mistake in the file fails `npm run build` and `npm test` with a message naming the field,
  so a broken plan can't deploy.
- The app's behaviour and the `ROUTINE` export are unchanged; no screen or data code changes.

**Non-goals.** Per-user plans, editing the plan in the app, storing the plan in Supabase,
changing the plan's content.

**Anti-goals.** Shipping a YAML parser in the app bundle (the bundle is already over Vite's
size warning, nt-5t0). A loading state or a network request to get the plan.

**Approaches considered**
1. *Build-time (chosen).* A small Vite plugin turns `*.yaml` imports into plain data, after
   validating them. No runtime cost, works offline, and Vitest uses the same plugin.
2. *Fetch the YAML at runtime from `public/`.* Rejected: adds a loading step and an offline
   caching case, and every change goes through a PR and rebuild anyway.
3. *JSON instead of YAML.* Rejected: the owner asked for YAML, which is easier to hand-edit.

**Decided**
- File: `config/workouts.yaml`. Fields as in contracts §8.1; `warmup` defaults to `false`,
  and `sets`, `reps`, `weightLb`, `timeMin`, `timeSec`, `rest`, `notes` default to `null` when
  omitted. Comments at the top explain each field, that list order is display order, and that
  an exercise `id` must never change once used.
- Validation rejects unknown keys, wrong types, missing `id`/`name`/`day`/`areas`, duplicate
  days, and duplicate exercise ids across the whole plan.
- `src/lib/routine.ts` keeps its types, `routineDay` and the `ROUTINE` export.

**Left to the builder.** Plugin internals and file layout within the brief's owned paths.
