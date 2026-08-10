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
  school_year_start date not null,
  seat_layout       jsonb
);

-- If upgrading an existing database, add the layout column:
alter table settings add column if not exists seat_layout jsonb;

-- Security: the anon key is PUBLIC (it ships in the client bundle), so access is
-- controlled by Row Level Security. Only SIGNED-IN users can read/write; the
-- public (anon) role gets nothing. Because this is a single-teacher app, any
-- authenticated user has full access — keep public sign-ups DISABLED in
-- Authentication → Providers so only your one account exists. (For multi-teacher
-- use you'd add an owner_id column and scope policies to auth.uid().)
alter table classes  enable row level security;
alter table students enable row level security;
alter table events   enable row level security;
alter table settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['classes', 'students', 'events', 'settings'] loop
    -- Remove any earlier permissive anon policy.
    execute format('drop policy if exists "anon all" on %I;', t);
    execute format('drop policy if exists "authenticated all" on %I;', t);
    execute format(
      'create policy "authenticated all" on %I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
