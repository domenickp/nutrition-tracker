# Nutrition Tracker

A phone-friendly app for daily nutrition and workouts. Each day has targets for calories,
protein, carbs, fat and water, based on your profile, your goal (lose fat, maintain or build
muscle) and that day's activity. You log what you eat and the app shows what's left. It also
logs your workouts and tracks your weight trend against your goal.

**Targets are estimates, not medical advice.**

## Getting started

### 1. Get an account

The app is invite-only. Ask the owner to add you, and tell them the email address you'll sign
in with. There's no password: each time you sign in, you get a 6-digit code by email.

### 2. Install it on your phone

Open the link the owner sends you, then:

- **Android (Chrome):** tap the **⋮** menu → **Install app** (on some phones it says
  **Add to Home screen**). Confirm, and the app appears with your other apps.
- **iPhone (Safari):** tap **Share** → **Add to Home Screen** → **Add**. It has to be Safari;
  other iPhone browsers can't install it.

Open it from the home screen from then on. It runs full screen, like any other app.

### 3. Sign in

Enter your email and tap **Email me a code**. Type the 6-digit code from the email into the
app. Use the code, not the link in the email: on a phone, the link opens the browser instead
of the installed app, and the app wouldn't be signed in.

### 4. Fill in Settings

The first time, the app opens **Settings**. Enter your birth month and year, sex, height,
weight, goal, units and **Everyday activity** (how much you move outside workouts: mostly
sitting, on your feet part of the day, or most of the day). Save, and you're on Today.

## Using the app

- **Today:** your targets and what's left for the day.
  - **Weigh in** at the top: once a day, ideally in the morning, under the same conditions
    each time.
  - **Add food** to log a meal. Search your saved foods or the USDA food database, or enter
    a food by hand. Pick an amount (servings, grams or a portion like "1 cup").
  - Tap a logged item to change the amount or delete it.
  - **Water**: tap a quick amount, or enter your own.
  - Use the arrows at the top to look at other days.
- **Workout:** a 4-day dumbbell routine. Last time's numbers are filled in for you; mark
  each set done, and a rest timer starts. **Finish** saves the workout, and it counts toward
  that day's activity automatically. **History** shows past workouts.
- **Activity:** extra activity for a day that isn't a logged workout. Enter hours of light
  cardio, hard cardio or lifting, or a calorie number from a watch. The rest of your waking
  day counts at your Everyday activity level. The page shows how your calorie target was
  worked out.
- **Progress** (the link next to your weight on Today): a chart of your weight and its
  trend, and how you're doing against your goal. After about two weeks of daily weigh-ins and
  food logging, the app may suggest a new calorie target, or protein, cardio or lifting
  advice. Nothing changes unless you tap **Accept**. **Not now** hides a suggestion for a
  week.
- **Settings:** your profile, goal and units, plus optional overrides for the calorie
  adjustment, protein, fat and water targets.

The app works best when you log every day. Days with no food logged, or only part of a day,
make the weight analysis less accurate, and it will tell you so.

## Your data

Everything you enter is stored in the app's database. Only you can see it in the app. The
owner, as the database administrator, can see it too.

In **Settings → Your data**:

- **Download backup** saves a file with all your data (profile, weigh-ins, foods, food and
  water logs, activity, workouts and suggestions). Keep it somewhere safe.
- **Delete all my data** removes everything you've entered. Type `DELETE` to confirm. The app
  downloads a backup first, automatically. Your account stays active, so you can start again
  at any time without asking anyone. Keeping the account doesn't keep any data. If you'd like
  the account removed too, ask the owner.
- **Import backup** puts a backup file back. It only works on an empty account: right after
  deleting your data, or on a new account.

## Running your own copy

This repo is everything needed to host the app yourself on free tiers of Supabase and
Cloudflare. Follow **[docs/deploy.md](docs/deploy.md)** for the accounts and settings, and
**[docs/development.md](docs/development.md)** for working on the code.

## License

[MIT](LICENSE) © 2026 Domenick Petrella. You may copy and reuse the code as long as you keep
the copyright notice and license text.
