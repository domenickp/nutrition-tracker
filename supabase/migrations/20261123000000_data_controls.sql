-- Data controls (epic nt-gc4): purge and import functions for "Your data" in Settings.
-- Additive (two new functions, no table changes); safe to apply before merging the app change.
-- Both run as the caller (security invoker), so row-level security still applies.

create function public.purge_my_data() returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  -- Children first (food_logs reference foods).
  delete from public.food_logs where user_id = auth.uid();
  delete from public.water_logs where user_id = auth.uid();
  delete from public.weights where user_id = auth.uid();
  delete from public.daily_activity where user_id = auth.uid();
  delete from public.workouts where user_id = auth.uid();
  delete from public.exercise_categories where user_id = auth.uid();
  delete from public.target_suggestions where user_id = auth.uid();
  delete from public.foods where user_id = auth.uid();
  delete from public.profiles where user_id = auth.uid();
end;
$$;

create function public.import_my_data(payload jsonb) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  total integer := 0;
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  if exists (select 1 from public.profiles where user_id = auth.uid())
     or exists (select 1 from public.weights where user_id = auth.uid())
     or exists (select 1 from public.foods where user_id = auth.uid())
     or exists (select 1 from public.food_logs where user_id = auth.uid())
     or exists (select 1 from public.water_logs where user_id = auth.uid())
     or exists (select 1 from public.daily_activity where user_id = auth.uid())
     or exists (select 1 from public.workouts where user_id = auth.uid())
     or exists (select 1 from public.exercise_categories where user_id = auth.uid())
     or exists (select 1 from public.target_suggestions where user_id = auth.uid())
  then
    raise exception 'account not empty';
  end if;

  -- Parents first: profiles, foods, then food_logs and the rest. user_id is always the caller.
  insert into public.profiles
    select (r).* from (
      select jsonb_populate_record(null::public.profiles, e || jsonb_build_object('user_id', auth.uid())) as r
      from jsonb_array_elements(coalesce(payload -> 'profiles', '[]'::jsonb)) e
    ) s;
  get diagnostics n = row_count; total := total + n;

  insert into public.foods
    select (r).* from (
      select jsonb_populate_record(null::public.foods, e || jsonb_build_object('user_id', auth.uid())) as r
      from jsonb_array_elements(coalesce(payload -> 'foods', '[]'::jsonb)) e
    ) s;
  get diagnostics n = row_count; total := total + n;

  insert into public.food_logs
    select (r).* from (
      select jsonb_populate_record(null::public.food_logs, e || jsonb_build_object('user_id', auth.uid())) as r
      from jsonb_array_elements(coalesce(payload -> 'food_logs', '[]'::jsonb)) e
    ) s;
  get diagnostics n = row_count; total := total + n;

  insert into public.weights
    select (r).* from (
      select jsonb_populate_record(null::public.weights, e || jsonb_build_object('user_id', auth.uid())) as r
      from jsonb_array_elements(coalesce(payload -> 'weights', '[]'::jsonb)) e
    ) s;
  get diagnostics n = row_count; total := total + n;

  insert into public.water_logs
    select (r).* from (
      select jsonb_populate_record(null::public.water_logs, e || jsonb_build_object('user_id', auth.uid())) as r
      from jsonb_array_elements(coalesce(payload -> 'water_logs', '[]'::jsonb)) e
    ) s;
  get diagnostics n = row_count; total := total + n;

  insert into public.daily_activity
    select (r).* from (
      select jsonb_populate_record(null::public.daily_activity, e || jsonb_build_object('user_id', auth.uid())) as r
      from jsonb_array_elements(coalesce(payload -> 'daily_activity', '[]'::jsonb)) e
    ) s;
  get diagnostics n = row_count; total := total + n;

  insert into public.workouts
    select (r).* from (
      select jsonb_populate_record(null::public.workouts, e || jsonb_build_object('user_id', auth.uid())) as r
      from jsonb_array_elements(coalesce(payload -> 'workouts', '[]'::jsonb)) e
    ) s;
  get diagnostics n = row_count; total := total + n;

  insert into public.exercise_categories
    select (r).* from (
      select jsonb_populate_record(null::public.exercise_categories, e || jsonb_build_object('user_id', auth.uid())) as r
      from jsonb_array_elements(coalesce(payload -> 'exercise_categories', '[]'::jsonb)) e
    ) s;
  get diagnostics n = row_count; total := total + n;

  insert into public.target_suggestions
    select (r).* from (
      select jsonb_populate_record(null::public.target_suggestions, e || jsonb_build_object('user_id', auth.uid())) as r
      from jsonb_array_elements(coalesce(payload -> 'target_suggestions', '[]'::jsonb)) e
    ) s;
  get diagnostics n = row_count; total := total + n;

  return total;
end;
$$;

revoke all on function public.purge_my_data() from public, anon;
grant execute on function public.purge_my_data() to authenticated;
revoke all on function public.import_my_data(jsonb) from public, anon;
grant execute on function public.import_my_data(jsonb) to authenticated;
