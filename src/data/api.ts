// Data layer (contracts ยง5). The only place that talks to Supabase tables and maps rows.
import { supabase } from '../lib/supabase';
import type {
  AnalysisDay,
  DailyActivity,
  DayData,
  ExerciseRule,
  Food,
  FoodLog,
  NewFood,
  NewFoodLog,
  NewSuggestionRecord,
  Profile,
  ProfileInput,
  SuggestionKind,
  SuggestionRecord,
  WaterLog,
  WeighIn,
  WorkoutSummary,
} from '../lib/types';
import { addDays } from '../lib/dates';
import { BACKUP_TABLES, type BackupRow, type BackupTable } from '../lib/backup';
import type { Suggestion } from '../lib/weightAnalysis';
import type { UsdaFood } from '../../supabase/functions/usda/normalize';
import { queryWords } from '../../supabase/functions/usda/search';
import {
  fromActivity,
  fromExerciseRule,
  fromFood,
  fromFoodLog,
  fromFoodLogPatch,
  fromProfile,
  fromSuggestionRecord,
  fromWaterLog,
  fromWeight,
  fromWorkout,
  toActivity,
  toExerciseRule,
  toFood,
  toFoodLog,
  toProfile,
  toSuggestionRecord,
  toWaterLog,
  toWeightKg,
  toWorkout,
} from './mappers';

function fail(error: { message?: string } | null | undefined, what: string): void {
  if (error) throw new Error(`${what}: ${error.message || 'unknown error'}`);
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data?.user?.id;
  if (!id) throw new Error('Not signed in');
  return id;
}

// ---- profile ----

export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
  fail(error, 'Could not load profile');
  return data ? toProfile(data) : null;
}

export async function saveProfile(p: ProfileInput): Promise<Profile> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ ...fromProfile(p), user_id: userId }, { onConflict: 'user_id' })
    .select('*')
    .single();
  fail(error, 'Could not save profile');
  return toProfile(data);
}

// ---- weights ----

export async function addWeight(date: string, kg: number): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('weights')
    .upsert({ ...fromWeight(date, kg), user_id: userId }, { onConflict: 'user_id,date' });
  fail(error, 'Could not save weight');
}

export async function getLatestWeight(onOrBefore: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('weights')
    .select('weight_kg')
    .lte('date', onOrBefore)
    .order('date', { ascending: false })
    .limit(1);
  fail(error, 'Could not load weight');
  return data && data.length > 0 ? toWeightKg(data[0]) : null;
}

// ---- day ----

export async function loadDay(date: string): Promise<DayData> {
  const [profile, weightKg, activityRes, workoutsRes, foodRes, waterRes] = await Promise.all([
    getProfile(),
    getLatestWeight(date),
    supabase.from('daily_activity').select('*').eq('date', date).maybeSingle(),
    supabase.from('workouts').select('*').eq('date', date),
    supabase.from('food_logs').select('*').eq('date', date).order('logged_at', { ascending: true }),
    supabase.from('water_logs').select('*').eq('date', date).order('logged_at', { ascending: true }),
  ]);
  if (!profile) throw new Error('No profile');
  fail(activityRes.error, 'Could not load activity');
  fail(workoutsRes.error, 'Could not load workouts');
  fail(foodRes.error, 'Could not load food log');
  fail(waterRes.error, 'Could not load water log');
  return {
    date,
    profile,
    weightKg,
    activity: activityRes.data ? toActivity(activityRes.data) : null,
    workouts: (workoutsRes.data ?? []).map(toWorkout),
    foodLogs: (foodRes.data ?? []).map(toFoodLog),
    waterLogs: (waterRes.data ?? []).map(toWaterLog),
  };
}

// ---- analysis ----

export async function loadAnalysisData(
  today: string,
): Promise<{ profile: Profile; weighIns: WeighIn[]; days: AnalysisDay[] }> {
  const from = addDays(today, -21);
  const to = addDays(today, -1);
  const [profile, weightsRes, foodRes, activityRes, workoutsRes] = await Promise.all([
    getProfile(),
    supabase.from('weights').select('date, weight_kg').lte('date', today).order('date', { ascending: true }),
    supabase.from('food_logs').select('date, kcal, protein_g').gte('date', from).lte('date', to),
    supabase.from('daily_activity').select('*').gte('date', from).lte('date', to),
    supabase
      .from('workouts')
      .select('date, light_cardio_h, strenuous_cardio_h, lifting_h')
      .gte('date', from)
      .lte('date', to)
      .not('completed_at', 'is', null),
  ]);
  if (!profile) throw new Error('No profile');
  fail(weightsRes.error, 'Could not load weights');
  fail(foodRes.error, 'Could not load food log');
  fail(activityRes.error, 'Could not load activity');
  fail(workoutsRes.error, 'Could not load workouts');

  const weighIns: WeighIn[] = (weightsRes.data ?? []).map((r) => ({ date: r.date, kg: toWeightKg(r) }));
  const intake = new Map<string, { kcal: number; proteinG: number }>();
  for (const r of foodRes.data ?? []) {
    const t = intake.get(r.date) ?? { kcal: 0, proteinG: 0 };
    t.kcal += Number(r.kcal);
    t.proteinG += Number(r.protein_g);
    intake.set(r.date, t);
  }
  const activity = new Map((activityRes.data ?? []).map((r) => [r.date as string, toActivity(r)]));
  const workouts = new Map<string, AnalysisDay['workouts']>();
  for (const r of workoutsRes.data ?? []) {
    const list = workouts.get(r.date) ?? [];
    list.push({
      lightCardioH: Number(r.light_cardio_h),
      strenuousCardioH: Number(r.strenuous_cardio_h),
      liftingH: Number(r.lifting_h),
    });
    workouts.set(r.date, list);
  }
  const days: AnalysisDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const t = intake.get(d);
    days.push({
      date: d,
      intakeKcal: t ? t.kcal : null,
      proteinG: t ? t.proteinG : null,
      activity: activity.get(d) ?? null,
      workouts: workouts.get(d) ?? [],
    });
  }
  return { profile, weighIns, days };
}

// ---- suggestions (every access fails soft: the table may not exist until the migration is applied) ----

export async function listSuggestionRecords(): Promise<SuggestionRecord[] | null> {
  try {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('target_suggestions')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    if (error) return null;
    return (data ?? []).map(toSuggestionRecord);
  } catch {
    return null;
  }
}

export async function recordSuggestion(r: NewSuggestionRecord): Promise<boolean> {
  try {
    const userId = await currentUserId();
    const { error } = await supabase
      .from('target_suggestions')
      .insert({ ...fromSuggestionRecord(r), user_id: userId });
    return !error;
  } catch {
    return false;
  }
}

export async function acceptCalorieSuggestion(profile: Profile, s: Suggestion): Promise<Profile> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userId, ...input } = profile;
  const saved = await saveProfile({ ...input, overrideKcalAdjustPct: s.newAdjustPct });
  await recordSuggestion({
    kind: 'calorie',
    action: 'accepted',
    snoozeUntil: null,
    oldAdjustPct: s.oldAdjustPct,
    newAdjustPct: s.newAdjustPct,
    oldKcal: s.oldKcal,
    newKcal: s.newKcal,
    reason: s.reason,
  });
  return saved;
}

export async function snoozeSuggestion(kind: SuggestionKind, today: string): Promise<boolean> {
  return recordSuggestion({
    kind,
    action: 'snoozed',
    snoozeUntil: addDays(today, 7),
    oldAdjustPct: null,
    newAdjustPct: null,
    oldKcal: null,
    newKcal: null,
    reason: null,
  });
}

// ---- foods ----

export async function listFoods(search?: string): Promise<Food[]> {
  let q = supabase.from('foods').select('*');
  for (const word of queryWords(search ?? '')) {
    const escaped = word.replace(/[\\%_]/g, (c) => '\\' + c);
    q = q.ilike('name', `%${escaped}%`);
  }
  const { data, error } = await q
    .order('last_used_at', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .limit(50);
  fail(error, 'Could not load foods');
  return (data ?? []).map(toFood);
}

export async function saveFood(f: NewFood): Promise<Food> {
  const userId = await currentUserId();
  if (f.source === 'usda' && f.fdcId !== null) {
    // The unique index on (user_id, fdc_id) is partial (where fdc_id is not null), and
    // PostgREST's on_conflict cannot target a partial index, so select then update/insert.
    const existing = await supabase.from('foods').select('id').eq('fdc_id', f.fdcId).maybeSingle();
    fail(existing.error, 'Could not save food');
    if (existing.data) return updateFood(existing.data.id, f);
  }
  const { data, error } = await supabase
    .from('foods')
    .insert({ ...fromFood(f), user_id: userId })
    .select('*')
    .single();
  fail(error, 'Could not save food');
  return toFood(data);
}

export async function updateFood(id: string, f: NewFood): Promise<Food> {
  const { data, error } = await supabase
    .from('foods')
    .update(fromFood(f))
    .eq('id', id)
    .select('*')
    .single();
  fail(error, 'Could not update food');
  return toFood(data);
}

export async function deleteFood(id: string): Promise<void> {
  const { error } = await supabase.from('foods').delete().eq('id', id);
  fail(error, 'Could not delete food');
}

// ---- food logs ----

export async function addFoodLog(l: NewFoodLog): Promise<FoodLog> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('food_logs')
    .insert({ ...fromFoodLog(l), user_id: userId })
    .select('*')
    .single();
  fail(error, 'Could not add food entry');
  if (l.foodId) {
    const bump = await supabase
      .from('foods')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', l.foodId);
    fail(bump.error, 'Could not update food usage');
  }
  return toFoodLog(data);
}

export async function updateFoodLog(
  id: string,
  patch: Pick<FoodLog, 'quantity' | 'unitLabel' | 'grams' | 'totals'>,
): Promise<FoodLog> {
  const { data, error } = await supabase
    .from('food_logs')
    .update(fromFoodLogPatch(patch))
    .eq('id', id)
    .select('*')
    .single();
  fail(error, 'Could not update food entry');
  return toFoodLog(data);
}

export async function deleteFoodLog(id: string): Promise<void> {
  const { error } = await supabase.from('food_logs').delete().eq('id', id);
  fail(error, 'Could not delete food entry');
}

// ---- water ----

export async function addWater(date: string, ml: number): Promise<WaterLog> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('water_logs')
    .insert({ ...fromWaterLog(date, ml), user_id: userId })
    .select('*')
    .single();
  fail(error, 'Could not add water');
  return toWaterLog(data);
}

export async function deleteWater(id: string): Promise<void> {
  const { error } = await supabase.from('water_logs').delete().eq('id', id);
  fail(error, 'Could not delete water entry');
}

// ---- activity & workouts ----

export async function saveActivity(a: DailyActivity): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('daily_activity')
    .upsert({ ...fromActivity(a), user_id: userId }, { onConflict: 'user_id,date' });
  fail(error, 'Could not save activity');
}

export async function saveWorkout(w: WorkoutSummary, replace: boolean): Promise<'saved' | 'exists'> {
  const userId = await currentUserId();
  if (!replace) {
    const existing = await supabase.from('workouts').select('id').eq('id', w.id).maybeSingle();
    fail(existing.error, 'Could not save workout');
    if (existing.data) return 'exists';
  }
  const { error } = await supabase
    .from('workouts')
    .upsert({ ...fromWorkout(w), user_id: userId }, { onConflict: 'user_id,id' });
  fail(error, 'Could not save workout');
  return 'saved';
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', id);
  fail(error, 'Could not delete workout');
}

// ---- exercise rules ----

export async function listExerciseRules(): Promise<ExerciseRule[]> {
  const { data, error } = await supabase.from('exercise_categories').select('*').order('name');
  fail(error, 'Could not load exercise rules');
  return (data ?? []).map(toExerciseRule);
}

export async function saveExerciseRules(rules: ExerciseRule[]): Promise<void> {
  if (rules.length === 0) return;
  const userId = await currentUserId();
  const { error } = await supabase
    .from('exercise_categories')
    .upsert(
      rules.map((r) => ({ ...fromExerciseRule(r), user_id: userId })),
      { onConflict: 'user_id,exercise_id' },
    );
  fail(error, 'Could not save exercise rules');
}

// ---- USDA (Edge Function) ----

async function invokeUsda<T>(path: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(path, { method: 'GET' });
  if (error) {
    let message: string = error.message || 'USDA request failed';
    // FunctionsHttpError carries the Response in `context`; prefer the function's { error } body.
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try {
        const body = await (ctx as Response).json();
        if (body && typeof body.error === 'string') message = body.error;
      } catch {
        /* keep default message */
      }
    }
    throw new Error(message);
  }
  if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

export async function searchUsda(q: string): Promise<UsdaFood[]> {
  const data = await invokeUsda<{ foods?: UsdaFood[] }>('usda?op=search&q=' + encodeURIComponent(q));
  return data.foods ?? [];
}

export async function getUsdaFood(fdcId: number): Promise<UsdaFood> {
  return invokeUsda<UsdaFood>('usda?op=food&fdcId=' + encodeURIComponent(String(fdcId)));
}

// ---- data controls (contracts ง10.2) ----

export async function exportMyData(): Promise<Record<BackupTable, BackupRow[]>> {
  const out = {} as Record<BackupTable, BackupRow[]>;
  for (const t of BACKUP_TABLES) {
    const { data, error } = await supabase.from(t).select('*');
    fail(error, `Could not read ${t}`);
    out[t] = (data ?? []) as BackupRow[];
  }
  return out;
}

export async function accountIsEmpty(): Promise<boolean> {
  for (const t of BACKUP_TABLES) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    fail(error, `Could not check ${t}`);
    if ((count ?? 0) > 0) return false;
  }
  return true;
}

export async function purgeMyData(): Promise<void> {
  const { error } = await supabase.rpc('purge_my_data');
  fail(error, 'Could not delete your data');
}

export async function importMyData(rows: Record<BackupTable, BackupRow[]>): Promise<number> {
  const { data, error } = await supabase.rpc('import_my_data', { payload: rows });
  fail(error, 'Could not import');
  return Number(data ?? 0);
}
