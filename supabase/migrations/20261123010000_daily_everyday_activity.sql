-- Additive and nullable (no default); safe to apply before merging the app change.
-- Null means "use the Settings everyday activity".
alter table public.daily_activity add column everyday_activity text check (everyday_activity is null or everyday_activity in ('sedentary','moderate','active'));
