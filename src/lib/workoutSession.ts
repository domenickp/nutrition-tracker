// Workout session logic (contracts §8.2). Pure port of FatherWorkout's Lib.js and FW module.
import type { Routine, RoutineExercise } from './routine';

export interface SessionSet { reps: number | null; weightLb: number | null; timeMin: number | null; timeSec: number | null; done: boolean }
export interface SessionEntry { exerciseId: string; name: string; sets: SessionSet[]; notes: string | null }
export interface WorkoutSession {
  schemaVersion: 1; id: string; day: number; startedAt: string; completedAt: string | null;
  entries: SessionEntry[]; notes: string | null; savedAt?: string;
}
export interface SessionSummary { id: string; day: number; startedAt: string; completedAt: string | null; exerciseCount: number; setsDone: number }
export interface ExerciseLog { sets: SessionSet[]; notes: string }
export interface DraftState { id: string; day: number; startedAt: string; log: Record<string, ExerciseLog>; notes: string }
export const DRAFT_KEY = 'nt-workout-draft';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

type Obj = Record<string, unknown>;

function isIsoString(v: unknown): boolean {
  return typeof v === 'string' && ISO_RE.test(v) && !isNaN(Date.parse(v));
}
function isObject(v: unknown): v is Obj {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isNonNegNumber(v: unknown): boolean {
  return typeof v === 'number' && isFinite(v) && v >= 0;
}

/** Human-readable errors; empty when valid. */
export function validateSession(s: unknown, routine?: Routine): string[] {
  const errors: string[] = [];
  if (!isObject(s)) return ['session must be an object'];
  const session = s;

  if (session.schemaVersion !== 1) errors.push('schemaVersion must be 1');

  if (typeof session.id !== 'string' || session.id.trim() === '') {
    errors.push('id must be a non-empty string');
  }

  let dayDef: Routine['days'][number] | null = null;
  const day = session.day;
  if (typeof day !== 'number' || !isFinite(day) || Math.floor(day) !== day) {
    errors.push('day must be an integer');
  } else if (routine && Array.isArray(routine.days)) {
    dayDef = routine.days.find((d) => d.day === day) ?? null;
    if (!dayDef) errors.push('day ' + day + ' is not in the routine');
  }

  if (!isIsoString(session.startedAt)) errors.push('startedAt must be an ISO 8601 date string');
  if (session.completedAt !== null && !isIsoString(session.completedAt)) {
    errors.push('completedAt must be an ISO 8601 date string or null');
  }
  if (session.notes !== null && session.notes !== undefined && typeof session.notes !== 'string') {
    errors.push('notes must be a string or null');
  }

  if (!Array.isArray(session.entries) || session.entries.length === 0) {
    errors.push('entries must be a non-empty array');
    return errors;
  }

  let known: Record<string, boolean> | null = null;
  if (dayDef && Array.isArray(dayDef.exercises)) {
    known = {};
    for (const ex of dayDef.exercises) known[ex.id] = true;
  }

  session.entries.forEach((entry: unknown, ei: number) => {
    const p = 'entries[' + ei + ']';
    if (!isObject(entry)) { errors.push(p + ' must be an object'); return; }
    if (typeof entry.exerciseId !== 'string' || entry.exerciseId === '') {
      errors.push(p + '.exerciseId must be a non-empty string');
    } else if (known && !known[entry.exerciseId]) {
      errors.push(p + '.exerciseId "' + entry.exerciseId + '" is not in the routine for day ' + String(session.day));
    }
    if (typeof entry.name !== 'string' || entry.name === '') {
      errors.push(p + '.name must be a non-empty string');
    }
    if (entry.notes !== null && entry.notes !== undefined && typeof entry.notes !== 'string') {
      errors.push(p + '.notes must be a string or null');
    }
    if (!Array.isArray(entry.sets) || entry.sets.length === 0) {
      errors.push(p + '.sets must be a non-empty array');
      return;
    }
    entry.sets.forEach((set: unknown, si: number) => {
      const sp = p + '.sets[' + si + ']';
      if (!isObject(set)) { errors.push(sp + ' must be an object'); return; }
      for (const f of ['reps', 'weightLb', 'timeMin', 'timeSec']) {
        // timeSec may be absent in sessions saved before it existed (absent = null).
        if (f === 'timeSec' && set[f] === undefined) continue;
        if (set[f] !== null && !isNonNegNumber(set[f])) {
          errors.push(sp + '.' + f + ' must be a number >= 0 or null');
        }
      }
      if (typeof set.done !== 'boolean') errors.push(sp + '.done must be a boolean');
    });
  });

  return errors;
}

/** Absent timeSec / notes become null. Returns a new object. */
export function normalizeSession(s: WorkoutSession): WorkoutSession {
  return {
    ...s,
    notes: s.notes ?? null,
    entries: s.entries.map((e) => ({
      ...e,
      notes: e.notes ?? null,
      sets: e.sets.map((st) => ({ ...st, timeSec: st.timeSec ?? null })),
    })),
  };
}

export function summarizeSession(s: WorkoutSession): SessionSummary {
  let setsDone = 0;
  for (const e of s.entries) for (const st of e.sets) if (st.done === true) setsDone++;
  return {
    id: s.id, day: s.day, startedAt: s.startedAt, completedAt: s.completedAt,
    exerciseCount: s.entries.length, setsDone,
  };
}

export function sortSessionsNewestFirst(sessions: WorkoutSession[]): WorkoutSession[] {
  return sessions.slice().sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

export function latestCompletedByDay(sessions: WorkoutSession[], days: number[]): Record<string, WorkoutSession | null> {
  const out: Record<string, WorkoutSession | null> = {};
  for (const d of days) out[String(d)] = null;
  for (const s of sortSessionsNewestFirst(sessions)) {
    const key = String(s.day);
    if (s.completedAt && Object.prototype.hasOwnProperty.call(out, key) && out[key] === null) out[key] = s;
  }
  return out;
}

// ---- FW module ----

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    v = v.trim();
    if (v === '') return null;
  }
  const n = Number(v);
  if (!isFinite(n) || n < 0) return null;
  return n;
}

export function formatNum(n: number | null | undefined): string {
  if (n === null || n === undefined || (n as unknown) === '') return '';
  return String(Number(Number(n).toFixed(2)));
}

/** Upper bound of a rest string, in seconds. "2 min" -> 120, "60–90 sec" -> 90. */
export function parseRestSeconds(rest: string | null): number | null {
  if (rest === null || rest === undefined) return null;
  const s = String(rest).toLowerCase();
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  let max = 0;
  for (const n of nums) max = Math.max(max, parseFloat(n));
  const unit = /min/.test(s) ? 60 : 1;
  return Math.round(max * unit);
}

const has = (v: unknown): boolean => v !== null && v !== undefined;

/** "3 × 12 @ 45 lb · rest 2 min", "10 min", "3 × 20" */
export function formatTarget(ex: RoutineExercise): string {
  let main = '';
  const sets = ex.sets ?? 0;
  if (has(ex.reps)) {
    main = (ex.sets || 1) + ' × ' + formatNum(ex.reps);
    if (has(ex.weightLb)) main += ' @ ' + formatNum(ex.weightLb) + ' lb';
  } else if (has(ex.timeSec)) {
    main = (sets > 1 ? sets + ' × ' : '') + formatNum(ex.timeSec) + ' s';
  } else if (has(ex.timeMin)) {
    main = (sets > 1 ? sets + ' × ' : '') + formatNum(ex.timeMin) + ' min';
  } else if (ex.sets) {
    main = ex.sets + (ex.sets === 1 ? ' set' : ' sets');
  }
  if (ex.rest) main += (main ? ' · ' : '') + 'rest ' + ex.rest;
  return main;
}

/** The day after the newest completed session (wrapping), else the first day. */
export function defaultDay(routine: Routine, recent: SessionSummary[]): number | null {
  const days = routine.days.map((d) => d.day).sort((a, b) => a - b);
  if (!days.length) return null;
  let newest: SessionSummary | null = null;
  for (const s of recent || []) {
    if (s && s.completedAt && (!newest || s.startedAt > newest.startedAt)) newest = s;
  }
  if (!newest) return days[0];
  const day = newest.day;
  for (const d of days) if (d > day) return d;
  return days[0];
}

function doneSets(entry: SessionEntry | null | undefined): SessionSet[] {
  if (!entry || !entry.sets) return [];
  return entry.sets.filter((s) => s && s.done);
}

/** "12×40, 12×40, 10×40" | "20, 18" | "1 min" | "—" */
export function formatLastTime(entry: SessionEntry | null | undefined): string {
  const sets = doneSets(entry);
  if (!sets.length) return '—';
  return sets.map((s) => {
    if (has(s.reps) && has(s.weightLb)) return formatNum(s.reps) + '×' + formatNum(s.weightLb);
    if (has(s.reps)) return formatNum(s.reps);
    if (has(s.weightLb)) return formatNum(s.weightLb) + ' lb';
    if (has(s.timeSec)) return formatNum(s.timeSec) + ' s';
    if (has(s.timeMin)) return formatNum(s.timeMin) + ' min';
    return '✓';
  }).join(', ');
}

/** True when the timed exercise is logged in seconds. */
export function isSeconds(ex: RoutineExercise): boolean {
  return !has(ex.reps) && has(ex.timeSec);
}

/** True when this exercise is logged as time rather than reps/weight. */
export function isTimed(ex: RoutineExercise): boolean {
  return !has(ex.reps) && (has(ex.timeMin) || isSeconds(ex));
}

/** Seconds for a saved set: timeSec, else legacy timeMin x 60, else null. */
function setSeconds(p: SessionSet): number | null {
  const sec = toNum(p.timeSec);
  if (sec !== null) return sec;
  const min = toNum(p.timeMin);
  return min === null ? null : min * 60;
}

/** Starting set rows: last time's matching done set, else the target. */
export function initialSets(ex: RoutineExercise, lastEntry: SessionEntry | null | undefined): SessionSet[] {
  const count = Math.max(1, ex.sets || 1);
  const prev = doneSets(lastEntry);
  const out: SessionSet[] = [];
  for (let i = 0; i < count; i++) {
    const p = prev[i];
    if (p) {
      if (isSeconds(ex)) {
        out.push({ reps: toNum(p.reps), weightLb: toNum(p.weightLb), timeMin: null, timeSec: setSeconds(p), done: false });
      } else {
        out.push({ reps: toNum(p.reps), weightLb: toNum(p.weightLb), timeMin: toNum(p.timeMin), timeSec: toNum(p.timeSec), done: false });
      }
    } else if (isTimed(ex)) {
      out.push({ reps: null, weightLb: null, timeMin: toNum(ex.timeMin), timeSec: toNum(ex.timeSec), done: false });
    } else {
      out.push({ reps: toNum(ex.reps), weightLb: toNum(ex.weightLb), timeMin: null, timeSec: null, done: false });
    }
  }
  return out;
}

/** A new set row: last time's matching done set, else a copy of the previous row. */
export function newSetFor(sets: SessionSet[], lastEntry: SessionEntry | null | undefined): SessionSet {
  const prevRow = sets[sets.length - 1];
  const lastSet = lastEntry && lastEntry.sets.filter((s) => s.done)[sets.length];
  const src: Partial<SessionSet> = lastSet || prevRow || {};
  return {
    reps: toNum(src.reps), weightLb: toNum(src.weightLb),
    timeMin: toNum(src.timeMin), timeSec: toNum(src.timeSec), done: false,
  };
}

/** Sets without the one at idx. Never removes the last remaining set. */
export function removeSetAt(sets: SessionSet[], idx: number): SessionSet[] {
  if (!Array.isArray(sets) || sets.length <= 1 || idx < 0 || idx >= sets.length) return sets.slice();
  return sets.slice(0, idx).concat(sets.slice(idx + 1));
}

function cleanNote(s: unknown): string | null {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t === '' ? null : t;
}

export function buildSession(state: {
  id: string; day: number; startedAt: string; completedAt: string | null;
  notes: string; exercises: { id: string; name: string }[]; log: Record<string, ExerciseLog>;
}): WorkoutSession {
  const entries: SessionEntry[] = [];
  for (const ex of state.exercises || []) {
    const l = state.log && state.log[ex.id];
    if (!l) continue;
    const note = cleanNote(l.notes);
    const sets: SessionSet[] = (l.sets || []).map((s) => ({
      reps: toNum(s.reps), weightLb: toNum(s.weightLb),
      timeMin: toNum(s.timeMin), timeSec: toNum(s.timeSec), done: !!s.done,
    }));
    const anyDone = sets.some((s) => s.done);
    if (!anyDone && note === null) continue;
    if (!sets.length) sets.push({ reps: null, weightLb: null, timeMin: null, timeSec: null, done: false });
    entries.push({ exerciseId: ex.id, name: ex.name, sets, notes: note });
  }
  return {
    schemaVersion: 1,
    id: state.id,
    day: state.day,
    startedAt: state.startedAt,
    completedAt: state.completedAt === undefined ? null : state.completedAt,
    entries,
    notes: cleanNote(state.notes),
  };
}

export function countDone(log: Record<string, ExerciseLog>): number {
  let n = 0;
  for (const k of Object.keys(log || {})) for (const s of log[k].sets || []) if (s.done) n++;
  return n;
}

export function formatClock(totalSec: number): string {
  const t = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

export function formatSessionDate(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const tz = timeZone ? { timeZone } : {};
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...tz }) + ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', ...tz });
}
