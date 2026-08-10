-- ICOT: migrate an EXISTING single-tenant database to the multi-teacher model.
--
-- Transforms the old schema (text class ids, a single settings row id='app',
-- "authenticated all" RLS) into the owner-scoped schema in schema.sql:
--   * remaps non-UUID class ids (e.g. the original 'period-1' demo class) to
--     real UUIDs, updating students.class_id and events.class_id to match,
--     then converts those columns text -> uuid;
--   * adds owner_id to classes/students/events, backfills every existing row to
--     YOUR teacher account, and locks it down (not null + default auth.uid());
--   * repoints settings from the single id='app' row to one row per owner_id;
--   * replaces the permissive policy with owner-scoped RLS.
--
-- SAFE TO RUN:
--   * Wrapped in one transaction — any error rolls the WHOLE thing back.
--   * Re-runnable — the type-conversion and settings steps are guarded and
--     no-op once already applied.
--
-- BEFORE RUNNING:
--   1. Take a backup (Supabase dashboard, or the app's Export backup).
--   2. Run this on your DEV project (icot-dev) first, ideally after importing a
--      prod backup so the rehearsal is representative. Then run on prod during a
--      break, never mid-semester.
--   3. Paste your teacher account's UID below (Authentication -> Users -> copy id).
--   4. After it succeeds, run supabase/rls_test.sql to confirm isolation.

begin;

-- ---- 0. Your teacher UID (owns all existing rows) --------------------------
select set_config('app.owner_uid', 'PASTE-YOUR-TEACHER-UID-HERE', true);

do $$
declare v text := current_setting('app.owner_uid', true);
begin
  if v is null or v = '' or v = 'PASTE-YOUR-TEACHER-UID-HERE' then
    raise exception 'Set app.owner_uid (line above) to your teacher UID first.';
  end if;
  if not exists (select 1 from auth.users where id = v::uuid) then
    raise exception 'app.owner_uid % is not an existing auth user.', v;
  end if;
end $$;

-- ---- 1. Remap non-UUID class ids and convert id columns to uuid ------------
-- Runs only while classes.id is still text (so re-running after success is a
-- no-op). The map covers every non-uuid id found on ANY of the three columns,
-- so orphaned events.class_id values still convert cleanly.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'classes'
        and column_name = 'id') = 'text' then

    -- Drop the students.class_id FK (whatever it is named) so both sides of the
    -- relationship can be rewritten, then re-add it after the type change.
    execute coalesce((
      select string_agg(format('alter table students drop constraint %I;', conname), ' ')
      from pg_constraint
      where conrelid = 'public.students'::regclass and contype = 'f'
        and conkey = array[(select attnum from pg_attribute
                            where attrelid = 'public.students'::regclass
                              and attname = 'class_id')]
    ), 'select 1;');

    create temporary table _class_id_map on commit drop as
      select old_id, gen_random_uuid()::text as new_id
      from (
        select id       as old_id from classes
        union
        select class_id as old_id from students
        union
        select class_id as old_id from events
      ) s
      where old_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

    update classes  c set id       = m.new_id from _class_id_map m where c.id       = m.old_id;
    update students s set class_id = m.new_id from _class_id_map m where s.class_id = m.old_id;
    update events   e set class_id = m.new_id from _class_id_map m where e.class_id = m.old_id;

    alter table classes  alter column id       type uuid using id::uuid;
    alter table students alter column class_id type uuid using class_id::uuid;
    alter table events   alter column class_id type uuid using class_id::uuid;

    alter table students
      add constraint students_class_id_fkey
      foreign key (class_id) references classes(id) on delete cascade;
  end if;
end $$;

-- ---- 2. owner_id on the data tables ---------------------------------------
alter table classes  add column if not exists owner_id uuid;
alter table students add column if not exists owner_id uuid;
alter table events   add column if not exists owner_id uuid;

update classes  set owner_id = current_setting('app.owner_uid')::uuid where owner_id is null;
update students set owner_id = current_setting('app.owner_uid')::uuid where owner_id is null;
update events   set owner_id = current_setting('app.owner_uid')::uuid where owner_id is null;

alter table classes  alter column owner_id set not null, alter column owner_id set default auth.uid();
alter table students alter column owner_id set not null, alter column owner_id set default auth.uid();
alter table events   alter column owner_id set not null, alter column owner_id set default auth.uid();

-- ---- 3. settings: single id='app' row -> one row per owner ----------------
alter table settings add column if not exists seat_layout jsonb;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'settings'
               and column_name = 'id') then
    alter table settings add column if not exists owner_id uuid;
    update settings set owner_id = current_setting('app.owner_uid')::uuid where owner_id is null;
    alter table settings drop constraint if exists settings_pkey;
    alter table settings drop column id;
    alter table settings add primary key (owner_id);
    alter table settings alter column owner_id set default auth.uid();
  end if;
end $$;

-- ---- 4. Owner-scoped RLS (replaces "authenticated all") -------------------
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
      || 'using (owner_id = auth.uid()) with check (owner_id = auth.uid());', t);
  end loop;
end $$;

-- ---- 5. Indexes -----------------------------------------------------------
create index if not exists classes_owner_idx  on classes  (owner_id);
create index if not exists students_owner_idx on students (owner_id);
create index if not exists students_class_idx on students (class_id);
create index if not exists events_owner_idx   on events   (owner_id);
create index if not exists events_student_idx on events   (student_id);
create index if not exists events_class_idx   on events   (class_id);

-- ---- 6. Verify before committing (aborts the whole migration on failure) ---
do $$
begin
  assert (select data_type from information_schema.columns
          where table_schema='public' and table_name='classes' and column_name='id') = 'uuid',
         'classes.id did not convert to uuid';
  assert not exists (select 1 from classes  where owner_id is null), 'classes.owner_id has nulls';
  assert not exists (select 1 from students where owner_id is null), 'students.owner_id has nulls';
  assert not exists (select 1 from events   where owner_id is null), 'events.owner_id has nulls';
  assert not exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='settings' and column_name='id'),
         'settings.id column still present';
  assert (select count(*) from pg_policies
          where schemaname='public' and policyname='owner all') = 4,
         'expected the "owner all" policy on all four tables';
end $$;

commit;

-- After COMMIT, sanity-check (safe, read-only):
--   select tablename, policyname from pg_policies where schemaname='public' order by tablename;
--   select count(*) as classes, (select count(*) from students) as students,
--          (select count(*) from events) as events from classes;
-- Then run supabase/rls_test.sql and expect: ALL RLS TESTS PASSED.
