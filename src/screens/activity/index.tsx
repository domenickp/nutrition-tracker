import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Layout, Sheet, Spinner } from '../../components';
import {
  deleteWorkout,
  listExerciseRules,
  loadDay,
  saveActivity,
  saveExerciseRules,
  saveWorkout,
} from '../../data/api';
import { addDays } from '../../lib/dates';
import { MET, WAKING_HOURS, computeTargets } from '../../lib/targets';
import type { DailyActivity, DayData, ExerciseCategory, WorkoutSummary } from '../../lib/types';
import {
  analyzeWorkout,
  parseWorkoutJson,
  rulesFromAnalysis,
  summarizeWorkout,
} from '../../lib/workoutImport';
import type { WorkoutAnalysis } from '../../lib/workoutImport';
import './activity.css';

type Mode = 'direct' | 'hours';

const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  light_cardio: 'Light cardio',
  strenuous_cardio: 'Strenuous cardio',
  lifting: 'Weight lifting',
};

function fmtStart(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function utcDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(utcDate(date));
}

function shortDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(
    utcDate(date),
  );
}

const BREAKDOWN_ROWS = [
  ['sedentary', 'Sedentary'],
  ['light', 'Light cardio'],
  ['strenuous', 'Strenuous cardio'],
  ['lifting', 'Weight lifting'],
] as const;

const min = (h: number) => Math.round(h * 60);
const toNum = (s: string) => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function ActivityScreen() {
  const { date = '' } = useParams();
  const [day, setDay] = useState<DayData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setDay(await loadDay(date));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [date]);

  useEffect(() => {
    setDay(null);
    void reload();
  }, [reload]);

  const title = (
    <span className="act-date">
      <Link to={`/day/${addDays(date, -1)}/activity`} aria-label="Previous day">‹</Link>
      <span>Activity · {date ? shortDate(date) : ''}</span>
      <Link to={`/day/${addDays(date, 1)}/activity`} aria-label="Next day">›</Link>
    </span>
  );

  return (
    <Layout title={title}>
      {error && <p className="field__error" role="alert">{error}</p>}
      {!day && !error && <div className="spinner-wrap"><Spinner /></div>}
      {day && (
        <div className="stack">
          <ActivityCard key={day.date} day={day} onSaved={reload} />
          <WorkoutsCard day={day} onChanged={reload} />
        </div>
      )}
    </Layout>
  );
}

function ActivityCard({ day, onSaved }: { day: DayData; onSaved: () => Promise<void> }) {
  const a = day.activity;
  const [mode, setMode] = useState<Mode>(a?.mode ?? 'hours');
  const [kcal, setKcal] = useState(a?.directKcal != null ? String(a.directKcal) : '');
  const [h, setH] = useState({
    lightCardioH: String(a?.hours.lightCardioH ?? 0),
    strenuousCardioH: String(a?.hours.strenuousCardioH ?? 0),
    liftingH: String(a?.hours.liftingH ?? 0),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const draft: DailyActivity = useMemo(
    () => ({
      date: day.date,
      mode,
      directKcal: mode === 'direct' ? toNum(kcal) : null,
      hours: {
        sedentaryH: 0, // derived (16 h minus exercise); column kept for compatibility
        lightCardioH: toNum(h.lightCardioH),
        strenuousCardioH: toNum(h.strenuousCardioH),
        liftingH: toNum(h.liftingH),
      },
    }),
    [day.date, mode, kcal, h],
  );

  const estimate = useMemo(
    () =>
      day.weightKg == null
        ? null
        : computeTargets({
            profile: day.profile,
            weightKg: day.weightKg,
            date: day.date,
            activity: draft,
            workouts: day.workouts,
          }),
    [day, draft],
  );

  const save = async () => {
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      await saveActivity(draft);
      setSaved(true);
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const hourField = (key: keyof typeof h, label: string) => (
    <Field
      label={label}
      type="number"
      inputMode="decimal"
      min={0}
      step={0.25}
      value={h[key]}
      onChange={(e) => setH({ ...h, [key]: e.target.value })}
    />
  );

  return (
    <Card title={`Activity for ${fmtDate(day.date)}`}>
      <div className="stack">
        <div className="act-toggle" role="group" aria-label="Activity mode">
          <Button variant={mode === 'direct' ? 'primary' : 'secondary'} aria-pressed={mode === 'direct'} onClick={() => setMode('direct')}>
            Enter calories
          </Button>
          <Button variant={mode === 'hours' ? 'primary' : 'secondary'} aria-pressed={mode === 'hours'} onClick={() => setMode('hours')}>
            Estimate from time
          </Button>
        </div>

        {mode === 'direct' ? (
          <Field
            label="Active calories (kcal)"
            hint="Active calories, like your watch shows"
            type="number"
            inputMode="numeric"
            min={0}
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
          />
        ) : (
          <>
            <p className="act-note">Enter hours as decimals (1.5 = 1 h 30 min).</p>
            <p className="act-note">
              Sedentary time is {WAKING_HOURS} waking hours minus all exercise: the hours entered here plus logged
              workouts (never below 0).
            </p>
            {hourField('lightCardioH', 'Light cardio hours')}
            {hourField('strenuousCardioH', 'Strenuous cardio hours')}
            {hourField('liftingH', 'Weight lifting hours')}
          </>
        )}

        {estimate ? (
          <div className="act-estimate" aria-live="polite">
            {estimate.breakdown && (
              <>
                <table className="act-breakdown">
                  <thead>
                    <tr><th scope="col">Category</th><th scope="col">Hours</th><th scope="col">kcal</th></tr>
                  </thead>
                  <tbody>
                    {BREAKDOWN_ROWS.map(([key, label]) => {
                      const p = estimate.breakdown![key];
                      return (
                        <tr key={key}>
                          <th scope="row">{label} <small>MET {MET[key]}</small></th>
                          <td className="num">{p.hours.toFixed(1)}</td>
                          <td className="num">{Math.round(p.kcal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {day.workouts.length > 0 && (
                  <p className="act-note">Hours include this day’s imported workouts.</p>
                )}
              </>
            )}
            <span>Activity total: <strong className="num">{estimate.activityKcal} kcal</strong></span>
            <span>Calorie target: <strong className="num">{estimate.targets.kcal} kcal</strong></span>
          </div>
        ) : (
          <p className="act-note">Log a weight to see the estimate.</p>
        )}

        {err && <p className="field__error" role="alert">{err}</p>}
        {saved && <p className="act-note" role="status">Saved.</p>}
        <Button block onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save activity'}</Button>
      </div>
    </Card>
  );
}

function WorkoutsCard({ day, onChanged }: { day: DayData; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tz = day.profile.timezone;

  const remove = async (w: WorkoutSummary) => {
    if (!window.confirm('Delete this workout?')) return;
    try {
      await deleteWorkout(w.id);
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card title="Imported workouts">
      <div className="stack">
        {day.activity?.mode === 'direct' && (
          <p className="act-note">
            In calorie mode, imported workouts don’t count toward calories (they still raise your water target).
          </p>
        )}
        {day.workouts.length === 0 ? (
          <p className="muted">No workouts imported for this day.</p>
        ) : (
          <ul className="act-list">
            {day.workouts.map((w) => (
              <li key={w.id} className="act-row">
                <div>
                  <div>{fmtStart(w.startedAt, tz)}</div>
                  <div className="act-note num">
                    Cardio {min(w.lightCardioH + w.strenuousCardioH)} min · Lifting {min(w.liftingH)} min
                  </div>
                </div>
                <Button variant="danger" onClick={() => remove(w)} aria-label={`Delete workout ${fmtStart(w.startedAt, tz)}`}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
        {err && <p className="field__error" role="alert">{err}</p>}
        <Button variant="secondary" block onClick={() => setOpen(true)}>Import workout</Button>
      </div>
      {open && <ImportSheet day={day} onClose={() => setOpen(false)} onChanged={onChanged} />}
    </Card>
  );
}

interface ReviewState {
  a: WorkoutAnalysis;
  categories: Record<string, ExerciseCategory>;
  sessionMin: string;
}

function ImportSheet({ day, onClose, onChanged }: { day: DayData; onClose: () => void; onChanged: () => Promise<void> }) {
  const navigate = useNavigate();
  const tz = day.profile.timezone;
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewState[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<number | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
  };

  const parse = async () => {
    setError(null);
    const r = parseWorkoutJson(text);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setBusy(true);
    try {
      const rules = await listExerciseRules();
      setReviews(
        r.workouts.map((raw) => ({
          a: analyzeWorkout(raw, { timeZone: tz, rules }),
          categories: {},
          sessionMin: '',
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, patch: Partial<ReviewState>) =>
    setReviews((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const sessionOverride = (r: ReviewState) =>
    r.a.sessionMin == null && r.sessionMin.trim() !== '' ? Math.max(0, parseFloat(r.sessionMin)) : undefined;

  const invalid = (reviews ?? []).some(
    (r) => r.a.sessionMin == null && !(Number.isFinite(parseFloat(r.sessionMin)) && parseFloat(r.sessionMin) >= 0),
  );

  /** Save workouts from index `from`; `replaceIdx` forces overwrite of that one; `skip` drops it. */
  const run = async (from: number, replaceIdx: number | null, skip = false) => {
    if (!reviews) return;
    setBusy(true);
    setError(null);
    setConflict(null);
    const saved: string[] = [];
    try {
      for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i];
        if (i < from) {
          saved.push(r.a.date);
          continue;
        }
        if (i === from && skip) continue;
        const summary = summarizeWorkout(r.a, { categories: r.categories, sessionMin: sessionOverride(r) });
        const res = await saveWorkout(summary, replaceIdx === i);
        if (res === 'exists') {
          setConflict(i);
          setBusy(false);
          return;
        }
        await saveExerciseRules(rulesFromAnalysis(r.a, r.categories));
        saved.push(r.a.date);
      }
      onClose();
      const other = saved.find((d) => d !== day.date);
      if (other) navigate(`/day/${other}/activity`);
      else await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open title="Import workout" onClose={onClose}>
      <div className="stack">
        {!reviews ? (
          <>
            <textarea
              className="act-textarea"
              aria-label="Workout JSON"
              placeholder="Paste workout JSON here"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <label className="field">
              <span className="field__label">Or choose a file</span>
              <input type="file" accept=".json,application/json" aria-label="Workout file" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            {error && <p className="field__error" role="alert">{error}</p>}
            <Button block onClick={parse} disabled={busy || text.trim() === ''}>Review</Button>
          </>
        ) : (
          <>
            {reviews.map((r, i) => (
              <ReviewCard key={r.a.id} r={r} pageDate={day.date} tz={tz} onChange={(p) => update(i, p)} />
            ))}
            {conflict !== null && (
              <div className="act-warn" role="alert">
                <p>Already imported — replace it?</p>
                <div className="act-toggle">
                  <Button onClick={() => run(conflict, conflict)}>Replace</Button>
                  <Button variant="secondary" onClick={() => run(conflict, null, true)}>Skip</Button>
                </div>
              </div>
            )}
            {error && <p className="field__error" role="alert">{error}</p>}
            <Button block onClick={() => run(0, null)} disabled={busy || invalid || conflict !== null}>
              {busy ? 'Saving…' : 'Save workout'}
            </Button>
            <Button variant="ghost" block onClick={() => setReviews(null)} disabled={busy}>Back</Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

function ReviewCard({
  r,
  pageDate,
  tz,
  onChange,
}: {
  r: ReviewState;
  pageDate: string;
  tz: string;
  onChange: (p: Partial<ReviewState>) => void;
}) {
  const { a } = r;
  return (
    <div className="act-review">
      <strong>{fmtStart(a.startedAt, tz)}</strong>
      {a.date !== pageDate && (
        <p className="act-warn" role="alert">
          This workout started {fmtStart(a.startedAt, tz)}, so it will be saved to {shortDate(a.date)}.
        </p>
      )}
      {a.sessionMin != null ? (
        <p className="act-note num">Session length: {Math.round(a.sessionMin)} min</p>
      ) : (
        <Field
          label="Session length (minutes)"
          hint="No end time in the file; enter how long it took"
          type="number"
          inputMode="numeric"
          min={0}
          value={r.sessionMin}
          onChange={(e) => onChange({ sessionMin: e.target.value })}
        />
      )}
      {a.exercises.map((ex) => (
        <div key={ex.exerciseId} className="act-ex">
          <label className="field__label" htmlFor={`cat-${a.id}-${ex.exerciseId}`}>
            {ex.name}
            {ex.source === 'guess' && <span className="act-badge">guessed</span>}
          </label>
          <select
            id={`cat-${a.id}-${ex.exerciseId}`}
            className="act-select"
            value={r.categories[ex.exerciseId] ?? ex.category}
            onChange={(e) =>
              onChange({ categories: { ...r.categories, [ex.exerciseId]: e.target.value as ExerciseCategory } })
            }
          >
            {(Object.keys(CATEGORY_LABEL) as ExerciseCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
          <span className="act-note num">
            {Math.round(ex.timedMin)} timed min · {ex.doneSets} sets
          </span>
        </div>
      ))}
    </div>
  );
}
