# Nutrition Tracker

A phone-friendly web app for daily nutrition. Each day has targets for calories, protein,
carbs, fat and water, based on your profile, goal (lose fat / maintain / build muscle) and
that day's activity. You log food from your saved foods, USDA FoodData Central, or by hand,
and the app shows what's left.

Activity can be entered as calories, as hours of sedentary time / light cardio / strenuous
cardio / weight lifting, or by importing workout JSON.

The **Workout** tab is a 4-day dumbbell routine logger (merged in from
[FatherWorkout](https://github.com/domenickp/FatherWorkout)): last time's numbers prefilled,
rest timer, history. A finished workout counts toward that day's activity automatically, and
old FatherWorkout session files can be imported from Workout → History → Import.

**Targets are estimates, not medical advice.**

## Stack

- React + TypeScript + Vite, installable as a PWA, hosted on Cloudflare Pages
- Supabase: Postgres with row-level security, email sign-in, and one Edge Function (`usda`)
  that proxies USDA searches so the API key stays on the server

## Getting it running

Follow **[docs/deploy.md](docs/deploy.md)**. It walks through every account and setting,
including CI/CD (GitHub Actions checks every PR and deploys the USDA function after merge).

## Development

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
| `src/lib/` | Pure, tested logic: targets, units/portions, dates, workout import, workout sessions and routine |
| `src/data/` | Supabase access and auth |
| `src/screens/` | One folder per screen: today, addfood, activity, workout, workouthistory, settings, signin |
| `src/components/` | Shared UI |
| `supabase/migrations/` | Database schema and security policies |
| `supabase/functions/usda/` | USDA proxy Edge Function |
| `docs/` | Design, interface contracts, deploy guide, sample workout export |

Issues are tracked with `bd` (beads). See `AGENTS.md`.

## License

[MIT](LICENSE) © 2026 Domenick Petrella. You may copy and reuse the code as long as you keep
the copyright notice and license text.
