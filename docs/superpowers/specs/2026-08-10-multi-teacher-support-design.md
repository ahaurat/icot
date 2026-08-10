# Multi-teacher support — design

**Date:** 2026-08-10
**Status:** Approved, ready for implementation planning

## Goal

Let independent teachers each use ICOT with their **own** students, fully private
from other teachers. Today the app is single-teacher: Supabase RLS grants any
`authenticated` user full access to every row (`"authenticated all" … using(true)`),
so a second account would see the first teacher's students. This design adds
per-teacher ownership and scopes all data access to the signed-in user.

## Non-goals

- Sharing data between teachers, co-teachers, or roles (admin/assistant). Each
  teacher is an island. A future `profiles`/roles table can add this later.
- Changing local (localStorage) mode. It stays single-device, single-tenant, with
  no owner concept.
- Migrating real production data. The deployed Supabase DB is empty/demo-only, so
  the canonical path is a clean schema. An upgrade/backfill path is documented for
  completeness but is not the primary route.

## Chosen approach: server-side ownership only

`owner_id` lives **only** in the database — `default auth.uid()`, enforced by RLS.
The client never sends or reads it; RLS scopes every query automatically.

Rejected alternatives:
- **Ownership in the domain model** (add `ownerId` to every entity, thread it
  through the store): pollutes local mode, bloats types, makes JSON backups
  account-specific, and re-implements what RLS already guarantees.
- **Separate `profiles` table + FKs**: overkill — `auth.uid()` is already the
  stable per-teacher key. Adds joins and migration weight for no gain now.

Consequences of the chosen approach:
- `types.ts`, the `DataStore` interface (`store.ts`), `localStore.ts`, and JSON
  export/import stay **unchanged** — `owner_id` never enters the app model.
- JSON backups remain account-portable (no owner baked in): a teacher can export
  and re-import under any account.
- The only client change in the data layer is how **settings** are keyed (settings
  identity moves from a fixed `id='app'` to the owner), plus the `uuid` column
  types below.

## Database schema & RLS (`supabase/schema.sql`)

Rewrite `schema.sql` as the canonical multi-tenant schema. Key changes:

### Column types → `uuid`

The current schema uses `text` ids for classes and `class_id`. Switch to `uuid`
(the DB is empty, so no migration cost, and the domain model already uses
`string`, so no app-code churn):

- `classes.id` → `uuid primary key`
- `students.class_id` → `uuid not null references classes(id) on delete cascade`
- `events.class_id` → `uuid not null` (keeps today's no-FK behavior — events are
  imported/inserted independently; adding a FK here is out of scope)
- `events.student_id` is already `uuid`.

### `owner_id` on every table

Add `owner_id uuid not null default auth.uid()` to `classes`, `students`,
`events`. When run in the SQL editor (as the service role) `auth.uid()` is NULL,
which is fine — the default only applies to future inserts by authenticated users
(the app seed and all mutations). Sketch:

```sql
create table if not exists classes (
  id          uuid primary key,
  owner_id    uuid not null default auth.uid(),
  name        text not null,
  seat_rows   int  not null default 6,
  seat_cols   int  not null default 6,
  archived_at timestamptz
);

create table if not exists students (
  id         uuid primary key,
  owner_id   uuid not null default auth.uid(),
  class_id   uuid not null references classes(id) on delete cascade,
  name       text not null,
  seat_index int,
  active     boolean not null default true
);

create table if not exists events (
  id               uuid primary key,
  owner_id         uuid not null default auth.uid(),
  student_id       uuid not null references students(id) on delete cascade,
  class_id         uuid not null,
  category_key     text not null,
  type             text not null,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  duration_seconds int,
  open             boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```

### Settings — per owner

`settings` identity moves from the fixed `id='app'` row to one row per teacher:

```sql
create table if not exists settings (
  owner_id          uuid primary key default auth.uid(),
  school_year_start date not null
);
```

Drop the old `id` column. (`owner_id` as PK is already indexed.)

### Indexes

```sql
create index if not exists classes_owner_idx  on classes  (owner_id);
create index if not exists students_owner_idx on students (owner_id);
create index if not exists events_owner_idx   on events   (owner_id);
create index if not exists events_student_idx on events   (student_id);
create index if not exists events_class_idx   on events   (class_id);
```

### RLS policies — owner-scoped

Keep the existing idempotent drop-then-create pattern; replace `using(true)` with
owner scoping, for the `authenticated` role only (anon still gets nothing):

```sql
alter table classes  enable row level security;
alter table students enable row level security;
alter table events   enable row level security;
alter table settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['classes','students','events','settings'] loop
    execute format('drop policy if exists "anon all" on %I;', t);
    execute format('drop policy if exists "authenticated all" on %I;', t);
    execute format('drop policy if exists "owner all" on %I;', t);
    execute format(
      'create policy "owner all" on %I for all to authenticated '
      || 'using (owner_id = auth.uid()) with check (owner_id = auth.uid());',
      t
    );
  end loop;
end $$;
```

### Upgrade path (documented, not the primary route)

For anyone with an existing single-tenant DB and real data, include a clearly
separated, commented section (either at the bottom of `schema.sql` or a
`supabase/migrations/` note) describing:

1. `alter table … add column if not exists owner_id uuid;` (nullable first)
2. Backfill: `update … set owner_id = '<YOUR-AUTH-UID>' where owner_id is null;`
   (get the UID from Authentication → Users)
3. `alter column owner_id set not null; alter column owner_id set default auth.uid();`
4. `id`/`class_id` text→uuid conversion caveat: only safe when existing id values
   are valid UUID strings (`… type uuid using id::uuid`); slug ids like `period-1`
   must be remapped first. Given our DB is empty, the clean schema is preferred.
5. Replace policies as above.

## Data layer (`src/data/`)

- `types.ts`, `store.ts`, `localStore.ts`: **no change**.
- `supabaseStore.ts`:
  - `loadAll`: settings query becomes `sb.from("settings").select("*").maybeSingle()`
    (RLS returns only the caller's row; drop `.eq("id","app")`). All other selects
    are already unscoped in code and become owner-scoped automatically via RLS.
  - `saveSettings`: upsert `{ owner_id: <uid>, school_year_start }` with
    `onConflict: "owner_id"`. The store resolves `<uid>` once via a memoized
    `auth.getUser()` helper and reuses it.
  - `importAll`: unchanged delete-then-insert (RLS scopes the deletes to the
    caller; inserts get `owner_id` from the default), except its `saveSettings`
    call uses the new per-owner upsert.

## Seeding per teacher (`src/state/useAppStore.ts`, `src/data/seed.ts`)

- `seed.ts`: replace the fixed `classId = "period-1"` with `newId()` (a
  `crypto.randomUUID()` string) so seeded class ids are globally unique and never
  PK-collide across teachers. Roster upload already uses `newId()`.
- `useAppStore.init()`: **no logic change**. It seeds when `loadAll()` returns no
  classes; under owner-scoped RLS a brand-new confirmed teacher sees zero rows and
  gets the demo seed, and inserted rows pick up their `owner_id` from the DB
  default. Verify this flow end to end.

## Auth & onboarding — open sign-up + email confirmation

- `LoginScreen.tsx`: add a Sign in / Sign up mode toggle.
  - Sign up calls `supabase.auth.signUp({ email, password })`.
  - With email confirmation on, a successful sign-up returns a user but **no
    session**; show a "Check your email to confirm your account" success state
    instead of expecting an immediate login.
  - Surface Supabase errors (weak password, already registered, etc.) as today.
  - Basic client guard on empty/short password; defer to Supabase for the rest.
- `useAuth.ts`: **no change**. `onAuthStateChange` already swaps in the app once a
  session exists (after the user confirms and signs in).
- Supabase project config: **enable** "Allow new users to sign up"; keep "Confirm
  email" **on**.

## Docs

- `README.md`: rewrite the security/enabling-Supabase section — remove
  "single-teacher / keep sign-ups disabled"; document the multi-teacher model
  (self-service sign-up, email confirmation, per-owner RLS isolation). Note the
  Supabase built-in email sender is rate-limited and meant for low volume;
  recommend configuring custom SMTP if sign-up volume grows.
- `schema.sql` header comment and `.env.example`: update to match.

## Verification

### Automated — RLS policy test (`supabase/rls_test.sql`)

A self-contained script to paste into the Supabase SQL editor. It runs inside a
transaction and **rolls back**, so it needs no real accounts and leaves no trace.
It:

1. Simulates two signed-in teachers by setting `request.jwt.claims` (`sub` = two
   distinct UUIDs) and `set local role authenticated`, resetting role between
   users to switch identity.
2. As teacher A, inserts a class + student + event + settings row (omitting
   `owner_id` so the `auth.uid()` default is exercised).
3. As teacher B, inserts B's own rows, then asserts:
   - B sees only B's rows across `classes`, `students`, `events`, `settings`
     (A's rows are invisible).
   - A cross-owner **write** is rejected: inserting a row with
     `owner_id = <A's uuid>` as B fails the `with check`, and updating A's class as
     B affects 0 rows.
4. Symmetrically confirms A sees only A's rows.
5. `ROLLBACK`.

Assertions use `assert`/`raise exception` so a failure aborts loudly. This test
must run in a Supabase project (where the `authenticated` role already has the
default table grants RLS sits on top of), not vanilla Postgres.

### Automated — client build

`npm run build` (tsc typecheck + Vite build) must pass after the changes.

### Manual — live two-account checklist (run by the user)

Claude cannot create accounts or enter passwords, so the live end-to-end login is
the user's to run. Checklist:

1. Create Teacher A via the app's Sign up form; confirm A's email; sign in.
2. Confirm A gets the demo seed; add/rename a distinctive student.
3. Sign out. Create Teacher B; confirm; sign in.
4. Confirm B gets a **fresh** demo seed and does **not** see A's distinctive
   student or any of A's classes.
5. Set a different school-year start as B; sign back in as A; confirm A's
   school-year start is unchanged (per-owner settings).

## Files touched

- `supabase/schema.sql` (rewrite: uuid ids, owner_id, per-owner settings, owner RLS)
- `supabase/rls_test.sql` (new)
- `src/data/supabaseStore.ts` (settings load/save, importAll settings)
- `src/data/seed.ts` (UUID class id)
- `src/components/LoginScreen.tsx` (sign-up toggle + confirm-email state)
- `README.md`, `.env.example` (docs)
- No change: `types.ts`, `src/data/store.ts`, `src/data/localStore.ts`,
  `src/state/useAuth.ts`, `src/state/useAppStore.ts` (init logic unchanged).
