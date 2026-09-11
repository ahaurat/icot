# ICOT — In-Class On-Task

A classroom tool for tracking student distractions: per-student timers (bathroom,
nurse, office, sleeping, other) and tallies (cell phone, headphones), with
running totals for **today** and the **school year**.

Originally a single `index.html`; rewritten as a React + Vite + TypeScript app.
The original file is preserved in the first git commit.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

By default the app runs in **Local mode** — all data is stored in your browser's
`localStorage` on this machine, seeded with the existing class rosters. No accounts,
works offline. Use **Settings → Export backup** regularly to save a JSON copy.

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm run typecheck  # tsc only
```

## Features

- **Seating chart** per period on a 6×6 grid. Click a desk to open a student.
- **Timed events** (Bathroom, Nurse, Office, Sleeping, Other): tap to start a
  stopwatch on the desk; tap **Stop** to record the duration. While running, the
  desk shows a color-coded pill (🤒 Nurse, 😴 Sleeping, …) so you can see at a
  glance who's away and why. Running timers survive a page reload, so a forgotten
  timer keeps counting — then fix it via edit (below).
- **Count events** (Cell Phone, Headphones): tap to add one instance.
- **Desk badges**: each desk shows today's activity as colored emoji badges —
  minutes for timed categories (`🚽 10m`) and tallies for counts (`📱 3`).
- **Daily summary**: the **Summary** button lists all activity for the current
  period in plain sentences ("Ada Lovelace went to the bathroom for 8m (2 trips)"),
  defaulting to today with a date-range picker (Today / Yesterday / This week /
  This month / This school year / custom range).
- **Totals**: each student modal shows a Today / Year total per category, a
  **Total off-task** row summing the timed categories, and a plain-English summary
  ("… off-task for a total of 15m this year").
- **Edit entries**: in a student's History, click **Edit** to change an entry's
  category, time, or duration — or delete it. Handy when a timer ran too long. The
  History list has a multi-select **category filter**.
- **Move seats**: click **Edit seating**, then drag students between desks
  (dropping onto an occupied desk swaps them).
- **Add / remove students**: Settings → Manage roster. Removing a student keeps
  their history and year totals (soft delete); they can be restored or permanently
  deleted.
- **Roster upload** (new school year): Settings → Roster upload. Choose one .xlsx
  roster per period (the file name's number sets the period, e.g. `01 Names.xlsx`
  → Period 1). Students are seated in list order along a custom seat order, and
  you're prompted to **archive** the current year first — archived rosters are
  hidden but kept, and restorable from Settings → Archived rosters.
- **School-year boundary**: Settings → School year. Year totals count events on or
  after this date (default Aug 1, auto-rolls each year).
- **Backup / restore**: Export/Import the full dataset as JSON.

Stable student IDs back all of this: moving seats, renaming, and removing students
never lose history.

## Enabling Supabase (cloud sync + login)

Local mode is single-device. Cloud mode syncs across devices **and requires a
login**, so your students' data isn't exposed by the public key.

1. **Create a project** at [supabase.com](https://supabase.com) (free tier is fine).
2. **Run the schema.** In the project's **SQL editor**, paste and run
   [`supabase/schema.sql`](supabase/schema.sql). This creates the tables and locks
   Row Level Security so each signed-in teacher can read/write only their own rows.
3. **Enable teacher sign-ups.** Under **Authentication → Providers → Email**,
   keep **"Allow new users to sign up" ON** and **"Confirm email" ON**. Each
   teacher creates their own account from the app's **Sign up** form and clicks
   the confirmation link before signing in. (Supabase's built-in email sender is
   rate-limited and meant for low volume — configure custom SMTP under
   **Authentication → Emails** if you expect many sign-ups.)
4. **Get your keys** from **Settings → API Keys** (new projects) or
   **Settings → API** (older projects):
   - **Project URL** — shown at the top of either page (e.g. `https://xxxx.supabase.co`)
   - **API key** — use the **Publishable key** (`sb_publishable_...`) on new projects,
     or the **anon public** key on older ones. Both work identically here.
5. **Set the env vars** — locally, copy `.env.example` to `.env`:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-PUBLISHABLE-OR-ANON-KEY
   ```
   (In production, set these in your host's env — see below.)
6. Restart `npm run dev`. You'll get a **sign-in / sign-up screen**; create an
   account (or sign in). The header badge switches from **💾 Local** to
   **☁ Cloud**, and on each teacher's first sign-in their own demo data is seeded.
   Sign out from **Settings → Account**.

To move existing local data into Supabase: in Local mode, **Export backup**; after
enabling Supabase and signing in, **Import backup**.

> The publishable/anon key is public (it ships in the bundle) — safe because RLS
> scopes every row to its owner (`owner_id = auth.uid()`), so each teacher can
> read/write only their own classes, students, and events. Sign-ups are open with
> email confirmation; a new teacher gets their own seeded demo class on first sign-in.
> Free-tier projects pause after ~1 week of inactivity; open the dashboard to wake
> one after a school break.

## Deploy to production (Vercel)

The app is a static SPA — any static host works; these steps use **Vercel**.

1. Push to GitHub (already done for this repo).
2. On [vercel.com](https://vercel.com), **Add New → Project** and import the repo.
   Vercel auto-detects Vite (build `npm run build`, output `dist`).
3. Under **Settings → Environment Variables**, add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (same values as your `.env`). These are build-time
   values, so **redeploy** after adding them.
4. Deploy. Every push to `main` auto-deploys. Add a custom domain under
   **Settings → Domains** if you like (free, includes HTTPS).

> Netlify and Cloudflare Pages work identically (same build/output, same env vars).

## Deploying schema changes (Supabase migrations)

Schema changes are managed as Supabase CLI migrations under `supabase/migrations/`,
not by pasting SQL into the dashboard (that path is only for bootstrapping a
brand-new project — see "Enabling Supabase" above).

1. `npx supabase migration new <name>` — creates a new timestamped file under
   `supabase/migrations/`.
2. Hand-edit the generated SQL.
3. Test it against the dev project: in GitHub, go to **Actions → Supabase
   Migrate → Run workflow**, choose **dev**, and run it. Verify with
   `npm run dev:cloud`.
4. Open a PR and merge the migration file to `main` as normal — merging does
   **not** touch either database by itself, it only ships the file.
5. When ready, go to **Actions → Supabase Migrate → Run workflow**, choose
   **production**, and run it.

The workflow requires these repo secrets (**Settings → Secrets and variables
→ Actions**), added once when this is first set up:
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROD_PROJECT_REF`, `SUPABASE_PROD_DB_PASSWORD`,
`SUPABASE_DEV_PROJECT_REF`, `SUPABASE_DEV_DB_PASSWORD`.

## Local development vs. production data

Once the app is deployed, the production Supabase project holds **real student
data**. Local development must not point at it — a stray roster upload or an
"Import backup" (which clears every table before writing) would hit live data.

The env files are split by Vite mode so this can't happen by accident:

| Command | Vite mode | Env file used | Storage |
| --- | --- | --- | --- |
| `npm run dev` | `development` | `.env` (left empty) | **local** (localStorage) |
| `npm run dev:cloud` | `cloud` | `.env.cloud.local` | **dev** Supabase project |
| `npm run build` | `production` | `.env.production.local` | **prod** Supabase project |

All three files are gitignored. `npm run dev` cannot reach any cloud project,
because `.env` holds no keys — so everyday work runs against the fictional demo
class with no login.

Some bugs only appear in cloud mode, though, because localStorage writes are
synchronous while network writes race and can fail independently. Testing those
needs a **second Supabase project** (the free tier allows two):

1. Create a new project — name it something like `icot-dev`.
2. Run `supabase/schema.sql` in its SQL editor, same as production. (Once the
   project is linked and baselined — see "Deploying schema changes" above —
   you can instead run the **Supabase Migrate** workflow with `dev` selected.)
3. Add a throwaway test user under **Authentication → Users**. Sign-ups can stay
   enabled here; there's no real data to protect.
4. Put that project's URL and publishable key in `.env.cloud.local`.
5. `npm run dev:cloud` — you'll get the login screen, backed by the dev project.

Seed it with fake students via **Manage roster**, or import a backup exported
from local mode. Never copy a production backup into the dev project.

> Schema changes (like the `owner_id` columns for multi-teacher support) should be
> applied and tested in the dev project first, then run against production during a
> break rather than mid-semester. To move an existing single-tenant database to the
> multi-teacher model, run
> [`supabase/migrate_to_multi_tenant.sql`](supabase/migrate_to_multi_tenant.sql)
> (transactional and re-runnable — it remaps slug class ids like `period-1` to
> UUIDs and backfills `owner_id`) instead of the fresh `schema.sql`.

## Install as an app (PWA)

The app is a PWA — installable and full-screen, no browser chrome:

- **Desktop Chrome/Edge:** click the install icon in the address bar (or ⋮ → *Install ICOT*).
- **iOS Safari:** Share → *Add to Home Screen*. Launches full-screen.
- **Android Chrome:** ⋮ → *Install app* / *Add to Home Screen*.

Icons are generated from [`public/icon.svg`](public/icon.svg) via
`node scripts/generate-icons.mjs` (re-run if you change the icon).

## Project structure

```
src/
  types.ts                  Domain types (ClassRoom, Student, AppEvent, Settings)
  constants/categories.ts   Category config (timed vs count, colors)
  data/                     Storage: DataStore interface, local + Supabase adapters, seed
  state/                    Zustand store (useAppStore) + live-timer ticker
  hooks/useAggregates.ts    Today/Year totals per student × category
  utils/                    time + id helpers
  components/               Header, SeatingChart, Seat, StudentModal, TotalsTable,
                            EventHistory, EditEventDialog, SettingsModal, RosterManager
```

## Notes

- The custom seat order used by roster upload lives in
  [`src/constants/seatOrder.ts`](src/constants/seatOrder.ts) (bottom-to-top up each
  column). It's a single shared layout for all periods and is currently hard-coded;
  an in-app seat-order editor is a planned follow-up.
- Roster files contain student names (PII) and are gitignored (`sample-rosters/`).
- Data from the old `buildpicoapps.com` backend is **not** auto-migrated (it stored
  only name + timestamp + duration + reason, with no class or stable ID). Starting
  fresh for the school year is the default. A best-effort name-matching import could
  be added if needed.
