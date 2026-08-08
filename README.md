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

## Enabling Supabase (cloud sync)

Local mode is single-device. To sync across devices:

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy `.env.example` to `.env` and set:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
4. Restart `npm run dev`. The header badge switches from **💾 Local** to
   **☁ Cloud**. On first run with empty tables, the rosters are seeded
   automatically.

To move your existing local data into Supabase: in Local mode, **Export backup**;
then after enabling Supabase, **Import backup**.

> The app uses the public anon key with permissive row-level policies — fine for a
> single-teacher tool. Add Supabase Auth + per-user policies for multi-user setups.

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
