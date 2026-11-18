import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Layout, Sheet, Spinner } from '../../components';
import { getProfile } from '../../data/api';
import { loadWorkoutData, saveWorkoutSession } from '../../data/workouts';
import { ROUTINE, routineDay } from '../../lib/routine';
import type { RoutineExercise } from '../../lib/routine';
import {
  buildSession,
  countDone,
  defaultDay,
  DRAFT_KEY,
  formatClock,
  formatLastTime,
  formatNum,
  formatSessionDate,
  formatTarget,
  initialSets,
  isSeconds,
  isTimed,
  newSetFor,
  parseRestSeconds,
  removeSetAt,
  toNum,
} from '../../lib/workoutSession';
import type {
  DraftState,
  ExerciseLog,
  SessionEntry,
  SessionSet,
  SessionSummary,
  WorkoutSession,
} from '../../lib/workoutSession';
import './workout.css';

interface WorkoutData {
  recent: SessionSummary[];
  lastByDay: Record<string, WorkoutSession | null>;
}

interface Meta { id: string; startedAt: string }
interface Rest { end: number; label: string }
interface Saved { date: string }

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `w-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function lastEntries(data: WorkoutData, day: number): Record<string, SessionEntry> {
  const out: Record<string, SessionEntry> = {};
  for (const e of data.lastByDay[String(day)]?.entries ?? []) out[e.exerciseId] = e;
  return out;
}

function freshLog(data: WorkoutData, day: number): Record<string, ExerciseLog> {
  const last = lastEntries(data, day);
  const log: Record<string, ExerciseLog> = {};
  for (const ex of routineDay(ROUTINE, day)?.exercises ?? []) {
    log[ex.id] = { sets: initialSets(ex, last[ex.id]), notes: '' };
  }
  return log;
}

/** Overlay a saved draft onto a fresh log (unknown exercises ignored). */
function mergeDraft(base: Record<string, ExerciseLog>, draft: DraftState): Record<string, ExerciseLog> {
  const log = { ...base };
  for (const id of Object.keys(base)) {
    const d = draft.log[id];
    if (d && Array.isArray(d.sets) && d.sets.length) {
      log[id] = {
        sets: d.sets.map((s) => ({
          reps: toNum(s.reps),
          weightLb: toNum(s.weightLb),
          timeMin: toNum(s.timeMin),
          timeSec: toNum(s.timeSec),
          done: !!s.done,
        })),
        notes: d.notes || '',
      };
    }
  }
  return log;
}

function readDraft(): DraftState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DraftState;
    if (!d || typeof d !== 'object' || !d.id || !d.startedAt || !d.log || typeof d.day !== 'number') return null;
    return d;
  } catch {
    return null;
  }
}

function writeDraft(d: DraftState): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: carry on without a draft */
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export default function WorkoutScreen() {
  const [data, setData] = useState<WorkoutData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await loadWorkoutData());
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void load();
    getProfile().then((p) => setTz(p?.timezone)).catch(() => undefined);
  }, [load]);

  const actions = <Link to="/workout/history" className="wk-link">History</Link>;

  return (
    <Layout title="Workout" actions={actions}>
      {error && (
        <div className="stack">
          <p className="field__error" role="alert">{error}</p>
          <Button variant="secondary" onClick={() => void load()}>Retry</Button>
        </div>
      )}
      {!data && !error && <div className="spinner-wrap"><Spinner /></div>}
      {data && <Logger data={data} tz={tz} onReload={load} />}
    </Layout>
  );
}

function Logger({ data, tz, onReload }: { data: WorkoutData; tz: string | undefined; onReload: () => Promise<void> }) {
  const initialDay = useMemo(() => defaultDay(ROUTINE, data.recent) ?? ROUTINE.days[0].day, [data.recent]);
  const [day, setDay] = useState(initialDay);
  const [meta, setMeta] = useState<Meta>(() => ({ id: newId(), startedAt: '' }));
  const [log, setLog] = useState<Record<string, ExerciseLog>>(() => freshLog(data, initialDay));
  const [notes, setNotes] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<DraftState | null>(() => {
    const d = readDraft();
    if (d && routineDay(ROUTINE, d.day)) return d;
    if (d) clearDraft();
    return null;
  });
  const [rest, setRest] = useState<Rest | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  // Persist the draft whenever the workout changes.
  useEffect(() => {
    if (dirty && !saved) writeDraft({ id: meta.id, day, startedAt: meta.startedAt, log, notes });
  }, [dirty, saved, meta, day, log, notes]);

  const startDay = (n: number, draft?: DraftState) => {
    const base = freshLog(data, n);
    setDay(n);
    setRest(null);
    setSaveError(null);
    if (draft) {
      setMeta({ id: draft.id, startedAt: draft.startedAt });
      setLog(mergeDraft(base, draft));
      setNotes(draft.notes || '');
      setDirty(true);
    } else {
      setMeta({ id: newId(), startedAt: '' });
      setLog(base);
      setNotes('');
      setDirty(false);
    }
  };

  const chooseDay = (n: number) => {
    if (n === day) return;
    if (dirty && countDone(log) > 0 && !window.confirm(
      `Switch to Day ${n}? The sets you have logged for Day ${day} will be discarded.`,
    )) return;
    clearDraft();
    startDay(n);
  };

  const dayDef = routineDay(ROUTINE, day);
  const exercises = useMemo(() => dayDef?.exercises ?? [], [dayDef]);
  const last = lastEntries(data, day);

  // The workout clock starts at the first change (completedAt - startedAt counts as lifting time).
  // backdateSec: when the first action is finishing a timed set, the clock starts that long ago.
  const touch = (backdateSec = 0) => {
    setMeta((m) => (m.startedAt ? m : { ...m, startedAt: new Date(Date.now() - backdateSec * 1000).toISOString() }));
    setDirty(true);
  };
  const patchLog = (id: string, fn: (l: ExerciseLog) => ExerciseLog, backdateSec = 0) => {
    setLog((cur) => ({ ...cur, [id]: fn(cur[id]) }));
    touch(backdateSec);
  };
  const patchSet = (id: string, idx: number, patch: Partial<SessionSet>, backdateSec = 0) =>
    patchLog(id, (l) => ({ ...l, sets: l.sets.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }), backdateSec);

  const toggleDone = (ex: RoutineExercise, idx: number) => {
    const set = log[ex.id].sets[idx];
    const wasDone = set.done;
    const backdate = !wasDone && isTimed(ex) ? (set.timeMin ?? 0) * 60 + (set.timeSec ?? 0) : 0;
    patchSet(ex.id, idx, { done: !wasDone }, backdate);
    const restSec = parseRestSeconds(ex.rest);
    if (!wasDone && restSec) setRest({ end: Date.now() + restSec * 1000, label: ex.name });
  };

  const session = useMemo(
    () => buildSession({
      id: meta.id, day, startedAt: meta.startedAt || new Date(0).toISOString(), completedAt: null, notes, exercises, log,
    }),
    [meta, day, notes, exercises, log],
  );
  const doneCount = countDone(log);
  const canFinish = session.entries.length > 0;

  const finish = async () => {
    if (saving || !canFinish) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveWorkoutSession({ ...session, completedAt: new Date().toISOString() });
      clearDraft();
      setRest(null);
      setSaved({ date: res.date });
    } catch (e) {
      setSaveError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <Card title="Workout saved">
        <div className="stack">
          <p role="status">Saved · counts toward {fmtDate(saved.date)}’s activity</p>
          <Link to="/workout/history" className="btn btn--primary btn--block">View history</Link>
          <Button
            variant="secondary"
            block
            onClick={() => {
              setSaved(null);
              void onReload();
            }}
          >
            Log another workout
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="stack wk">
      {pending && (
        <Sheet open title="Unfinished workout" onClose={() => undefined}>
          <div className="stack">
            <p>
              You have an unfinished Day {pending.day} workout from {formatSessionDate(pending.startedAt, tz)}.
              Resume it?
            </p>
            <Button block onClick={() => { startDay(pending.day, pending); setPending(null); }}>Resume workout</Button>
            <Button variant="secondary" block onClick={() => { clearDraft(); setPending(null); }}>Discard it</Button>
          </div>
        </Sheet>
      )}

      <div className="wk-days" role="group" aria-label="Choose day">
        {ROUTINE.days.map((d) => (
          <button
            key={d.day}
            type="button"
            className="wk-day"
            aria-pressed={d.day === day}
            onClick={() => chooseDay(d.day)}
          >
            Day {d.day} · {d.areas}
          </button>
        ))}
      </div>

      {exercises.map((ex) => (
        <ExerciseCard
          key={`${day}-${ex.id}`}
          ex={ex}
          rec={log[ex.id]}
          lastEntry={last[ex.id]}
          onSet={(idx, patch) => patchSet(ex.id, idx, patch)}
          onDone={(idx) => toggleDone(ex, idx)}
          onAdd={() => patchLog(ex.id, (l) => ({ ...l, sets: [...l.sets, newSetFor(l.sets, last[ex.id])] }))}
          onRemove={(idx) => patchLog(ex.id, (l) => ({ ...l, sets: removeSetAt(l.sets, idx) }))}
          onNote={(v) => patchLog(ex.id, (l) => ({ ...l, notes: v }))}
        />
      ))}

      <Card title="Workout notes">
        <textarea
          className="wk-notes"
          rows={2}
          placeholder="Notes about this workout (optional)"
          aria-label="Workout notes"
          value={notes}
          onChange={(e) => { setNotes(e.target.value); touch(); }}
        />
      </Card>

      {rest && <RestBanner key={rest.label} rest={rest} onChange={setRest} />}

      <div className="wk-finish">
        {saveError && <p className="field__error" role="alert">Save failed: {saveError}</p>}
        <Button block onClick={() => void finish()} disabled={!canFinish || saving}>
          {saving ? 'Saving…' : `Finish workout${doneCount ? ` · ${doneCount} ${doneCount === 1 ? 'set' : 'sets'}` : ''}`}
        </Button>
      </div>
    </div>
  );
}

function RestBanner({ rest, onChange }: { rest: Rest; onChange: (r: Rest | null) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const buzzed = useRef(false);
  const left = (rest.end - now) / 1000;
  const over = left <= 0;

  useEffect(() => {
    if (over) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [over]);

  useEffect(() => {
    if (over && !buzzed.current) {
      buzzed.current = true;
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        /* ignore */
      }
    }
    if (!over) buzzed.current = false;
  }, [over]);

  const extend = (sec: number) => {
    const t = Date.now();
    setNow(t);
    onChange({ ...rest, end: Math.max(t, rest.end) + sec * 1000 });
  };

  return (
    <div className={`wk-rest${over ? ' wk-rest--over' : ''}`} role="timer" aria-live="off">
      <div className="wk-rest__label">{over ? 'Rest over. Next set!' : `Rest · ${rest.label}`}</div>
      <div className="wk-rest__time num" data-testid="rest-time">{over ? '0:00' : formatClock(left)}</div>
      <button type="button" className="wk-rest__btn" aria-label="Subtract 15 seconds" onClick={() => extend(-15)}>−15s</button>
      <button type="button" className="wk-rest__btn" aria-label="Add 15 seconds" onClick={() => extend(15)}>+15s</button>
      <button type="button" className="wk-rest__btn" aria-label="Dismiss rest timer" onClick={() => onChange(null)}>✕</button>
    </div>
  );
}

interface CardProps {
  ex: RoutineExercise;
  rec: ExerciseLog;
  lastEntry: SessionEntry | undefined;
  onSet: (idx: number, patch: Partial<SessionSet>) => void;
  onDone: (idx: number) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onNote: (v: string) => void;
}

function ExerciseCard({ ex, rec, lastEntry, onSet, onDone, onAdd, onRemove, onNote }: CardProps) {
  const timed = isTimed(ex);
  const [showNote, setShowNote] = useState(!!rec.notes);
  return (
    <section className={`card wk-ex${ex.warmup ? ' wk-ex--warm' : ''}`}>
      <div className="wk-ex__head">
        <h2 className="wk-ex__name">{ex.name}</h2>
        {ex.warmup && <span className="wk-tag">warm-up</span>}
      </div>
      <p className="wk-target">{formatTarget(ex)}</p>
      {ex.notes && <p className="act-note">{ex.notes}</p>}
      <p className="act-note">Last time: <b>{formatLastTime(lastEntry)}</b></p>

      {rec.sets.map((s, i) => (
        <div key={i} className={`wk-set${s.done ? ' wk-set--done' : ''}`}>
          <div className="wk-set__head">
            <span className="wk-set__n">Set {i + 1}</span>
            <div className="wk-set__btns">
              {rec.sets.length > 1 && (
                <button type="button" className="wk-remove" aria-label={`Remove set ${i + 1} of ${ex.name}`} onClick={() => onRemove(i)}>×</button>
              )}
              <button type="button" className="wk-done" aria-pressed={s.done} aria-label={`Done set ${i + 1} of ${ex.name}`} onClick={() => onDone(i)}>
                {s.done ? '✓ Done' : 'Done'}
              </button>
            </div>
          </div>
          <div className={`wk-fields${timed ? ' wk-fields--one' : ''}`}>
            {timed ? (
              isSeconds(ex) ? (
                <Stepper label="Seconds" value={s.timeSec} step={5} onChange={(v) => onSet(i, { timeSec: v })} />
              ) : (
                <Stepper label="Minutes" value={s.timeMin} step={1} onChange={(v) => onSet(i, { timeMin: v })} />
              )
            ) : (
              <>
                <Stepper label="Reps" value={s.reps} step={1} onChange={(v) => onSet(i, { reps: v })} />
                <Stepper label="Weight (lb)" value={s.weightLb} step={2.5} onChange={(v) => onSet(i, { weightLb: v })} />
              </>
            )}
          </div>
        </div>
      ))}

      <div className="wk-ex__actions">
        <Button variant="ghost" onClick={onAdd}>+ Add set</Button>
        {!showNote && <Button variant="ghost" onClick={() => setShowNote(true)}>+ Note</Button>}
      </div>
      {showNote && (
        <textarea
          className="wk-notes"
          rows={2}
          placeholder={`Notes for ${ex.name}`}
          aria-label={`Notes for ${ex.name}`}
          value={rec.notes}
          onChange={(e) => onNote(e.target.value)}
        />
      )}
    </section>
  );
}

function Stepper({ label, value, step, onChange }: {
  label: string; value: number | null; step: number; onChange: (v: number | null) => void;
}) {
  // Keep the raw text locally so partial input such as "2." is not reformatted while typing.
  const [text, setText] = useState(formatNum(value));
  useEffect(() => {
    setText((t) => (toNum(t) === value ? t : formatNum(value)));
  }, [value]);

  const bump = (d: number) => {
    const v = Math.max(0, Math.round(((toNum(text) ?? 0) + d) * 100) / 100);
    setText(formatNum(v));
    onChange(v);
  };

  return (
    <div className="wk-stepper-field">
      <span className="wk-stepper-label">{label}</span>
      <div className="wk-stepper">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => bump(-step)}>−</button>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          placeholder="–"
          aria-label={label}
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => { setText(e.target.value); onChange(toNum(e.target.value)); }}
        />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => bump(step)}>+</button>
      </div>
    </div>
  );
}
