# Multi-teacher Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let independent teachers each use ICOT with their own students, fully private from other teachers, via per-row ownership enforced by Supabase Row Level Security.

**Architecture:** Ownership lives only in the database — every row carries `owner_id uuid not null default auth.uid()`, and RLS scopes all access to `owner_id = auth.uid()`. The client never sends or reads `owner_id`; the app's domain types, `DataStore` interface, `localStore`, and JSON export/import are unchanged. The only client changes are how the per-owner `settings` row is keyed and a self-service sign-up UI. Class ids become UUID values so they never collide across teachers.

**Tech Stack:** React 19 + Vite + TypeScript, Zustand, `@supabase/supabase-js` (PostgREST), Supabase Postgres + Auth + RLS, Tailwind CSS.

## Global Constraints

- **No JS test runner exists in this project (by design).** Do not add one. Verification per task is: `npm run build` (runs `tsc -b` typecheck + Vite build), the SQL isolation test `supabase/rls_test.sql` (run by the user in the Supabase SQL editor), and the manual two-account checklist. This deviates from unit-test TDD deliberately — the security-critical layer (RLS) is tested by `rls_test.sql`.
- **`owner_id` never enters the app/domain model.** Do not add `ownerId` to `types.ts`, the `DataStore` interface, or `localStore.ts`. It is a DB-only concern set by the `default auth.uid()`.
- **Local (localStorage) mode stays single-tenant and unchanged.** No auth, no owner concept.
- **JSON backups stay account-portable** — never serialize `owner_id` into export/import.
- Class ids are `crypto.randomUUID()` strings via the existing `newId()` (`src/utils/id.ts`).
- Supabase password minimum length is 6 (default) — the sign-up form must not allow shorter.
- Commit messages use Conventional Commits (`feat:`, `docs:`, `refactor:`), matching repo history style.

---

### Task 1: Multi-tenant database schema, RLS, and isolation test

Rewrite the schema for per-owner ownership and add a self-contained RLS isolation test. Neither file runs in this repo's toolchain; the deliverable is verified by running `rls_test.sql` in the Supabase SQL editor (user-run — see Step 4), which is the authoritative check that isolation works.

**Files:**
- Modify: `supabase/schema.sql` (full rewrite)
- Create: `supabase/rls_test.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `classes`, `students`, `events`, `settings`, each with `owner_id uuid not null default auth.uid()` (except `settings`, where `owner_id uuid primary key default auth.uid()`); `classes.id`, `students.class_id`, `events.class_id` are `uuid`; RLS policy `"owner all"` (`for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())`) on all four tables. Later tasks rely on: `settings` keyed by `owner_id` (Task 2); UUID class ids (Task 3).

- [ ] **Step 1: Write the RLS isolation test**

Create `supabase/rls_test.sql` with this exact content:

```sql
-- ICOT RLS isolation test. Paste into the Supabase SQL editor and run.
-- Simulates two signed-in teachers, asserts each sees only their own rows,
-- then ROLLS BACK. No real accounts are created; nothing is persisted.
-- Must run in a Supabase project (relies on the default `authenticated` grants).

begin;

-- ===== Act as Teacher A =====
select set_config(
  'request.jwt.claims',
  json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text,
  true
);
set local role authenticated;

insert into classes (id, name, seat_rows, seat_cols)
  values ('a1111111-1111-1111-1111-111111111111', 'A Math', 6, 6);
insert into students (id, class_id, name, seat_index, active)
  values ('a2222222-2222-2222-2222-222222222222',
          'a1111111-1111-1111-1111-111111111111', 'Alice', 0, true);
insert into events (id, student_id, class_id, category_key, type, started_at)
  values ('a3333333-3333-3333-3333-333333333333',
          'a2222222-2222-2222-2222-222222222222',
          'a1111111-1111-1111-1111-111111111111', 'bathroom', 'timed', now());
insert into settings (school_year_start) values ('2026-08-01');

-- ===== Act as Teacher B =====
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub','22222222-2222-2222-2222-222222222222','role','authenticated')::text,
  true
);
set local role authenticated;

insert into classes (id, name)
  values ('b1111111-1111-1111-1111-111111111111', 'B Science');
insert into students (id, class_id, name)
  values ('b2222222-2222-2222-2222-222222222222',
          'b1111111-1111-1111-1111-111111111111', 'Bob');
insert into events (id, student_id, class_id, category_key, type, started_at)
  values ('b3333333-3333-3333-3333-333333333333',
          'b2222222-2222-2222-2222-222222222222',
          'b1111111-1111-1111-1111-111111111111', 'cellphone', 'count', now());
insert into settings (school_year_start) values ('2025-09-01');

-- B sees only B's rows.
do $$
begin
  assert (select count(*) from classes)  = 1, 'B should see exactly 1 class';
  assert (select count(*) from students) = 1, 'B should see exactly 1 student';
  assert (select count(*) from events)   = 1, 'B should see exactly 1 event';
  assert (select count(*) from settings) = 1, 'B should see exactly 1 settings row';
  assert (select name from classes) = 'B Science', 'B should see only B''s class';
  assert (select school_year_start from settings) = date '2025-09-01',
         'B should see only B''s settings';
end $$;

-- B cannot update A's (invisible) row: 0 rows affected.
do $$
begin
  update classes set name = 'HACKED'
    where id = 'a1111111-1111-1111-1111-111111111111';
  assert not found, 'B must not be able to update A''s class (0 rows expected)';
end $$;

-- B cannot insert a row owned by A: with check must reject it.
do $$
declare rejected boolean := false;
begin
  begin
    insert into classes (id, owner_id, name)
      values ('b9999999-9999-9999-9999-999999999999',
              '11111111-1111-1111-1111-111111111111', 'Spoofed');
  exception when others then
    rejected := true;  -- expected: RLS with-check violation
  end;
  assert rejected, 'with check must block inserting a row owned by another user';
end $$;

-- ===== Act as Teacher A again: sees only A's rows =====
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text,
  true
);
set local role authenticated;

do $$
begin
  assert (select count(*) from classes)  = 1, 'A should see exactly 1 class';
  assert (select name from classes) = 'A Math', 'A should see only A''s class';
  assert (select count(*) from students) = 1, 'A should see exactly 1 student';
  assert (select count(*) from events)   = 1, 'A should see exactly 1 event';
  assert (select school_year_start from settings) = date '2026-08-01',
         'A should see only A''s settings';
end $$;

reset role;
select 'ALL RLS TESTS PASSED' as result;

rollback;
```

- [ ] **Step 2: Rewrite the schema**

Replace the entire contents of `supabase/schema.sql` with:

```sql
-- ICOT Supabase schema (multi-teacher).
-- Run once in the Supabase SQL editor to enable cloud sync, then set
-- VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.
--
-- Multi-teacher model: every row is owned by the teacher who created it
-- (owner_id = auth.uid()) and Row Level Security scopes all access to the
-- owner, so teachers never see each other's data. Teachers self-register
-- (Authentication -> Providers -> Email: allow sign-ups + confirm email).
-- See README "Enabling Supabase".

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

create table if not exists settings (
  owner_id          uuid primary key default auth.uid(),
  school_year_start date not null
);

create index if not exists classes_owner_idx  on classes  (owner_id);
create index if not exists students_owner_idx on students (owner_id);
create index if not exists students_class_idx on students (class_id);
create index if not exists events_owner_idx   on events   (owner_id);
create index if not exists events_student_idx on events   (student_id);
create index if not exists events_class_idx   on events   (class_id);

-- Security: the anon key is PUBLIC (it ships in the client bundle), so access is
-- controlled by Row Level Security. Each authenticated teacher can read/write
-- ONLY the rows they own (owner_id = auth.uid()); the anon role gets nothing.
-- owner_id defaults to auth.uid() on insert, so the client never sends it.
-- Self-service sign-up is expected; the "owner all" policy keeps teachers
-- isolated from one another.
alter table classes  enable row level security;
alter table students enable row level security;
alter table events   enable row level security;
alter table settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['classes','students','events','settings'] loop
    -- Remove earlier single-tenant / anon policies if present.
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

-- ----------------------------------------------------------------------------
-- UPGRADING an existing single-tenant database?  (Skip for a fresh DB.)
--
-- If you already have single-tenant tables (text ids, a single settings row
-- id='app', "authenticated all" policy) with real data, run these steps ONCE
-- instead of relying on the fresh CREATEs above. Get <YOUR-UID> from
-- Authentication -> Users.
--
--   -- 1. Add + backfill + lock owner_id on the data tables.
--   alter table classes  add column if not exists owner_id uuid;
--   alter table students add column if not exists owner_id uuid;
--   alter table events   add column if not exists owner_id uuid;
--   update classes  set owner_id = '<YOUR-UID>' where owner_id is null;
--   update students set owner_id = '<YOUR-UID>' where owner_id is null;
--   update events   set owner_id = '<YOUR-UID>' where owner_id is null;
--   alter table classes  alter column owner_id set not null,
--                        alter column owner_id set default auth.uid();
--   alter table students alter column owner_id set not null,
--                        alter column owner_id set default auth.uid();
--   alter table events   alter column owner_id set not null,
--                        alter column owner_id set default auth.uid();
--
--   -- 2. Move settings to one row per owner (old table had a single id='app').
--   alter table settings add column if not exists owner_id uuid;
--   update settings set owner_id = '<YOUR-UID>' where owner_id is null;
--   alter table settings drop constraint settings_pkey;
--   alter table settings drop column if exists id;
--   alter table settings add primary key (owner_id);
--   alter table settings alter column owner_id set default auth.uid();
--
--   -- 3. Convert text ids to uuid (ONLY if existing ids are valid UUID
--   --    strings; slug ids like 'period-1' must be remapped first).
--   alter table events   alter column class_id type uuid using class_id::uuid;
--   alter table students alter column class_id type uuid using class_id::uuid;
--   alter table classes  alter column id       type uuid using id::uuid;
--
--   -- 4. Re-run the "owner all" policy block above.
-- ----------------------------------------------------------------------------
```

- [ ] **Step 3: Static sanity check of the SQL**

Run: `grep -c "owner_id" supabase/schema.sql`
Expected: a count of at least `12` (owner_id appears in each table def, indexes, and policy).

Run: `grep -n "using (owner_id = auth.uid()) with check (owner_id = auth.uid())" supabase/schema.sql`
Expected: one match inside the policy `do $$` block.

Run: `grep -n "ALL RLS TESTS PASSED" supabase/rls_test.sql`
Expected: one match (final success line).

- [ ] **Step 4: Run the isolation test in Supabase (user-run)**

This step is performed by the user in their Supabase project (Claude cannot create the project/accounts). Instructions to hand off:
1. In the Supabase SQL editor, run `supabase/schema.sql` once.
2. Then run `supabase/rls_test.sql`.
Expected: the query returns a single row `result = ALL RLS TESTS PASSED` and no error. Any `assert` failure aborts with the assertion's message (that would be a real isolation bug to fix before shipping).

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql supabase/rls_test.sql
git commit -m "feat: owner-scoped multi-tenant schema, RLS, and isolation test"
```

---

### Task 2: Per-owner settings in the Supabase store

Move the settings row from a single fixed `id='app'` to one row per teacher, keyed by `owner_id`. This is the only data-layer code change.

**Files:**
- Modify: `src/data/supabaseStore.ts`

**Interfaces:**
- Consumes: `settings` table keyed by `owner_id` (Task 1); `supabase-js` client from `getSupabaseClient()`; `Settings` type (`{ schoolYearStart: string }`).
- Produces: no new exported symbols. Internally adds a memoized `ownerId(): Promise<string>` helper used only by `saveSettings`.

- [ ] **Step 1: Add a memoized owner-id resolver inside `createSupabaseStore`**

In `src/data/supabaseStore.ts`, find the start of the factory (currently lines 97-99):

```ts
export function createSupabaseStore(): DataStore {
  const sb = getSupabaseClient();

  return {
```

Replace it with:

```ts
export function createSupabaseStore(): DataStore {
  const sb = getSupabaseClient();

  // The current teacher's auth uid, resolved once and reused. Needed only so the
  // per-owner settings row can be upserted with an explicit conflict target;
  // all other tables get owner_id from the DB default and are scoped by RLS.
  let ownerIdPromise: Promise<string> | null = null;
  function ownerId(): Promise<string> {
    if (!ownerIdPromise) {
      ownerIdPromise = sb.auth.getUser().then(({ data, error }) => {
        if (error || !data.user) {
          ownerIdPromise = null; // allow a retry after re-auth
          throw new Error(`Supabase get user failed: ${error?.message ?? "no session"}`);
        }
        return data.user.id;
      });
    }
    return ownerIdPromise;
  }

  return {
```

- [ ] **Step 2: Scope the settings read to the owner**

Find the settings line inside `loadAll` (currently line 106):

```ts
        sb.from("settings").select("*").eq("id", "app").maybeSingle(),
```

Replace it with (RLS returns only this owner's row, so no `id` filter):

```ts
        sb.from("settings").select("*").maybeSingle(),
```

- [ ] **Step 3: Upsert settings keyed by owner**

Find `saveSettings` (currently lines 153-158):

```ts
    async saveSettings(s: Settings) {
      const { error } = await sb
        .from("settings")
        .upsert({ id: "app", school_year_start: s.schoolYearStart });
      check(error, "save settings");
    },
```

Replace it with:

```ts
    async saveSettings(s: Settings) {
      const owner_id = await ownerId();
      const { error } = await sb
        .from("settings")
        .upsert({ owner_id, school_year_start: s.schoolYearStart }, { onConflict: "owner_id" });
      check(error, "save settings");
    },
```

(`importAll` already calls `this.saveSettings(data.settings)`, and its `delete().neq("id","")` calls are scoped to the caller by RLS, so no other change is needed there.)

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: PASS — no TypeScript errors, Vite build completes. In particular no error about the removed `.eq("id","app")` or the `onConflict` option.

- [ ] **Step 5: Commit**

```bash
git add src/data/supabaseStore.ts
git commit -m "feat: key Supabase settings row per owner instead of a single app row"
```

---

### Task 3: UUID class ids in the seed

Give the seeded demo class a globally-unique UUID id so it never PK-collides across teachers.

**Files:**
- Modify: `src/data/seed.ts`

**Interfaces:**
- Consumes: `newId()` from `src/utils/id.ts` (already imported in this file).
- Produces: `buildSeedData()` unchanged signature; the seeded class id is now a UUID string instead of `"period-1"`.

- [ ] **Step 1: Replace the fixed slug id with a UUID**

In `src/data/seed.ts`, find (currently line 27):

```ts
  const classId = "period-1";
```

Replace it with:

```ts
  const classId = newId();
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Verify the seed still loads in local mode (optional, browser)**

If a preview is convenient: start the dev server (`preview_start` with the project's dev config), open the app with no `.env` (local mode), and confirm the seating chart shows the "Period 1" demo class with the 12 demo students. This exercises `buildSeedData()` through `localStore`. Skip if not running previews.

- [ ] **Step 4: Commit**

```bash
git add src/data/seed.ts
git commit -m "feat: use a UUID id for the seeded demo class"
```

---

### Task 4: Self-service sign-up with email confirmation

Add a Sign in / Sign up toggle to the login screen and a "check your email" confirmation state.

**Files:**
- Modify: `src/components/LoginScreen.tsx` (full rewrite)

**Interfaces:**
- Consumes: `getSupabaseClient()` and its `auth.signUp` / `auth.signInWithPassword`. `useAuth`'s `onAuthStateChange` (unchanged) swaps in the app once a session exists.
- Produces: default-exported `LoginScreen` component (same export; richer UI).

- [ ] **Step 1: Rewrite the login screen**

Replace the entire contents of `src/components/LoginScreen.tsx` with:

```tsx
import { useState, type FormEvent } from "react";
import { getSupabaseClient } from "../data/supabaseClient";

type Mode = "signin" | "signup";

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sb = getSupabaseClient();

    if (mode === "signup") {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else if (!data.session) {
        // Email confirmation is on: no session until the emailed link is clicked.
        setConfirmSent(true);
      }
      // If a session exists (confirmation disabled), useAuth swaps in the app.
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      // On success, useAuth's onAuthStateChange swaps in the app.
    }
    setBusy(false);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setConfirmSent(false);
  }

  if (confirmSent) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
          <h1 className="text-2xl font-bold">Check your email</h1>
          <p className="text-sm text-gray-600">
            We sent a confirmation link to{" "}
            <span className="font-medium">{email}</span>. Click it to activate your
            account, then sign in.
          </p>
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className="w-full rounded bg-blue-500 px-4 py-2 text-white"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  const isSignup = mode === "signup";

  return (
    <div className="flex min-h-full items-center justify-center bg-gray-100 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
      >
        <div>
          <h1 className="text-2xl font-bold">ICOT</h1>
          <p className="text-sm text-gray-500">
            {isSignup ? "Create your teacher account." : "Sign in to continue."}
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            className="mt-1 w-full rounded border p-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700">Password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={isSignup ? "new-password" : "current-password"}
            className="mt-1 w-full rounded border p-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-blue-500 px-4 py-2 text-white disabled:opacity-60"
        >
          {busy
            ? isSignup
              ? "Creating account…"
              : "Signing in…"
            : isSignup
              ? "Sign up"
              : "Sign in"}
        </button>

        <p className="text-center text-sm text-gray-600">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="font-medium text-blue-600 underline"
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button
                type="button"
                className="font-medium text-blue-600 underline"
                onClick={() => switchMode("signup")}
              >
                Create an account
              </button>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/LoginScreen.tsx
git commit -m "feat: add self-service sign-up with email confirmation to login screen"
```

(Live UI verification requires a configured Supabase project and is covered by the manual checklist in Final Verification — the login screen only renders in Supabase mode.)

---

### Task 5: Documentation

Update the README and `.env.example` to describe the multi-teacher model and drop the "keep sign-ups disabled" guidance.

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: the behavior established in Tasks 1-4.
- Produces: no code.

- [ ] **Step 1: Update the account-creation step in the README**

In `README.md`, find (around line 74):

```markdown
3. **Create your account.** Go to **Authentication → Users → Add user**, and set
   your email + a password. Then, under **Authentication → Providers → Email**,
   **turn OFF "Allow new users to sign up"** so yours is the only account.
```

Replace it with:

```markdown
3. **Enable teacher sign-ups.** Under **Authentication → Providers → Email**,
   keep **"Allow new users to sign up" ON** and **"Confirm email" ON**. Each
   teacher creates their own account from the app's **Sign up** form and clicks
   the confirmation link before signing in. (Supabase's built-in email sender is
   rate-limited and meant for low volume — configure custom SMTP under
   **Authentication → Emails** if you expect many sign-ups.)
```

- [ ] **Step 2: Update the sign-in step wording in the README**

In `README.md`, find (around line 85):

```markdown
6. Restart `npm run dev`. You'll get a **sign-in screen**; log in with the account
   from step 3. The header badge switches from **💾 Local** to **☁ Cloud**, and on
   first run with empty tables the demo data is seeded. Sign out from **Settings →
   Account**.
```

Replace it with:

```markdown
6. Restart `npm run dev`. You'll get a **sign-in / sign-up screen**; create an
   account (or sign in). The header badge switches from **💾 Local** to
   **☁ Cloud**, and on each teacher's first sign-in their own demo data is seeded.
   Sign out from **Settings → Account**.
```

- [ ] **Step 3: Rewrite the security blockquote in the README**

In `README.md`, find (around lines 93-95):

```markdown
> The anon key is public (it ships in the bundle) — safe here because RLS blocks
> everyone except your logged-in account. Keep sign-ups disabled. (For multiple
> teachers you'd add an `owner_id` column and scope policies to `auth.uid()`.)
```

Replace it with:

```markdown
> The anon key is public (it ships in the bundle) — safe because RLS scopes every
> row to its owner (`owner_id = auth.uid()`), so each teacher can read/write only
> their own classes, students, and events. Sign-ups are open with email
> confirmation; a new teacher gets their own seeded demo class on first sign-in.
```

- [ ] **Step 4: Note multi-teacher isolation in `.env.example`**

Replace the entire contents of `.env.example` with:

```
# Copy to ".env" and fill in to enable Supabase cloud sync + multi-teacher login.
# Each teacher signs up for their own account and sees only their own students
# (enforced by Row Level Security). Leave unset to run in local (browser
# localStorage) mode.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 5: Verify docs reference the new model**

Run: `grep -n "Allow new users to sign up\" ON\|owner_id = auth.uid()\|multi-teacher" README.md .env.example`
Expected: matches in both files; no remaining "turn OFF" / "Keep sign-ups disabled" text.

Run: `grep -n "Keep sign-ups disabled\|turn OFF" README.md`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add README.md .env.example
git commit -m "docs: describe multi-teacher sign-up and owner-scoped RLS"
```

---

## Final Verification (after all tasks)

- [ ] **Whole-project build**

Run: `npm run build`
Expected: PASS (tsc + Vite).

- [ ] **RLS isolation test (user-run in Supabase)**

Run `supabase/schema.sql` then `supabase/rls_test.sql` in the Supabase SQL editor.
Expected: `ALL RLS TESTS PASSED`, no assertion error.

- [ ] **Manual two-account checklist (user-run; Claude cannot create accounts or enter passwords)**

1. Create Teacher A via the app's **Sign up** form; confirm A's email; sign in.
2. Confirm A gets the demo seed; add/rename a distinctive student (e.g. "ZZ Test A").
3. Sign out. Create Teacher B; confirm; sign in.
4. Confirm B gets a **fresh** demo seed and does **not** see "ZZ Test A" or any of A's classes.
5. Set a different **School year** start as B; sign back in as A; confirm A's school-year start is unchanged (per-owner settings).

## Spec Coverage Map

- Schema `owner_id` + owner-scoped RLS → Task 1.
- UUID class ids (fix PK collision) → Task 1 (uuid columns) + Task 3 (seed value).
- Per-owner settings model → Task 1 (schema) + Task 2 (store).
- Per-user seeding verified → Task 3 Step 3 + Final Verification manual checklist.
- Sign-up flow + re-enable Supabase sign-ups + email confirmation → Task 4 + Task 5.
- Migration for existing single-tenant DB → Task 1 Step 2 (documented UPGRADING block).
- README security notes updated → Task 5.
- End-to-end two-account verification → `rls_test.sql` (Task 1) + manual checklist (Final Verification).
- Seat-layout editor coordination → out of scope here; per-owner settings (Task 1/2) means each teacher gets their own layout when that feature lands (noted in spec).
