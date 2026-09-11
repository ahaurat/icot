# Supabase Migration Automation — Design Spec

## Purpose

Schema changes to `supabase/schema.sql` currently ship by hand: paste the whole
file into the Supabase SQL editor. Frontend changes already auto-deploy via
Vercel on push to `main`; this brings the database up to the same level —
schema changes become CLI-managed migration files, deployed by a GitHub
Action, without ever pasting SQL into a dashboard again (except for
first-time project bootstrap, which stays manual — see below).

Two Supabase projects exist in practice: **production** (backs the deployed
app) and an optional **dev** project (backs `npm run dev:cloud`, for testing
cloud-only bugs locally without touching real student data). Both get
migration automation; both stay behind a manual trigger — nothing runs
without a human clicking "Run workflow".

## Repo structure changes

- **`supabase/config.toml`** — new, created via `supabase init` (or
  hand-written if the CLI isn't available when this is implemented; its
  content is a static default either way and coexists fine with the existing
  `supabase/*.sql` files).
- **`supabase/migrations/<timestamp>_initial_schema.sql`** — new. The
  baseline migration, hand-copied from the current contents of
  `supabase/schema.sql` (not generated via `supabase db pull`). This is the
  first migration file and represents "everything that's already live in
  both projects."
- **`supabase/schema.sql`** — kept, not deleted. Gets a header comment
  replacing "Run once in the Supabase SQL editor" with something like: *this
  is the historical/bootstrap script for a brand-new project with no
  migration history yet (see `supabase/migrations/` for the current,
  authoritative schema and how it's evolved)*. It is **not** kept in sync
  with future migrations — updating it on every schema change would
  reintroduce the manual-paste burden this work removes. It stays useful
  specifically for standing up a new project (e.g. a replacement dev
  project) by hand, without needing the CLI.
- **`supabase/migrate_to_multi_tenant.sql`**, **`supabase/rls_test.sql`** —
  untouched. Out of scope; the former is a historical one-off, the latter a
  manual verification script.
- **`.github/workflows/supabase-migrate.yml`** — new. See below.

## Baseline reconciliation (one-time, done by the user locally, not by CI)

Because the baseline migration is hand-written (not pulled from the live
database), the Supabase CLI has no way to know production and dev already
have this schema applied — it would try to run `create table` against tables
that already exist. After linking each project locally, mark the baseline as
already-applied:

```
supabase link --project-ref <prod-ref>
supabase migration repair --status applied <baseline-version>

supabase link --project-ref <dev-ref>
supabase migration repair --status applied <baseline-version>
```

This is a manual, one-time step per project (prod and dev), run once when
this system is first set up. It is not part of the ongoing workflow.

## The GitHub Action

**One workflow**, `.github/workflows/supabase-migrate.yml`, triggered only by
`workflow_dispatch` with a required input:

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: "Which Supabase project to migrate"
        required: true
        type: choice
        options: [production, dev]
```

Steps: checkout → `supabase/setup-cli` → `supabase link` → `supabase db
push`, where the project ref and DB password are selected based on the
`environment` input (e.g. via `${{ inputs.environment == 'production' &&
secrets.SUPABASE_PROD_PROJECT_REF || secrets.SUPABASE_DEV_PROJECT_REF }}`, or
equivalently a small `env:` block keyed off the input).

No `push:` trigger, no `paths:` filter — a schema change never applies
automatically just because code merged to `main`. A human always explicitly
picks a target environment and clicks "Run workflow" in the Actions tab
after reviewing the diff.

### Secrets (added by the user in GitHub repo settings; never written to any file in this repo)

- `SUPABASE_ACCESS_TOKEN` — shared across both projects (account-level token
  from https://supabase.com/dashboard/account/tokens).
- `SUPABASE_PROD_PROJECT_REF`, `SUPABASE_PROD_DB_PASSWORD`
- `SUPABASE_DEV_PROJECT_REF`, `SUPABASE_DEV_DB_PASSWORD`

## Going-forward workflow for a schema change

1. `supabase migration new <name>` — creates a new timestamped file under
   `supabase/migrations/`.
2. Hand-edit the generated SQL.
3. Test it: run the workflow with `environment: dev` (or run `supabase db
   push` locally against the dev project, if the CLI is set up locally) and
   verify against `npm run dev:cloud`.
4. Merge the migration file to `main` through the normal PR flow — this does
   **not** touch the database by itself, only ships the file.
5. When ready, manually run the workflow with `environment: production`.

## README updates

- **"Enabling Supabase"** section stays as-is for first-time bootstrap of a
  brand-new project (paste `supabase/schema.sql` into the SQL editor) — a
  project with zero migration history still needs something run against it
  once, and not everyone will have the Supabase CLI installed.
- **"Local development vs. production data"** section (the dev/cloud project
  setup instructions) gets a note that once this system is in place, step 2
  ("Run `supabase/schema.sql` in its SQL editor") can alternatively be done
  by running the migration workflow with `environment: dev` after the
  project is linked and baselined.
- New section describing the automated flow above (migration files → test
  against dev → manually run against production), replacing "paste SQL by
  hand" as the primary path for any schema change *after* initial setup.

## Out of scope

- Any `push`-triggered or `paths`-filtered automatic run — everything stays
  manual (`workflow_dispatch`) per the trigger-safety decision.
- Rewriting or deleting `supabase/schema.sql`'s content — it's frozen as a
  bootstrap artifact, not deleted or auto-generated.
- `supabase/migrate_to_multi_tenant.sql` and `supabase/rls_test.sql`.
- Any change to how Vercel deploys the frontend.
- Using `supabase db pull` for the baseline (explicitly decided against —
  hand-written from `schema.sql` instead).
