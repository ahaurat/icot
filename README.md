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
login**, so your students' data isn't exposed by the public anon key.

1. **Create a project** at [supabase.com](https://supabase.com) (free tier is fine).
2. **Run the schema.** In the project's **SQL editor**, paste and run
   [`supabase/schema.sql`](supabase/schema.sql). This creates the tables and locks
   Row Level Security so only signed-in users can read/write.
3. **Create your account.** Go to **Authentication → Users → Add user**, and set
   your email + a password. Then, under **Authentication → Providers → Email**,
   **turn OFF "Allow new users to sign up"** so yours is the only account.
4. **Get your keys** from **Project Settings → API**: the *Project URL* and the
   *anon public* key.
5. **Set the env vars** — locally, copy `.env.example` to `.env`:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
   (In production, set these in your host's env — see below.)
6. Restart `npm run dev`. You'll get a **sign-in screen**; log in with the account
   from step 3. The header badge switches from **💾 Local** to **☁ Cloud**, and on
   first run with empty tables the demo data is seeded. Sign out from **Settings →
   Account**.

To move existing local data into Supabase: in Local mode, **Export backup**; after
enabling Supabase and signing in, **Import backup**.

> The anon key is public (it ships in the bundle) — safe here because RLS blocks
> everyone except your logged-in account. Keep sign-ups disabled. (For multiple
> teachers you'd add an `owner_id` column and scope policies to `auth.uid()`.)
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
