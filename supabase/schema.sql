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
  id          uuid primary key,
  owner_id    uuid not null default auth.uid(),
  class_id    uuid not null references classes(id) on delete cascade,
  name        text not null,
  seat_index  int,
  active      boolean not null default true,
  group_color text
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
  picker_progress   jsonb,
  seating_snapshots jsonb
);

-- Existing deployments: add the columns if the table already exists without them.
alter table settings add column if not exists random_picker      jsonb;
alter table settings add column if not exists picker_progress    jsonb;
alter table settings add column if not exists seating_snapshots  jsonb;
alter table students add column if not exists group_color        text;

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
-- Don't hand-run ALTERs here — real data needs the slug-id remap (e.g. the
-- original 'period-1' class) and the owner_id backfill handled together. Use the
-- dedicated, transactional, re-runnable migration instead:
--     supabase/migrate_to_multi_tenant.sql
-- ----------------------------------------------------------------------------
