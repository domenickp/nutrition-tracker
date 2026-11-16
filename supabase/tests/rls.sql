-- RLS isolation test. Plain SQL, no pgTAP. Run against a database that already has
-- the init migration applied (e.g. `psql -f supabase/tests/rls.sql` on the local
-- Supabase DB). Everything runs in a transaction that is rolled back.
-- Any failure raises an exception; success prints NOTICE lines and "RLS TEST PASSED".

begin;

-- Two users (as the table owner, bypassing RLS).
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

do $$
declare
  a constant text := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  b constant text := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  -- one valid insert per table; %1$L is the user_id to write
  inserts constant text[] := array[
    $i$insert into profiles (user_id, birth_month, birth_year, sex, height_cm, goal, units, timezone)
       values (%1$L, 5, 1990, 'male', 180, 'maintain', 'metric', 'UTC')$i$,
    $i$insert into weights (user_id, date, weight_kg) values (%1$L, '2026-11-16', 80)$i$,
    $i$insert into foods (id, user_id, name, source, base_label, kcal, protein_g, carbs_g, fat_g)
       values (gen_random_uuid(), %1$L, 'Oats', 'manual', '100 g', 380, 13, 66, 7)$i$,
    $i$insert into food_logs (user_id, date, name, quantity, unit_label, kcal, protein_g, carbs_g, fat_g)
       values (%1$L, '2026-11-16', 'Oats', 1, 'servings', 380, 13, 66, 7)$i$,
    $i$insert into water_logs (user_id, date, ml) values (%1$L, '2026-11-16', 250)$i$,
    $i$insert into daily_activity (user_id, date, mode) values (%1$L, '2026-11-16', 'hours')$i$,
    $i$insert into workouts (user_id, id, date, started_at, raw)
       values (%1$L, 'w1', '2026-11-16', now(), '{}')$i$,
    $i$insert into exercise_categories (user_id, exercise_id, name, category)
       values (%1$L, 'e1', 'Run', 'light_cardio')$i$
  ];
  tbls constant text[] := array[
    'profiles', 'weights', 'foods', 'food_logs', 'water_logs',
    'daily_activity', 'workouts', 'exercise_categories'
  ];
  i int;
  n bigint;
begin
  -- RLS must be enabled on every table.
  for i in 1 .. array_length(tbls, 1) loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || tbls[i])::regclass) then
      raise exception 'RLS not enabled on %', tbls[i];
    end if;
  end loop;

  -- User A inserts one row per table, with user_id defaulting from auth.uid().
  perform set_config('request.jwt.claim.sub', a, true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1 .. array_length(tbls, 1) loop
    execute format(inserts[i], a);
    execute format('select count(*) from public.%I', tbls[i]) into n;
    if n <> 1 then raise exception 'A should see 1 row in %, saw %', tbls[i], n; end if;
  end loop;
  -- user_id default = auth.uid()
  execute 'insert into public.water_logs (date, ml) values (''2026-11-16'', 100)';
  execute 'select count(*) from public.water_logs where user_id = auth.uid()' into n;
  if n <> 2 then raise exception 'user_id default from auth.uid() failed'; end if;
  execute 'delete from public.water_logs where ml = 100';
  reset role;

  -- User B: cannot see, update or delete A's rows, nor insert rows as A.
  perform set_config('request.jwt.claim.sub', b, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1 .. array_length(tbls, 1) loop
    execute format('select count(*) from public.%I', tbls[i]) into n;
    if n <> 0 then raise exception 'B can SELECT % rows of A in %', n, tbls[i]; end if;

    execute format('update public.%I set user_id = user_id', tbls[i]);
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B UPDATEd % rows of A in %', n, tbls[i]; end if;

    execute format('delete from public.%I', tbls[i]);
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B DELETEd % rows of A in %', n, tbls[i]; end if;

    begin
      execute format(inserts[i], a);   -- spoofing user_id = A
      raise exception 'B could INSERT a row as A into %', tbls[i];
    exception when insufficient_privilege then
      null;                            -- expected: RLS with-check violation
    end;

    raise notice 'B isolated from A on %: select/update/delete/insert-spoof blocked', tbls[i];
  end loop;

  -- B also cannot hand over one of its own rows to A (update with check).
  for i in 1 .. array_length(tbls, 1) loop
    execute format(inserts[i], b);
    begin
      execute format('update public.%I set user_id = %L', tbls[i], a);
      raise exception 'B could reassign a row to A in %', tbls[i];
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  reset role;

  -- anon sees nothing (no policies, no grants).
  set local role anon;
  for i in 1 .. array_length(tbls, 1) loop
    begin
      execute format('select count(*) from public.%I', tbls[i]) into n;
      if n <> 0 then raise exception 'anon can read %', tbls[i]; end if;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  reset role;

  -- A's rows are untouched.
  for i in 1 .. array_length(tbls, 1) loop
    execute format('select count(*) from public.%I where user_id = %L', tbls[i], a) into n;
    if n <> 1 then raise exception 'A lost rows in % (has %)', tbls[i], n; end if;
  end loop;

  raise notice 'RLS TEST PASSED';
end;
$$;

rollback;
