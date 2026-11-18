// Workout sessions data layer (contracts §8.3). Sessions live in the `workouts` table's `raw` column.
import { supabase } from '../lib/supabase';
import { analyzeWorkout, rulesFromAnalysis, summarizeWorkout } from '../lib/workoutImport';
import { ROUTINE } from '../lib/routine';
import {
  normalizeSession,
  summarizeSession,
  validateSession,
  type SessionSummary,
  type WorkoutSession,
} from '../lib/workoutSession';
import type { ExerciseRule } from '../lib/types';
import { getProfile, listExerciseRules, saveExerciseRules, saveWorkout } from './api';

const RECENT_LIMIT = 20;
const PER_DAY_LIMIT = 10;

function fail(error: { message?: string } | null | undefined, what: string): void {
  if (error) throw new Error(`${what}: ${error.message || 'unknown error'}`);
}

function isSession(raw: unknown): raw is WorkoutSession {
  return validateSession(raw).length === 0;
}

export async function loadWorkoutData(): Promise<{
  recent: SessionSummary[];
  lastByDay: Record<string, WorkoutSession | null>;
}> {
  const recentRes = await supabase
    .from('workouts')
    .select('raw')
    .order('started_at', { ascending: false })
    .limit(RECENT_LIMIT);
  fail(recentRes.error, 'Could not load workouts');
  const recent = ((recentRes.data ?? []) as { raw: unknown }[])
    .map((r) => r.raw)
    .filter(isSession)
    .map((s) => summarizeSession(normalizeSession(s)));

  const lastByDay: Record<string, WorkoutSession | null> = {};
  for (const d of ROUTINE.days) {
    const res = await supabase
      .from('workouts')
      .select('raw')
      .eq('raw->>day', String(d.day))
      .not('raw->>completedAt', 'is', null)
      .order('started_at', { ascending: false })
      .limit(PER_DAY_LIMIT);
    fail(res.error, 'Could not load workouts');
    const found = ((res.data ?? []) as { raw: unknown }[])
      .map((r) => r.raw)
      .find((raw) => isSession(raw) && raw.completedAt !== null && raw.day === d.day);
    lastByDay[String(d.day)] = found ? normalizeSession(found as WorkoutSession) : null;
  }
  return { recent, lastByDay };
}

export async function getWorkoutSession(id: string): Promise<WorkoutSession> {
  const { data, error } = await supabase.from('workouts').select('raw').eq('id', id).maybeSingle();
  fail(error, 'Could not load workout');
  const raw = (data as { raw?: unknown } | null)?.raw;
  if (!isSession(raw)) throw new Error('Session not found: ' + id);
  return normalizeSession(raw);
}

export async function saveWorkoutSession(
  s: WorkoutSession,
  now?: Date,
): Promise<{ id: string; date: string; savedAt: string }> {
  const errors = validateSession(s, ROUTINE);
  if (errors.length) throw new Error('Invalid session: ' + errors.join('; '));
  const profile = await getProfile();
  if (!profile) throw new Error('Set up your profile before saving workouts');
  const savedAt = (now ?? new Date()).toISOString();
  const session = { ...normalizeSession(s), savedAt };
  const analysis = analyzeWorkout(session, {
    timeZone: profile.timezone,
    rules: await listExerciseRules(),
  });
  const summary = summarizeWorkout(analysis);
  await saveWorkout(summary, true);
  await saveExerciseRules(rulesFromAnalysis(analysis));
  return { id: session.id, date: summary.date, savedAt };
}

export async function importWorkoutSessions(raws: unknown[]): Promise<{
  imported: number;
  existing: number;
  invalid: { index: number; errors: string[] }[];
}> {
  const result = { imported: 0, existing: 0, invalid: [] as { index: number; errors: string[] }[] };
  const valid: { raw: WorkoutSession }[] = [];
  raws.forEach((raw, index) => {
    const errors = validateSession(raw);
    if (errors.length) result.invalid.push({ index, errors });
    else valid.push({ raw: normalizeSession(raw as WorkoutSession) });
  });
  if (!valid.length) return result;

  const profile = await getProfile();
  if (!profile) throw new Error('Set up your profile before importing workouts');
  const rules = await listExerciseRules();
  const learned = new Map<string, ExerciseRule>();
  for (const { raw } of valid) {
    const analysis = analyzeWorkout(raw, { timeZone: profile.timezone, rules });
    const outcome = await saveWorkout(summarizeWorkout(analysis), false);
    if (outcome === 'exists') result.existing++;
    else result.imported++;
    for (const r of rulesFromAnalysis(analysis)) learned.set(r.exerciseId, r);
  }
  if (learned.size) await saveExerciseRules([...learned.values()]);
  return result;
}
