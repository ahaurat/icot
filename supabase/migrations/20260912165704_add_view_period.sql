-- Adds the viewPeriod setting: lets a teacher switch the standing Totals
-- column between "whole year" and a custom start/end range, so counts can
-- restart for a new term without losing history. See PR "Add print reports
-- and Totals timeframe switch".
alter table settings add column if not exists view_period jsonb;
