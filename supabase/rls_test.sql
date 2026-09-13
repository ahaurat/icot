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
insert into students (id, class_id, first_name, last_name, seat_index, active)
  values ('a2222222-2222-2222-2222-222222222222',
          'a1111111-1111-1111-1111-111111111111', 'Alice', '', 0, true);
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
insert into students (id, class_id, first_name, last_name)
  values ('b2222222-2222-2222-2222-222222222222',
          'b1111111-1111-1111-1111-111111111111', 'Bob', '');
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
  assert (select first_name from students) = 'Bob', 'B should see only B''s student';
  assert (select category_key from events) = 'cellphone', 'B should see only B''s event';
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
  exception when insufficient_privilege then
    rejected := true;  -- expected: RLS with check violation (SQLSTATE 42501)
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
  assert (select first_name from students) = 'Alice', 'A should see only A''s student';
  assert (select category_key from events) = 'bathroom', 'A should see only A''s event';
  assert (select school_year_start from settings) = date '2026-08-01',
         'A should see only A''s settings';
end $$;

reset role;
select 'ALL RLS TESTS PASSED' as result;

rollback;
