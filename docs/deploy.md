# Deploying Nutrition Tracker

You'll create three free accounts, connect them, and end up with the app at a
`https://<name>.pages.dev` address you can install on your phone. Set aside about 45 minutes.
Do the steps in order: later steps need values from earlier ones.

Keep a scratch note open. You'll collect five values along the way:

| Value | Where it comes from | Secret? |
|---|---|---|
| USDA API key | Step 1 | Yes. It goes only into Supabase, never into the app. |
| Supabase project ref | Step 2 | No |
| Supabase project URL | Step 2 | No |
| Supabase anon (publishable) key | Step 2 | No. It's designed to be public, and row-level security protects the data. |
| Cloudflare Pages URL | Step 6 | No |

You also choose a database password in Step 2. Store it in a password manager.

---

## Step 1 — Get a USDA API key (2 minutes)

1. Go to <https://fdc.nal.usda.gov/api-key-signup>.
2. Enter your name and email and submit.
3. The key arrives by email. Save it as **USDA API key**.

## Step 2 — Create the Supabase project (5 minutes)

1. Go to <https://supabase.com> and sign up (signing in with GitHub is simplest).
2. Click **New project**.
   - Name: `nutrition-tracker`
   - Database password: click **Generate**, then save it in your password manager.
   - Region: the one nearest you.
   - Plan: Free.
3. Wait for the project to finish setting up (a minute or two).
4. Find the **project ref**. It's the random-looking part of the dashboard address:
   `supabase.com/dashboard/project/<project-ref>`. Save it.
5. Click **Connect** at the top of the project page (or go to **Project Settings → API**).
   Save the **Project URL** (`https://<project-ref>.supabase.co`) and the **anon** /
   **publishable** key. Do **not** copy the `service_role` / secret key anywhere.

## Step 3 — Load the database and the USDA function (10 minutes)

On your computer, in a terminal opened in the `nutrition-tracker` folder:

```bash
npx supabase login                                  # opens a browser to authorize
npx supabase link --project-ref <project-ref>       # asks for the database password
npx supabase db push --remote                       # creates all tables and security rules
npx supabase secrets set USDA_API_KEY=<your USDA key>
npx supabase functions deploy usda --use-api        # --use-api means Docker isn't needed
```

Each command should finish without a red error. `db push` lists the migration
`20261116000000_init.sql` as applied. If `functions deploy` reports a TypeScript error,
stop and paste it into a Claude session in this repo.

## Step 4 — Configure sign-in (10 minutes)

In the Supabase dashboard:

1. **Authentication → Sign In / Providers**
   - Turn **off** "Allow new users to sign up". The app is invite-only for now.
   - Under **Email**, make sure the provider is enabled. Set "Email OTP Length" to 6 if
     that option is shown.
2. **Authentication → Emails → Templates → Magic Link**. Replace the body with:
   ```html
   <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background-color:#000000;">
     <tr>
       <td style="padding:24px; color:#ffffff; font-family:Arial, sans-serif;">
         <h2 style="color:#ffffff; margin-top:0;">Sign in to Nutrition Tracker</h2>
         <p style="color:#ffffff;">Your code: <strong style="color:#ffffff;">{{ .Token }}</strong></p>
         <p style="color:#ffffff;">Or <a href="{{ .ConfirmationURL }}" style="color:#ffffff; text-decoration:underline;">tap here to sign in</a>.</p>
       </td>
     </tr>
   </table>
   ```
   The code (`{{ .Token }}`) is what you'll use in the installed phone app, because a
   home-screen app on iPhone doesn't share sign-ins with Safari.
3. **Authentication → Users → Add user → Create new user**. Enter your email, tick
   **Auto Confirm User**, and leave the password blank (or set any; it isn't used).
4. Come back to **Authentication → URL Configuration** after Step 6 to fill in the site URL.

> Supabase's built-in email sender allows only a few emails per hour. That's fine for
> one person. If you add more users later, connect your own email service under
> **Project Settings → Authentication → SMTP**.

## Step 5 — Try it on your computer (optional, 5 minutes)

```bash
cp .env.example .env.local
# edit .env.local: paste the Project URL and anon key after the = signs
npm install
npm run dev
```

Open <http://localhost:5173>, sign in with your email using the 6-digit code, and fill in
Settings. `.env.local` is gitignored, so it never gets committed.

If you use the email *link* instead of the code locally, it opens the Site URL from Step 4.
Use the code for local testing.

## Step 6 — Publish on Cloudflare Pages (10 minutes)

1. Go to <https://dash.cloudflare.com> and sign up.
2. **Compute → Workers & Pages → Create → Pages → Connect to Git**. Authorize GitHub and pick the
   `nutrition-tracker` repository. If Cloudflare offers a Workers setup instead, look for
   the "Pages" tab or the "Looking to deploy Pages?" link.
3. Build settings:
   - Production branch: `main`
   - Framework preset: **Vite** (or "None")
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Environment variables** (production), adding each:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon/publishable key
   - `NODE_VERSION` = `22`
5. **Save and Deploy**. When it finishes you get a URL like
   `https://nutrition-tracker-abc.pages.dev`. Save it as **Cloudflare Pages URL**.

From now on, every push to `main` redeploys automatically.

## Step 7 — Point sign-in at your site (2 minutes)

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: your Cloudflare Pages URL
- **Redirect URLs**: add your Pages URL, and `http://localhost:5173` if you did Step 5.

## Step 8 — Install on your phone

Follow **Getting started** in the [README](../README.md#getting-started): it covers
installing on Android and iPhone, signing in with the code, and the first Settings screen.
Send other people the same section, after adding them under **Authentication → Users**
(Step 4.3).

## Checks once it's live

- Today shows targets after Settings is saved.
- Add food → search "banana" shows USDA results. If it shows an error instead, recheck
  `USDA_API_KEY` and the function deploy in Step 3.
- Activity → Import workout → paste one of your workout files. It should land on the
  correct local date.

## CI/CD: automatic checks and function deploys (10 minutes, once)

Changes arrive as pull requests. GitHub Actions (`.github/workflows/ci.yml`) runs the
typecheck, tests, build and a Deno check of the USDA function on every PR. After you merge a
PR into `main`, it runs them again and, if they pass and the USDA function changed, deploys
the function. You no longer run `npx supabase functions deploy` yourself.

### 1. Create a Supabase access token

1. Supabase dashboard → your avatar (top right) → **Account preferences → Access Tokens**
   (or go to <https://supabase.com/dashboard/account/tokens>).
2. **Generate new token**, name it `github-actions-nutrition-tracker`, and copy it.
   It's shown only once.

This token can manage every project in your Supabase account, so put it only in GitHub
secrets. If it ever leaks, delete it on that same page and generate a new one.

### 2. Add two GitHub secrets

GitHub → the `nutrition-tracker` repo → **Settings → Secrets and variables → Actions →
New repository secret**. Add:

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | the token from step 1 |
| `SUPABASE_PROJECT_REF` | your project ref (from Step 2 above) |

### 3. Make Cloudflare run the tests before publishing

Cloudflare builds `main` by itself, separately from GitHub Actions. This app ended up as a
Cloudflare **Workers** project with Workers Builds (the PR checks show "Workers Builds:
nutrition-tracker"). To stop a build with failing tests from going live:

1. Cloudflare dashboard → **Compute → Workers & Pages** → `nutrition-tracker` →
   **Settings → Build**.
2. Edit **Build command** to the line below. Leave the deploy command as it is.
   ```
   npm test && npm run build
   ```
   `npm run build` already includes the typecheck.
3. Save. It applies from the next build.

**Preview builds for PRs.** Cloudflare also builds each PR branch (with
`npx wrangler preview`) and links a preview URL on the PR, so you can try a change on your
phone before merging. Its settings live in `wrangler.jsonc` in the repo. Previews use the
same Supabase project as the live app, so data you enter in a preview is real.

Previews don't inherit production settings. Add `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` to the **Previews Base** section too (Workers & Pages →
`nutrition-tracker` → Settings), or a preview shows "Failed to fetch" when you ask for a
sign-in code. In a preview, sign in with the 6-digit code: the email's link goes to the
live site.

### 4. (Optional) Require green checks before merging

GitHub → **Settings → Branches → Add branch ruleset** (or "branch protection rule") for
`main`: require a pull request, and require the `check` status to pass. On a free personal
account, GitHub may not offer rulesets for private repos. Without one, just don't merge a PR
whose checks are red.

### Checking a deploy

GitHub → **Actions** tab shows each run. The `deploy-usda` job prints "skipping deploy" when
the function didn't change. If it fails with "Set SUPABASE_ACCESS_TOKEN…", the secrets in
step 2 are missing or misnamed.

**Database migrations are not automated.** When a PR adds a file under
`supabase/migrations/`, its description will say so. Run `npx supabase db push` yourself
after merging. Until you do, the app keeps working, but weight suggestions are hidden (the
`target_suggestions` table from `20261122000000_target_suggestions.sql` doesn't exist yet).

## Later: letting other people use it

Turn "Allow new users to sign up" back on (Step 4.1) or invite them under Authentication →
Users. Each person's data is already isolated by the database's security rules. The app
needs a small change to allow creating an account from the sign-in screen
(`shouldCreateUser` in `src/data/auth.ts`). Track that as a bd issue when you want it.
