-- Performance-only change: the access rules are identical to before.
-- Safe to apply at any time.
--
-- Fixes the Supabase performance advisor lint `auth_rls_initplan`: calling
-- auth.uid() directly in a policy re-evaluates it for every row. Wrapping it
-- as (select auth.uid()) lets Postgres evaluate it once per statement.
-- See https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- ALTER POLICY (not drop + create) so there is never a moment without a policy.
-- Column defaults (default auth.uid()) and the purge_my_data / import_my_data
-- function bodies are intentionally left alone; the advisor only flags policies.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'weights', 'foods', 'food_logs', 'water_logs',
    'daily_activity', 'workouts', 'exercise_categories', 'target_suggestions'
  ]
  loop
    execute format(
      'alter policy %I on public.%I
         using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format(
      'alter policy %I on public.%I
         with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format(
      'alter policy %I on public.%I
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format(
      'alter policy %I on public.%I
         using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end;
$$;
