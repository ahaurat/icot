-- Adds two columns for the seating chart features (randomize seats, create
-- groups): students.group_color for "Create groups" color-coding, and
-- settings.seating_snapshots for "Randomize seats -> today only"'s overnight
-- revert. See PR "Seating chart: clear picker highlight, randomize seats,
-- create groups".
alter table students add column if not exists group_color text;
alter table settings add column if not exists seating_snapshots jsonb;
