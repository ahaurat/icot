# Supabase Migration Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `supabase/schema.sql` into Supabase-CLI-managed migrations and add a manually-triggered GitHub Action that pushes pending migrations to either the production or dev Supabase project, so schema changes ship without pasting SQL into the Supabase dashboard by hand.

**Architecture:** A `supabase/migrations/` directory becomes the source of truth for schema state, starting from one hand-written baseline file that mirrors what's already live. A single `.github/workflows/supabase-migrate.yml` workflow, triggered only by `workflow_dispatch` with an `environment` choice input (`production`/`dev`), links to the selected project and runs `supabase db push`. `supabase/schema.sql` is kept only as a documented bootstrap path for a brand-new project with no migration history yet.

**Tech Stack:** Supabase CLI (`v2.117.0` at time of writing, invoked via `npx supabase@latest` — no global install required), GitHub Actions (`supabase/setup-cli@v3`, `actions/checkout@v4`).

## Global Constraints

- No `push`-triggered or `paths`-filtered automation — the workflow must only run via `workflow_dispatch`. (Spec: "Trigger safety" / decision 3.)
- `supabase/schema.sql`'s SQL content is not rewritten or deleted — only its header comment changes. (Spec: "Repo structure changes.")
- `supabase/migrate_to_multi_tenant.sql` and `supabase/rls_test.sql` are untouched. (Spec: "Out of scope.")
- No real credential values (access tokens, DB passwords, project refs) are ever written into any file in this repo. (Spec: "Secrets.")
- The baseline migration is hand-copied from `schema.sql`'s current content — not generated via `supabase db pull`. (Spec: "Baseline reconciliation.")

---

### Task 1: Initialize the Supabase CLI project (`config.toml` + gitignore)

**Files:**
- Create: `supabase/config.toml`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a `supabase/` directory recognized by the Supabase CLI as a project root (via `config.toml`), which Task 2's migration file and Task 3's workflow both depend on being present and valid.

- [ ] **Step 1: Generate the config file with the real CLI**

Run (no credentials or Docker required — `init` only writes local files):

```bash
npx --yes supabase@latest init --workdir /Users/adrian/Code/icot/.claude/worktrees/pensive-bhaskara-3580b1
```

Expected output: `Finished supabase init.` This creates `supabase/config.toml` (and possibly `supabase/.temp/`, which is a local CLI cache, not committed).

- [ ] **Step 2: Set the project identifier**

Open `supabase/config.toml` and change the generated first `project_id` line (it defaults to the directory's basename, e.g. `project_id = "pensive-bhaskara-3580b1"`) to:

```toml
project_id = "icot"
```

Leave every other line exactly as generated — do not hand-trim the file. It's the CLI's own default template; trimming it risks removing settings the CLI expects to find.

- [ ] **Step 3: Ignore the CLI's local cache directory**

Add a new section to `.gitignore`, after the existing "Local roster files" section:

```gitignore

# Supabase CLI local cache (created by `supabase init`/`link`, never committed)
supabase/.temp/
```

- [ ] **Step 4: Verify config.toml is valid**

Run:

```bash
npx --yes supabase@latest migration list --local --workdir /Users/adrian/Code/icot/.claude/worktrees/pensive-bhaskara-3580b1
```

Expected: the command reaches `Connecting to local database...` and then fails with a `LegacyDbConnectError` (connection refused — there's no local Docker Postgres running, which is expected and fine). This confirms `config.toml` parsed successfully. A `LegacyDbConfigLoadError` instead would mean the TOML is malformed — if you see that, re-check Step 2's edit.

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml .gitignore
git commit -m "Initialize Supabase CLI project config"
```

---

### Task 2: Baseline migration from the current schema

**Files:**
- Create: `supabase/migrations/20260911000000_initial_schema.sql`
- Modify: `supabase/schema.sql:1-9` (header comment only)

**Interfaces:**
- Consumes: `supabase/config.toml` from Task 1 (the CLI must recognize `supabase/migrations/` as the project's migrations directory).
- Produces: the baseline migration file, which Task 3's workflow will push on its first-ever run against each project (a no-op there, since production and dev already have this schema — see the Manual Setup Runbook at the end of this plan for why it won't try to re-create anything).

- [ ] **Step 1: Create the baseline migration file**

Create `supabase/migrations/20260911000000_initial_schema.sql` with exactly this content (the same `create table` / `alter table` / index / RLS statements currently in `supabase/schema.sql:11-88`, with the "run in the SQL editor" instructions and the trailing "UPGRADING" pointer left out since they describe the old hand-run flow, not this migration):

```sql
-- ICOT Supabase schema (multi-teacher) — baseline migration.
-- Mirrors the schema already live in this project as of 2026-09-11, hand-copied
-- from supabase/schema.sql rather than generated via `supabase db pull`.
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
  school_year_start date not null,
  seat_layout       jsonb,
  random_picker     jsonb,
  picker_progress   jsonb
);

-- Existing deployments: add the columns if the table already exists without them.
alter table settings add column if not exists random_picker   jsonb;
alter table settings add column if not exists picker_progress jsonb;

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
```

- [ ] **Step 2: Update `schema.sql`'s header to mark it historical**

In `supabase/schema.sql`, replace lines 1-9:

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
```

with:

```sql
-- ICOT Supabase schema (multi-teacher) — historical bootstrap script.
--
-- This file is NOT kept in sync with schema changes made after 2026-09-11.
-- It exists only to stand up a brand-new Supabase project by hand (paste into
-- the SQL editor) when there's no migration history yet — see README
-- "Enabling Supabase". For the current, authoritative schema and its history,
-- see supabase/migrations/.
--
-- Multi-teacher model: every row is owned by the teacher who created it
-- (owner_id = auth.uid()) and Row Level Security scopes all access to the
-- owner, so teachers never see each other's data. Teachers self-register
-- (Authentication -> Providers -> Email: allow sign-ups + confirm email).
-- See README "Enabling Supabase".
```

Leave the rest of `schema.sql` (lines 10 onward) untouched.

- [ ] **Step 3: Verify the migration SQL matches schema.sql's statements exactly**

Run this diff, which strips comments and blank lines from both files' statement bodies and confirms they're identical:

```bash
grep -v '^\s*--' supabase/schema.sql | sed -n '/^create table if not exists classes/,/^end \$\$;/p' > /tmp/from_schema.sql
grep -v '^\s*--' supabase/migrations/20260911000000_initial_schema.sql | sed -n '/^create table if not exists classes/,/^end \$\$;/p' > /tmp/from_migration.sql
diff /tmp/from_schema.sql /tmp/from_migration.sql
```

Expected: no output (files identical).

- [ ] **Step 4: Verify the CLI still parses cleanly with the new migration present**

```bash
npx --yes supabase@latest migration list --local --workdir /Users/adrian/Code/icot/.claude/worktrees/pensive-bhaskara-3580b1
```

Expected: same as Task 1 Step 4 — reaches `Connecting to local database...` then `LegacyDbConnectError`. No config or migration parse error.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260911000000_initial_schema.sql supabase/schema.sql
git commit -m "Add baseline Supabase migration, mark schema.sql as historical"
```

---

### Task 3: GitHub Actions workflow for manual migration deploys

**Files:**
- Create: `.github/workflows/supabase-migrate.yml`

**Interfaces:**
- Consumes: `supabase/config.toml` and `supabase/migrations/` from Tasks 1-2 (the `supabase db push` step operates on them).
- Consumes secrets (added by the user in GitHub repo settings, not by this task): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROD_PROJECT_REF`, `SUPABASE_PROD_DB_PASSWORD`, `SUPABASE_DEV_PROJECT_REF`, `SUPABASE_DEV_DB_PASSWORD`.
- Produces: a workflow named "Supabase Migrate" runnable from the Actions tab, with an `environment` input (`production`/`dev`).

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/supabase-migrate.yml`:

```yaml
name: Supabase Migrate

on:
  workflow_dispatch:
    inputs:
      environment:
        description: "Which Supabase project to push migrations to"
        required: true
        type: choice
        options:
          - production
          - dev

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v3
        with:
          version: latest

      - name: Link and push migrations
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ inputs.environment == 'production' && secrets.SUPABASE_PROD_DB_PASSWORD || secrets.SUPABASE_DEV_DB_PASSWORD }}
          PROJECT_REF: ${{ inputs.environment == 'production' && secrets.SUPABASE_PROD_PROJECT_REF || secrets.SUPABASE_DEV_PROJECT_REF }}
        run: |
          supabase link --project-ref "$PROJECT_REF"
          supabase db push
```

This mirrors the exact link/push pattern documented by `supabase/setup-cli`'s own README (env vars `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are picked up automatically by the CLI; only `PROJECT_REF` needs to be passed explicitly as a flag).

- [ ] **Step 2: Verify the YAML is syntactically valid**

```bash
npx --yes js-yaml .github/workflows/supabase-migrate.yml
```

Expected: prints the parsed structure (a nested object/array dump) with no error. A syntax error would raise a `YAMLException` instead.

- [ ] **Step 3: Verify the workflow only has a `workflow_dispatch` trigger**

```bash
grep -A2 "^on:" .github/workflows/supabase-migrate.yml
```

Expected output:
```
on:
  workflow_dispatch:
    inputs:
```
Confirming there's no `push:` key anywhere in the file (per the Global Constraints — no auto-trigger):

```bash
grep -c "^\s*push:" .github/workflows/supabase-migrate.yml
```

Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/supabase-migrate.yml
git commit -m "Add manually-triggered Supabase migration workflow"
```

---

### Task 4: README documentation for the new flow

**Files:**
- Modify: `README.md`

**Interfaces:**
- None (documentation only).

- [ ] **Step 1: Add a new section after "Deploy to production (Vercel)"**

In `README.md`, find this line (end of the Vercel section, currently at line 119):

```markdown
> Netlify and Cloudflare Pages work identically (same build/output, same env vars).
```

Insert a new section immediately after it (before the blank line and `## Local development vs. production data`):

```markdown

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
```

- [ ] **Step 2: Cross-reference the workflow from the dev/cloud project setup steps**

In `README.md`, find this line (in "Local development vs. production data", currently line 144):

```markdown
2. Run `supabase/schema.sql` in its SQL editor, same as production.
```

Replace it with:

```markdown
2. Run `supabase/schema.sql` in its SQL editor, same as production. (Once the
   project is linked and baselined — see "Deploying schema changes" above —
   you can instead run the **Supabase Migrate** workflow with `dev` selected.)
```

- [ ] **Step 3: Verify the new section renders as expected**

```bash
grep -n "## Deploying schema changes" README.md
grep -n "Once the" README.md
```

Expected: both greps return one matching line each, confirming both edits landed.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document the Supabase migration workflow in the README"
```

---

## Manual Setup Runbook (user-run, not part of the tasks above)

These steps require credentials only the user holds (a Supabase access token,
and each project's DB password) and touch a live production database — no
agentic worker should run these, and they are not part of Tasks 1-4's
automated verification. Do these once, after Tasks 1-4 are merged:

1. **Create an access token** at
   https://supabase.com/dashboard/account/tokens.

2. **Link and baseline the production project** (run locally, in the repo root):

   ```bash
   npx supabase login
   npx supabase link --project-ref <prod-project-ref>
   npx supabase migration repair 20260911000000 --status applied --linked
   ```

   The `migration repair` call tells the CLI "this migration is already
   applied" without running it — necessary because production already has
   this schema from the original hand-run `schema.sql`. Confirm with:

   ```bash
   npx supabase migration list --linked
   ```

   Expected: `20260911000000` shows as applied on both Local and Remote, with
   no pending migrations.

   Before linking, also run `SHOW server_version;` against the production database
   (via the SQL editor) and confirm its major version matches `supabase/config.toml`'s
   `db.major_version` (currently `17`) — a mismatch causes `supabase link` to emit
   config-drift warnings.

3. **Repeat step 2 for the dev project** (`supabase link --project-ref
   <dev-project-ref>`, then the same `migration repair` and `migration list`
   commands).

4. **Add the GitHub repo secrets** (Settings → Secrets and variables →
   Actions): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROD_PROJECT_REF`,
   `SUPABASE_PROD_DB_PASSWORD`, `SUPABASE_DEV_PROJECT_REF`,
   `SUPABASE_DEV_DB_PASSWORD`.

5. **Do a dry-run test.** Add a trivial, reversible migration (e.g. a
   comment-only change, or an `if not exists` no-op like re-adding an
   existing column) via `npx supabase migration new test_noop`, push it to
   `main`, then run the **Supabase Migrate** workflow against **dev** first,
   then **production**, confirming both succeed with "no changes" or the
   expected no-op before trusting the pipeline with a real schema change.
