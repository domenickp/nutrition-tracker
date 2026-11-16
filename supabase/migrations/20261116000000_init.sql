-- Nutrition tracker: initial schema. Contracts §6, design "Data model".
-- Every table is owned by a user (user_id) and protected by row-level security.

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  birth_month smallint not null check (birth_month between 1 and 12),
  birth_year smallint not null check (birth_year between 1900 and 2200),
  sex text not null check (sex in ('male', 'female')),
  height_cm numeric not null check (height_cm > 0),
  goal text not null check (goal in ('lose_fat', 'maintain', 'build_muscle')),
  units text not null check (units in ('imperial', 'metric')),
  timezone text not null,
  override_kcal_adjust_pct numeric,
  override_protein_g_per_lb numeric check (override_protein_g_per_lb is null or override_protein_g_per_lb >= 0),
  override_fat_pct numeric check (override_fat_pct is null or (override_fat_pct >= 0 and override_fat_pct <= 100)),
  override_water_base_ml_per_kg numeric check (override_water_base_ml_per_kg is null or override_water_base_ml_per_kg >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- weights
-- ---------------------------------------------------------------------------
create table public.weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  weight_kg numeric not null check (weight_kg > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index weights_user_date_idx on public.weights (user_id, date);

-- ---------------------------------------------------------------------------
-- foods
-- ---------------------------------------------------------------------------
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  brand text,
  source text not null check (source in ('manual', 'usda')),
  fdc_id bigint,
  base_label text not null,
  base_grams numeric check (base_grams is null or base_grams > 0),
  kcal numeric not null check (kcal >= 0),
  protein_g numeric not null check (protein_g >= 0),
  carbs_g numeric not null check (carbs_g >= 0),
  fat_g numeric not null check (fat_g >= 0),
  water_ml numeric not null default 0 check (water_ml >= 0),
  portions jsonb not null default '[]'::jsonb check (jsonb_typeof(portions) = 'array'),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index foods_user_fdc_id_key on public.foods (user_id, fdc_id) where fdc_id is not null;
create index foods_user_last_used_idx on public.foods (user_id, last_used_at desc nulls last);

-- ---------------------------------------------------------------------------
-- food_logs
-- ---------------------------------------------------------------------------
create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  logged_at timestamptz not null default now(),
  food_id uuid references public.foods (id) on delete set null,
  name text not null,
  quantity numeric not null check (quantity >= 0),
  unit_label text not null,
  grams numeric check (grams is null or grams >= 0),
  kcal numeric not null check (kcal >= 0),
  protein_g numeric not null check (protein_g >= 0),
  carbs_g numeric not null check (carbs_g >= 0),
  fat_g numeric not null check (fat_g >= 0),
  water_ml numeric not null default 0 check (water_ml >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index food_logs_user_date_idx on public.food_logs (user_id, date);
create index food_logs_food_id_idx on public.food_logs (food_id);

-- ---------------------------------------------------------------------------
-- water_logs
-- ---------------------------------------------------------------------------
create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  logged_at timestamptz not null default now(),
  ml numeric not null check (ml >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index water_logs_user_date_idx on public.water_logs (user_id, date);

-- ---------------------------------------------------------------------------
-- daily_activity
-- ---------------------------------------------------------------------------
create table public.daily_activity (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  mode text not null check (mode in ('direct', 'hours')),
  direct_kcal numeric check (direct_kcal is null or direct_kcal >= 0),
  sedentary_h numeric not null default 0 check (sedentary_h >= 0),
  light_cardio_h numeric not null default 0 check (light_cardio_h >= 0),
  strenuous_cardio_h numeric not null default 0 check (strenuous_cardio_h >= 0),
  lifting_h numeric not null default 0 check (lifting_h >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ---------------------------------------------------------------------------
-- workouts
-- ---------------------------------------------------------------------------
create table public.workouts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  date date not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  raw jsonb not null,
  light_cardio_h numeric not null default 0 check (light_cardio_h >= 0),
  strenuous_cardio_h numeric not null default 0 check (strenuous_cardio_h >= 0),
  lifting_h numeric not null default 0 check (lifting_h >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index workouts_user_date_idx on public.workouts (user_id, date);

-- ---------------------------------------------------------------------------
-- exercise_categories
-- ---------------------------------------------------------------------------
create table public.exercise_categories (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id text not null,
  name text not null,
  category text not null check (category in ('light_cardio', 'strenuous_cardio', 'lifting')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers, RLS and policies (same shape on every table)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'weights', 'foods', 'food_logs', 'water_logs',
    'daily_activity', 'workouts', 'exercise_categories'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);

    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using (auth.uid() = user_id)', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (auth.uid() = user_id)', t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (auth.uid() = user_id)', t || '_delete_own', t);
  end loop;
end;
$$;

-- No policies exist for anon, so anon sees nothing; also drop its table grants.
revoke all on public.profiles, public.weights, public.foods, public.food_logs,
  public.water_logs, public.daily_activity, public.workouts,
  public.exercise_categories from anon;
