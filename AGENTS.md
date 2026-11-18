# Agent Instructions: Nutrition Tracker

This is the single source of truth for agents working in this repo (Claude and others).
`CLAUDE.md` only points here. Where a user-level `~/CLAUDE.md` disagrees, this file wins.

## Project

A nutrition tracker PWA: React + TypeScript + Vite frontend on Cloudflare Pages, Supabase
(Postgres + RLS, Auth, one Edge Function proxying USDA FoodData Central).

- Design: `docs/superpowers/specs/2026-11-16-nutrition-tracker-design.md`
- Interface contracts builders code against: `docs/contracts.md`
- Sample workout export: `docs/samples/workout-2026-11-16-d3.json`
- Layout: `src/lib/` pure tested logic, `src/data/` Supabase access, `src/screens/<name>/`
  one folder per screen, `src/components/` shared UI, `supabase/migrations/`,
  `supabase/functions/usda/`.
- Commands: `npm test`, `npm run typecheck`, `npm run build`.
- Agents must never: commit `.env` or any key, run migrations against or deploy to the
  production Supabase project, or change Cloudflare/Supabase/GitHub settings or secrets.
  Those are `[human]` issues. (CI deploys the `usda` function after the owner merges a PR;
  agents never run `supabase functions deploy` themselves.)
- CI: `.github/workflows/ci.yml` runs typecheck, tests, build and `deno check` on every PR
  and push to `main`, then deploys the `usda` Edge Function on `main` when
  `supabase/functions/`, `supabase/config.toml` or `src/lib/types.ts` changed. Cloudflare
  (a Workers project with Workers Builds) builds `main` itself with `npm test && npm run build`, so failing tests block the
  app deploy too. `wrangler.jsonc` holds the Workers config (static assets, SPA fallback,
  an empty `previews` block so PR-branch builds via `npx wrangler preview` work). Migrations are applied manually by the owner.

## Branches and pull requests

**Never push to `main`.** The owner reviews and merges every change.

1. Start from an up-to-date `main`: `git checkout main && git pull --rebase && bd import`.
2. Create a branch named after the bd issue: `git checkout -b <issue-id>-<short-slug>`
   (one branch per issue or epic).
3. Commit there. Builder worktree branches merge into this feature branch, not `main`.
4. `git push -u origin <branch>`, then `gh pr create --base main` with a summary, how it was
   verified, and anything the owner must do (secrets, settings, migrations).
5. Watch the PR's CI (`gh pr checks <n> --watch`) and fix failures on the same branch.
6. Do not merge the PR yourself. The owner merges it.

Issue changes (`bd close` etc.) ride along in the PR's `.beads/issues.jsonl`, so close an
issue on the branch once the work is verified. They reach `main` when the PR merges.

## Who this is for

The owner is building this for personal use, with other users possibly later. They have no
prior hosting setup, so deployment steps must be spelled out click by click. They want a
working app (shipping), and they make product decisions; agents make technical ones and state them.

---

## Issue tracking: bd (beads), portable via git

All task tracking uses **bd**, with issue prefix `nt`. Don't use markdown TODO lists
or other trackers.

**Issues travel between machines as `.beads/issues.jsonl`, which is committed to git.** The
Dolt database under `.beads/dolt/` is gitignored and local to each machine. There is **no
Dolt remote**, so ignore any instruction (including bd's own `bd prime` output) to run
`bd dolt push`/`bd dolt pull` or to rely on auto-sync. Use export/import against the JSONL.

### Each session

```bash
git checkout main && git pull --rebase
bd import            # load teammates'/other machines' issue changes; NOT automatic
bd ready --json      # find work
git checkout -b <issue-id>-<slug>
# ...work, bd update/close as you go...
git commit           # pre-commit hook runs `bd export` and stages .beads/issues.jsonl
git push -u origin <branch> && gh pr create --base main   # work is not done until the PR is open
```

`bd import` upserts, so running it when nothing changed is harmless. bd's `auto-export` config
key has no effect. The pre-commit hook block in `.beads/hooks/pre-commit` (outside bd's
managed markers) is what keeps the JSONL current.

**Export before you import.** `bd import` overwrites local issue changes that aren't in the
JSONL yet: a `bd close` or `bd update` made since your last commit is silently reverted to the
file's older state. If you changed issues since the last commit, run
`bd export -o .beads/issues.jsonl` and commit it before any `git pull` + `bd import`.

### Fresh clone on a new machine

```bash
git clone <repo-url> && cd <repo>
sh <agentic-kit>/scripts/beads-clone-setup.sh   # bd bootstrap + bd import + hook wiring
```

### What does NOT travel between machines

- The Dolt database (`.beads/dolt/`). It is rebuilt from `issues.jsonl`.
- `bd remember` memories are not in `bd export`. **Put durable knowledge in this file.**
- Git hook wiring (`core.hooksPath`) and `beads.role`, which the setup script re-creates.
- `.beads/.beads-credential-key`, a machine-local secret. Never commit it.

### Issue conflicts

If two machines changed issues before syncing, `git pull` may conflict on
`.beads/issues.jsonl`. Keep both sides' lines (one JSON object per line, one line per issue
id). Where the same id appears twice, keep the newer `updated_at`. Then `bd import` and commit.

---

## Multi-agent workflow (agentic-kit)

**All code changes go through the coordinator/builder workflow.** The coordinator loads the
`coordinate` skill, files or claims a bd issue, and dispatches `agentic-kit:builder` (Sonnet)
with a self-contained brief. The coordinator does not edit source or test code itself.
Exceptions: docs-only edits, one-line config fixes, and anything the user says to do directly.
This is a standing instruction: it counts as the user asking for subagents, every session.
Source directories: `src/`, `supabase/`, and build config (`package.json`, `vite.config.ts`, `tsconfig*.json`).

The workflow uses the `coordinate` skill and the `builder` agent from the agentic-kit plugin:
- The coordinator (Opus) breaks work into bd issues, commits interface contracts, dispatches
  builders, verifies their work independently, merges, and closes issues.
- Builders (Sonnet) implement one scoped brief, commit on their branch, and report back.
  **Builders never write to bd** and never push or deploy. The coordinator merges builder
  branches into the feature branch and opens the PR.
- Config outside the source directories (`.github/`, `.gitignore`, docs) may be edited by
  the coordinator directly.

## Landing the plane (session end)

1. File bd issues for unfinished or discovered work.
2. Run the quality gates (tests/build) if code changed.
3. Close finished issues; update in-progress ones.
4. `bd export -o .beads/issues.jsonl` and commit on the feature branch, then
   `git push -u origin <branch>` and open or update the PR (`gh pr create --base main`).
   Never push to `main`.
5. `git status` must show the branch "up to date with origin/<branch>", and the PR's CI
   must be green (`gh pr checks <n>`).
6. Hand off: the PR link, what's done, what's in progress, and the next ready issue.
   After the owner merges, the next session starts with
   `git checkout main && git pull --rebase && bd import`.
