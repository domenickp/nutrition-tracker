// Validates the parsed config/workouts.yaml (contracts §8.7). Pure: no Vite, Node or DOM imports.
import type { Routine, RoutineDay, RoutineExercise } from './routine';

const NUM_FIELDS = ['sets', 'reps', 'weightLb', 'timeMin', 'timeSec'] as const;
const STR_FIELDS = ['rest', 'notes'] as const;
const EXERCISE_KEYS: string[] = ['id', 'name', 'warmup', ...NUM_FIELDS, ...STR_FIELDS];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

export function parseRoutineConfig(data: unknown): Routine {
  const errors: string[] = [];
  const err = (path: string, msg: string) => { errors.push(`${path}: ${msg}`); };
  const unknownKeys = (o: Record<string, unknown>, allowed: string[], path: string) => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) err(path ? `${path}.${k}` : k, 'unknown key');
  };

  if (!isObj(data)) throw new Error('(root): must be an object');
  unknownKeys(data, ['schemaVersion', 'days'], '');
  if (data.schemaVersion !== 1) err('schemaVersion', 'must be 1');

  const days: RoutineDay[] = [];
  const seenDays = new Set<number>();
  const seenIds = new Set<string>();
  if (!Array.isArray(data.days)) err('days', 'must be a list');
  else if (data.days.length === 0) err('days', 'must not be empty');
  else {
    data.days.forEach((rawDay: unknown, di: number) => {
      const dp = `days[${di}]`;
      if (!isObj(rawDay)) { err(dp, 'must be an object'); return; }
      unknownKeys(rawDay, ['day', 'areas', 'exercises'], dp);
      const dayNo = rawDay.day;
      if (typeof dayNo !== 'number' || !Number.isInteger(dayNo) || dayNo <= 0) err(`${dp}.day`, 'must be a positive integer');
      else if (seenDays.has(dayNo)) err(`${dp}.day`, `duplicate day number ${dayNo}`);
      else seenDays.add(dayNo);
      if (!nonEmpty(rawDay.areas)) err(`${dp}.areas`, 'must be a non-empty string');

      const exercises: RoutineExercise[] = [];
      if (!Array.isArray(rawDay.exercises)) err(`${dp}.exercises`, 'must be a list');
      else if (rawDay.exercises.length === 0) err(`${dp}.exercises`, 'must not be empty');
      else {
        rawDay.exercises.forEach((rawEx: unknown, ei: number) => {
          const ep = `${dp}.exercises[${ei}]`;
          if (!isObj(rawEx)) { err(ep, 'must be an object'); return; }
          unknownKeys(rawEx, EXERCISE_KEYS, ep);
          if (!nonEmpty(rawEx.id)) err(`${ep}.id`, 'must be a non-empty string');
          else if (seenIds.has(rawEx.id)) err(`${ep}.id`, `duplicate id "${rawEx.id}"`);
          else seenIds.add(rawEx.id);
          if (!nonEmpty(rawEx.name)) err(`${ep}.name`, 'must be a non-empty string');
          if (rawEx.warmup !== undefined && typeof rawEx.warmup !== 'boolean') err(`${ep}.warmup`, 'must be true or false');
          const num: Record<string, number | null> = {};
          for (const f of NUM_FIELDS) {
            const v = rawEx[f];
            if (v === undefined || v === null) num[f] = null;
            else if (typeof v === 'number' && Number.isFinite(v)) num[f] = v;
            else { err(`${ep}.${f}`, 'must be a number or null'); num[f] = null; }
          }
          const str: Record<string, string | null> = {};
          for (const f of STR_FIELDS) {
            const v = rawEx[f];
            if (v === undefined || v === null) str[f] = null;
            else if (typeof v === 'string') str[f] = v;
            else { err(`${ep}.${f}`, 'must be a string or null'); str[f] = null; }
          }
          exercises.push({
            id: String(rawEx.id ?? ''), name: String(rawEx.name ?? ''), warmup: rawEx.warmup === true,
            sets: num.sets, reps: num.reps, weightLb: num.weightLb, timeMin: num.timeMin, timeSec: num.timeSec,
            rest: str.rest, notes: str.notes,
          });
        });
      }
      days.push({ day: typeof dayNo === 'number' ? dayNo : 0, areas: String(rawDay.areas ?? ''), exercises });
    });
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  return { schemaVersion: 1, days };
}
