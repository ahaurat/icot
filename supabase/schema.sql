-- ICOT Supabase schema.
-- Run this once in the Supabase SQL editor to enable cloud sync, then set
-- VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.

create table if not exists classes (
  id          text primary key,
  name        text not null,
  seat_rows   int  not null default 6,
  seat_cols   int  not null default 6,
  archived_at timestamptz
);

-- If upgrading an existing database, add the archive column:
alter table classes add column if not exists archived_at timestamptz;

create table if not exists students (
  id         uuid primary key,
  class_id   text not null references classes(id) on delete cascade,
  name       text not null,
  seat_index int,
  active     boolean not null default true
);

create table if not exists events (
  id               uuid primary key,
  student_id       uuid not null references students(id) on delete cascade,
  class_id         text not null,
  category_key     text not null,
  type             text not null,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  duration_seconds int,
  open             boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists events_student_idx on events (student_id);
create index if not exists events_class_idx   on events (class_id);

create table if not exists settings (
  id                text primary key default 'app',
  school_year_start date not null
);

-- This is a single-teacher app that talks to Supabase with the public anon key,
-- so we use permissive policies. (Anyone with the anon key can read/write — fine
-- for a personal classroom tool. Add Supabase Auth + per-user policies if you
-- ever need multi-user isolation.)
alter table classes  enable row level security;
alter table students enable row level security;
alter table events   enable row level security;
alter table settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['classes', 'students', 'events', 'settings'] loop
    execute format('drop policy if exists "anon all" on %I;', t);
    execute format(
      'create policy "anon all" on %I for all to anon using (true) with check (true);', t
    );
  end loop;
end $$;
