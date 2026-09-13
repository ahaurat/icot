-- Splits students.name into first_name/last_name. New rosters already carry
-- comma-delimited "Last, First" cells (see src/data/rosterImport.ts); existing
-- rows are backfilled by treating everything before the first space as the
-- first name and everything after as the last name (e.g. "Oscar Mario Lopez"
-- -> first_name "Oscar", last_name "Mario Lopez").
alter table students add column if not exists first_name text;
alter table students add column if not exists last_name text;

update students set
  first_name = split_part(trim(name), ' ', 1),
  last_name  = trim(substring(trim(name) from length(split_part(trim(name), ' ', 1)) + 1))
where first_name is null;

alter table students alter column first_name set not null;
alter table students alter column last_name set not null;
alter table students drop column name;
