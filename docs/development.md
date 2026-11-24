# Development

Notes for working on the code. Using the app is covered in the [README](../README.md); hosting your own copy is in [deploy.md](deploy.md).

## Stack

- React + TypeScript + Vite, installable as a PWA, hosted on Cloudflare Workers (static assets)
- Supabase: Postgres with row-level security, email sign-in, and one Edge Function (`usda`)
  that proxies USDA searches so the API key stays on the server

## Hosting

Follow **[deploy.md](deploy.md)**. It walks through every account and setting,
including CI/CD (GitHub Actions checks every PR and deploys the USDA function after merge).

## Commands

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL and anon key
npm run dev                  # http://localhost:5173
npm test                     # unit tests (Vitest)
npm run typecheck
npm run build
```

## Project layout

| Path | What's there |
|---|---|
| `config/workouts.yaml` | The workout plan (days, exercises, order, targets), shared by all users. Edit it and open a PR to change the plan; a mistake fails the build |
| `build/` | Build-time Vite plugin that reads and checks `config/workouts.yaml` |
| `src/lib/` | Pure, tested logic: targets, units/portions, dates, workout import, workout sessions and routine, weight trend and analysis, backups |
| `src/data/` | Supabase access and auth |
| `src/screens/` | One folder per screen: today, addfood, activity, workout, workouthistory, progress, settings, signin |
| `src/components/` | Shared UI |
| `supabase/migrations/` | Database schema and security policies |
| `supabase/functions/usda/` | USDA proxy Edge Function |
| `docs/` | Design, interface contracts, deploy guide, sample workout export |

Issues are tracked with `bd` (beads). See `AGENTS.md`.

