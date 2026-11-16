import { localDate } from './dates';
import type { ExerciseCategory, ExerciseRule, WorkoutSummary } from './types';

export type ParseResult = { ok: true; workouts: unknown[] } | { ok: false; error: string };

export interface ExerciseAnalysis {
  exerciseId: string;
  name: string;
  category: ExerciseCategory;
  source: 'rule-id' | 'rule-name' | 'guess';
  timedMin: number;
  doneSets: number;
}

export interface WorkoutAnalysis {
  id: string;
  date: string;
  startedAt: string;
  completedAt: string | null; // effective: completedAt ?? savedAt ?? null
  sessionMin: number | null;
  exercises: ExerciseAnalysis[];
  raw: unknown;
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateWorkout(w: unknown, label: string): string | null {
  if (!isObj(w)) return `${label} is not an object`;
  if (typeof w.id !== 'string' || w.id === '') return `${label} is missing a string "id"`;
  if (typeof w.startedAt !== 'string') return `${label} is missing a string "startedAt"`;
  if (!Array.isArray(w.entries)) return `${label} is missing an "entries" array`;
  if (w.schemaVersion !== 1) {
    return `${label} has unsupported schemaVersion ${JSON.stringify(w.schemaVersion)} (expected 1)`;
  }
  return null;
}

export function parseWorkoutJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  const list = Array.isArray(data) ? data : [data];
  if (list.length === 0) return { ok: false, error: 'The file contains no workouts' };
  for (let i = 0; i < list.length; i++) {
    const label = Array.isArray(data) ? `Workout ${i + 1}` : 'Workout';
    const err = validateWorkout(list[i], label);
    if (err) return { ok: false, error: err };
  }
  return { ok: true, workouts: list };
}

const CARDIO_KEYWORDS = [
  'bike', 'cycle', 'cycling', 'run', 'jog', 'treadmill', 'elliptical', 'rower',
  'row machine', 'rowing machine', 'walk', 'swim', 'stair', 'jump rope',
];

function normalizeName(name: string): string {
  return name.replace(/^\s*warm up:/i, '').trim().toLowerCase();
}

function unused(v: unknown): boolean {
  return v === null || v === undefined || v === 0;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function analyzeWorkout(
  raw: unknown,
  opts: { timeZone: string; rules: ExerciseRule[] },
): WorkoutAnalysis {
  const w = raw as Obj;
  const startedAt = w.startedAt as string;
  const completedAt =
    (typeof w.completedAt === 'string' ? w.completedAt : null) ??
    (typeof w.savedAt === 'string' ? w.savedAt : null);
  const sessionMin = completedAt
    ? (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000
    : null;

  const byId = new Map<string, ExerciseRule>();
  const byName = new Map<string, ExerciseRule>();
  for (const r of opts.rules) {
    byId.set(r.exerciseId, r);
    byName.set(normalizeName(r.name), r);
  }

  const exercises: ExerciseAnalysis[] = (w.entries as unknown[]).map((e) => {
    const entry = isObj(e) ? e : {};
    const exerciseId = typeof entry.exerciseId === 'string' ? entry.exerciseId : '';
    const name = typeof entry.name === 'string' ? entry.name : exerciseId;
    const sets = (Array.isArray(entry.sets) ? entry.sets : []).filter(
      (s): s is Obj => isObj(s) && s.done === true,
    );
    const timedMin = sets.reduce((sum, s) => sum + num(s.timeMin) + num(s.timeSec) / 60, 0);

    let category: ExerciseCategory;
    let source: ExerciseAnalysis['source'];
    const idRule = byId.get(exerciseId);
    const nameRule = byName.get(normalizeName(name));
    if (idRule) {
      category = idRule.category;
      source = 'rule-id';
    } else if (nameRule) {
      category = nameRule.category;
      source = 'rule-name';
    } else {
      const norm = normalizeName(name);
      const allTimed =
        sets.length > 0 &&
        sets.every(
          (s) => unused(s.reps) && unused(s.weightLb) && !(unused(s.timeMin) && unused(s.timeSec)),
        );
      category =
        allTimed && CARDIO_KEYWORDS.some((k) => norm.includes(k)) ? 'light_cardio' : 'lifting';
      source = 'guess';
    }
    return { exerciseId, name, category, source, timedMin, doneSets: sets.length };
  });

  return {
    id: w.id as string,
    date: localDate(startedAt, opts.timeZone),
    startedAt,
    completedAt,
    sessionMin,
    exercises,
    raw,
  };
}

export function summarizeWorkout(
  a: WorkoutAnalysis,
  overrides?: { categories?: Record<string, ExerciseCategory>; sessionMin?: number },
): WorkoutSummary {
  let light = 0;
  let strenuous = 0;
  for (const ex of a.exercises) {
    const cat = overrides?.categories?.[ex.exerciseId] ?? ex.category;
    if (cat === 'light_cardio') light += ex.timedMin;
    else if (cat === 'strenuous_cardio') strenuous += ex.timedMin;
  }
  const sessionMin = overrides?.sessionMin ?? a.sessionMin;
  const liftingH = sessionMin == null ? 0 : Math.max(0, sessionMin - light - strenuous) / 60;
  return {
    id: a.id,
    date: a.date,
    startedAt: a.startedAt,
    completedAt: a.completedAt,
    lightCardioH: light / 60,
    strenuousCardioH: strenuous / 60,
    liftingH,
    raw: a.raw,
  };
}

export function rulesFromAnalysis(
  a: WorkoutAnalysis,
  overrides?: Record<string, ExerciseCategory>,
): ExerciseRule[] {
  return a.exercises.map((ex) => ({
    exerciseId: ex.exerciseId,
    name: ex.name,
    category: overrides?.[ex.exerciseId] ?? ex.category,
  }));
}
