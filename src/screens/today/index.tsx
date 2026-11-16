import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Layout, ProgressBar, Sheet, Spinner } from '../../components';
import {
  addWater,
  deleteFoodLog,
  deleteWater,
  getProfile,
  loadDay,
  updateFoodLog,
} from '../../data/api';
import { addDays, todayIn } from '../../lib/dates';
import { scaleTotals, sumNutrients } from '../../lib/portions';
import { computeTargets } from '../../lib/targets';
import type { DayData, FoodLog } from '../../lib/types';
import { flOzToMl, formatVolume, mlToFlOz } from '../../lib/units';
import './today.css';

const r1 = (n: number) => Math.round(n * 10) / 10;
const g0 = (n: number) => Math.round(n);
const n0 = (n: number) => Math.round(n).toLocaleString('en-US');

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function TodayScreen() {
  const params = useParams();
  const navigate = useNavigate();
  const [resolvedDate, setResolvedDate] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [day, setDay] = useState<DayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<FoodLog | null>(null);
  const [qty, setQty] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState('');

  const paramDate = params.date ?? null;
  const date = paramDate ?? resolvedDate;

  // Resolve "today" in the profile's timezone when there is no route date.
  useEffect(() => {
    if (paramDate) return;
    let active = true;
    getProfile()
      .then((p) => {
        if (!active) return;
        if (!p) throw new Error('No profile');
        const t = todayIn(p.timezone);
        setToday(t);
        setResolvedDate(t);
      })
      .catch((e) => active && setError(errMsg(e)));
    return () => {
      active = false;
    };
  }, [paramDate]);

  const reload = useCallback(async (d: string) => {
    const data = await loadDay(d);
    setDay(data);
    setToday(todayIn(data.profile.timezone));
    setError(null);
  }, []);

  useEffect(() => {
    if (!date) return;
    let active = true;
    setDay(null);
    Promise.resolve()
      .then(() => loadDay(date))
      .then((data) => {
        if (!active) return;
        setDay(data);
        setToday(todayIn(data.profile.timezone));
        setError(null);
      })
      .catch((e) => active && setError(errMsg(e)));
    return () => {
      active = false;
    };
  }, [date]);

  /** Run a write, then re-load the day. Errors are shown, never dropped. */
  const write = async (
    fn: () => Promise<unknown>,
    onError: (m: string | null) => void = setActionError,
  ): Promise<boolean> => {
    if (!date) return false;
    setBusy(true);
    onError(null);
    try {
      await fn();
      await reload(date);
      return true;
    } catch (e) {
      onError(errMsg(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const calc = useMemo(() => {
    if (!day || day.weightKg === null) return null;
    return computeTargets({
      profile: day.profile,
      weightKg: day.weightKg,
      date: day.date,
      activity: day.activity,
      workouts: day.workouts,
    });
  }, [day]);

  if (error && !day) {
    return (
      <Layout title="Today">
        <p className="today__error" role="alert">{error}</p>
      </Layout>
    );
  }
  if (!day || !date) {
    return (
      <Layout title="Today">
        <Spinner />
      </Layout>
    );
  }

  const units = day.profile.units;
  const imperial = units === 'imperial';
  const eaten = sumNutrients(day.foodLogs.map((l) => l.totals));
  const waterMl = day.waterLogs.reduce((s, w) => s + w.ml, 0) + eaten.waterMl;
  const toDisplay = (ml: number) => (imperial ? mlToFlOz(ml) : ml);
  const waterUnit = imperial ? 'fl oz' : 'ml';
  const quick = imperial ? [8, 12, 16] : [250, 330, 500];
  const toMl = (v: number) => (imperial ? flOzToMl(v) : v);
  const isToday = date === today;

  const openEdit = (l: FoodLog) => {
    setEditing(l);
    setQty(String(l.quantity));
    setSheetError(null);
  };
  const saveEdit = async () => {
    if (!editing) return;
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      setSheetError('Enter an amount greater than 0.');
      return;
    }
    const ratio = q / editing.quantity;
    const ok = await write(
      () =>
        updateFoodLog(editing.id, {
          quantity: q,
          unitLabel: editing.unitLabel,
          grams: editing.grams === null ? null : r1(editing.grams * ratio),
          totals: scaleTotals(editing.totals, ratio),
        }),
      setSheetError,
    );
    if (ok) setEditing(null);
  };
  const removeEdit = async () => {
    if (!editing) return;
    if (!window.confirm(`Delete ${editing.name}?`)) return;
    const ok = await write(() => deleteFoodLog(editing.id), setSheetError);
    if (ok) setEditing(null);
  };
  const addCustom = async () => {
    const v = Number(custom);
    if (!Number.isFinite(v) || v <= 0) {
      setActionError('Enter a water amount greater than 0.');
      return;
    }
    if (await write(() => addWater(date, toMl(v)))) {
      setCustom('');
      setCustomOpen(false);
    }
  };

  const a = day.activity;
  const hourParts: Array<[string, number]> = a
    ? [
        ['sedentary', a.hours.sedentaryH],
        ['light cardio', a.hours.lightCardioH],
        ['strenuous cardio', a.hours.strenuousCardioH],
        ['lifting', a.hours.liftingH],
      ]
    : [];
  const activitySummary = !a
    ? 'No activity logged (counted as sedentary)'
    : a.mode === 'direct'
      ? `${n0(a.directKcal ?? 0)} kcal burned`
      : hourParts
          .filter(([, h]) => h > 0)
          .map(([n, h]) => `${r1(h)} h ${n}`)
          .join(', ') || 'Nothing entered';

  return (
    <Layout
      title={
        <span className="today__nav">
          <Button variant="ghost" aria-label="Previous day" onClick={() => navigate(`/day/${addDays(date, -1)}`)}>
            ‹
          </Button>
          <span className="today__date">{dayLabel(date, today ?? date)}</span>
          <Button variant="ghost" aria-label="Next day" onClick={() => navigate(`/day/${addDays(date, 1)}`)}>
            ›
          </Button>
        </span>
      }
    >
      <div className="stack">
        {!isToday && (
          <Button variant="secondary" block onClick={() => navigate('/')}>
            Today
          </Button>
        )}
        {actionError && <p className="today__error" role="alert">{actionError}</p>}
        {error && <p className="today__error" role="alert">{error}</p>}

        {calc ? (
          <Card title="Remaining">
            <div className="stack">
              <ProgressBar label="Calories" unit="kcal" value={eaten.kcal} target={calc.targets.kcal} />
              <ProgressBar label="Protein" unit="g" value={eaten.proteinG} target={calc.targets.proteinG} />
              <ProgressBar label="Carbs" unit="g" value={eaten.carbsG} target={calc.targets.carbsG} />
              <ProgressBar label="Fat" unit="g" value={eaten.fatG} target={calc.targets.fatG} />
              <ProgressBar
                label="Water"
                unit={waterUnit}
                value={toDisplay(waterMl)}
                target={toDisplay(calc.targets.waterMl)}
              />
              <details className="today__calc">
                <summary>How this is calculated</summary>
                <p className="muted">
                  Estimates: BMR {n0(calc.bmr)} kcal + activity {n0(calc.activityKcal)} kcal = burn {n0(calc.burn)} kcal.
                  The goal adjustment ({day.profile.goal.replace('_', ' ')}) gives a calorie target of{' '}
                  {n0(calc.targets.kcal)} kcal.
                </p>
                {!calc.countsWorkouts && day.workouts.length > 0 && (
                  <p className="muted">Imported workouts aren't counted while you're using direct calories</p>
                )}
              </details>
            </div>
          </Card>
        ) : (
          <Card title="Targets">
            <p>Add your weight in Settings to see your daily targets.</p>
            <Link to="/settings">Go to Settings</Link>
          </Card>
        )}

        <Card title="Food">
          {day.foodLogs.length === 0 && <p className="muted">Nothing logged yet.</p>}
          {day.foodLogs.map((l) => (
            <button type="button" key={l.id} className="today__row" onClick={() => openEdit(l)}>
              <span className="today__main">
                <span className="today__name">{l.name}</span>
                <span className="today__sub num">
                  {l.quantity} {l.unitLabel} · P {g0(l.totals.proteinG)} C {g0(l.totals.carbsG)} F {g0(l.totals.fatG)}
                </span>
              </span>
              <span className="today__kcal num">{g0(l.totals.kcal)} kcal</span>
            </button>
          ))}
          <div className="today__actions">
            <Button block onClick={() => navigate(`/day/${date}/add`)}>
              + Add food
            </Button>
          </div>
        </Card>

        <Card title="Water">
          <div className="today__chips">
            {quick.map((v) => (
              <Button key={v} variant="secondary" disabled={busy} onClick={() => write(() => addWater(date, toMl(v)))}>
                +{v} {waterUnit}
              </Button>
            ))}
            <Button variant="ghost" onClick={() => setCustomOpen((o) => !o)}>
              Custom
            </Button>
          </div>
          {customOpen && (
            <div className="stack">
              <Field
                label={`Amount (${waterUnit})`}
                type="number"
                inputMode="decimal"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
              <Button disabled={busy} onClick={addCustom}>
                Add water
              </Button>
            </div>
          )}
          {day.waterLogs.map((w) => (
            <div key={w.id} className="today__row today__row--static">
              <span className="num">{formatVolume(w.ml, units)}</span>
              <Button
                variant="ghost"
                aria-label={`Delete water ${formatVolume(w.ml, units)}`}
                disabled={busy}
                onClick={() => write(() => deleteWater(w.id))}
              >
                Delete
              </Button>
            </div>
          ))}
        </Card>

        <Card title="Activity">
          <p>
            <strong>{a ? (a.mode === 'direct' ? 'Direct calories' : 'Hours') : 'Not set'}</strong>
          </p>
          <p className="muted">{activitySummary}</p>
          <p className="muted">
            {day.workouts.length} imported workout{day.workouts.length === 1 ? '' : 's'}
          </p>
          <Link to={`/day/${date}/activity`}>Edit activity</Link>
        </Card>
      </div>

      <Sheet open={editing !== null} title={editing ? `Edit ${editing.name}` : 'Edit'} onClose={() => setEditing(null)}>
        {editing && (
          <div className="stack">
            <Field
              label={`Amount (${editing.unitLabel})`}
              type="number"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            {sheetError && <p className="today__error" role="alert">{sheetError}</p>}
            <Button disabled={busy} onClick={saveEdit}>
              Save
            </Button>
            <Button variant="danger" disabled={busy} onClick={removeEdit}>
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        )}
      </Sheet>
    </Layout>
  );
}
