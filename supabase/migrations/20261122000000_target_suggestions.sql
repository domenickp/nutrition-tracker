-- Accepted suggestions and snoozes for the weight-trend feature (epic nt-fzp).
-- Same shape as the init migration: updated_at trigger, RLS, four own-row policies, no anon.
create table public.target_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('calorie', 'protein', 'cardio', 'lifting', 'logging')),
  action text not null check (action in ('accepted', 'snoozed')),
  snooze_until date,
  old_adjust_pct numeric,
  new_adjust_pct numeric,
  old_kcal integer,
  new_kcal integer,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (action <> 'snoozed' or snooze_until is not null)
);
create index target_suggestions_user_created_idx on public.target_suggestions (user_id, created_at);

create trigger set_updated_at before update on public.target_suggestions
  for each row execute function public.set_updated_at();

alter table public.target_suggestions enable row level security;

create policy target_suggestions_select_own on public.target_suggestions
  for select to authenticated using (auth.uid() = user_id);
create policy target_suggestions_insert_own on public.target_suggestions
  for insert to authenticated with check (auth.uid() = user_id);
create policy target_suggestions_update_own on public.target_suggestions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy target_suggestions_delete_own on public.target_suggestions
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.target_suggestions from anon;
