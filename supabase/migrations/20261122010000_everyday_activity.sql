-- Additive (new column with a default); safe to apply before the app change.
alter table public.profiles add column everyday_activity text not null default 'sedentary' check (everyday_activity in ('sedentary','moderate','active'));
