import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, Layout, Spinner } from '../../components';
import { addWeight, getLatestWeight, getProfile, listSuggestionRecords, saveProfile } from '../../data/api';
import { signOut } from '../../data/auth';
import { localDate, todayIn } from '../../lib/dates';
import type { EverydayActivity, Goal, Profile, ProfileInput, Sex, Units } from '../../lib/types';
import {
  DEFAULT_WATER_ML_PER_KG,
  GOAL_DEFAULTS,
  convertField,
  heightFromFields,
  heightToFields,
  num,
  proteinFromField,
  proteinToField,
  waterFromField,
  waterToField,
  weightFromField,
  weightToField,
} from './convert';
import YourData from './YourData';
import styles from './settings.module.css';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function timeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  if (!zones.includes(current)) zones = [current, ...zones];
  return zones;
}

function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

interface Form {
  birthMonth: string;
  birthYear: string;
  sex: Sex;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  goal: Goal;
  everydayActivity: EverydayActivity;
  units: Units;
  timezone: string;
  weight: string;
  adjust: string;
  protein: string;
  fat: string;
  water: string;
}

function emptyForm(): Form {
  return {
    birthMonth: '', birthYear: '', sex: 'male', heightCm: '', heightFt: '', heightIn: '',
    goal: 'maintain', everydayActivity: 'sedentary', units: 'imperial', timezone: browserZone(), weight: '',
    adjust: '', protein: '', fat: '', water: '',
  };
}

function formFromProfile(p: Profile, weightKg: number | null): Form {
  const h = heightToFields(p.heightCm, p.units);
  return {
    birthMonth: String(p.birthMonth),
    birthYear: String(p.birthYear),
    sex: p.sex,
    heightCm: h.cm, heightFt: h.ft, heightIn: h.in,
    goal: p.goal,
    everydayActivity: p.everydayActivity,
    units: p.units,
    timezone: p.timezone,
    weight: weightKg === null ? '' : weightToField(weightKg, p.units),
    adjust: p.overrideKcalAdjustPct === null ? '' : String(p.overrideKcalAdjustPct),
    protein: p.overrideProteinGPerLb === null ? '' : proteinToField(p.overrideProteinGPerLb, p.units),
    fat: p.overrideFatPct === null ? '' : String(p.overrideFatPct),
    water: p.overrideWaterBaseMlPerKg === null ? '' : waterToField(p.overrideWaterBaseMlPerKg, p.units),
  };
}

type Errors = Partial<Record<keyof Form | 'height', string>>;

function validate(f: Form): Errors {
  const e: Errors = {};
  const year = Number(f.birthYear);
  const thisYear = new Date().getFullYear();
  if (!f.birthMonth) e.birthMonth = 'Choose a month.';
  if (!/^\d{4}$/.test(f.birthYear.trim()) || year < 1900 || year > thisYear) {
    e.birthYear = `Enter a year from 1900 to ${thisYear}.`;
  }
  const cm = heightFromFields({ cm: f.heightCm, ft: f.heightFt, in: f.heightIn }, f.units);
  if (cm === null || cm < 90 || cm > 250) {
    e.height = f.units === 'imperial'
      ? 'Enter a height between about 3 ft and 8 ft 2 in.'
      : 'Enter a height between 90 and 250 cm.';
  }
  const kg = weightFromField(f.weight, f.units);
  if (f.weight.trim() === '') e.weight = 'Enter your current weight.';
  else if (kg === null || kg < 25 || kg > 350) {
    e.weight = f.units === 'imperial' ? 'Enter a weight between 55 and 770 lb.' : 'Enter a weight between 25 and 350 kg.';
  }
  if (f.adjust.trim() !== '') {
    const n = num(f.adjust);
    if (n === null || n < -40 || n > 40) e.adjust = 'Enter a percentage from -40 to 40.';
  }
  if (f.fat.trim() !== '') {
    const n = num(f.fat);
    if (n === null || n < 10 || n > 60) e.fat = 'Enter a percentage from 10 to 60.';
  }
  if (f.protein.trim() !== '') {
    const n = proteinFromField(f.protein, f.units);
    if (n === null || n <= 0 || n > 3) e.protein = 'Enter a sensible protein amount (about 0.5 to 1.5 g per lb).';
  }
  if (f.water.trim() !== '') {
    const n = waterFromField(f.water, f.units);
    if (n === null || n <= 0 || n > 150) e.water = 'Enter a sensible base water amount.';
  }
  return e;
}

export default function SettingsScreen() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [initialKg, setInitialKg] = useState<number | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [suggestedOn, setSuggestedOn] = useState<{ pct: number; date: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const profile = await getProfile();
        if (!active) return;
        if (!profile) {
          setFirstRun(true);
          setInitialKg(null);
          setSuggestedOn(null);
          setForm(emptyForm());
        } else {
          setFirstRun(false);
          const kg = await getLatestWeight(todayIn(profile.timezone));
          if (!active) return;
          setInitialKg(kg);
          setForm(formFromProfile(profile, kg));
          const records = await listSuggestionRecords();
          if (!active) return;
          const latest = records
            ?.filter((r) => r.kind === 'calorie' && r.action === 'accepted' && r.newAdjustPct !== null)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          if (latest && latest.newAdjustPct === profile.overrideKcalAdjustPct) {
            setSuggestedOn({ pct: latest.newAdjustPct as number, date: localDate(latest.createdAt, profile.timezone) });
          }
        }
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : 'Could not load your settings.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const zones = useMemo(() => timeZones(form.timezone), [form.timezone]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  function changeUnits(to: Units) {
    setSaved(false);
    setForm((f) => {
      if (f.units === to) return f;
      const cm = heightFromFields({ cm: f.heightCm, ft: f.heightFt, in: f.heightIn }, f.units);
      const h = cm === null ? { cm: f.heightCm, ft: f.heightFt, in: f.heightIn } : heightToFields(cm, to);
      return {
        ...f,
        units: to,
        heightCm: h.cm, heightFt: h.ft, heightIn: h.in,
        weight: convertField(f.weight, 'weight', f.units, to),
        protein: convertField(f.protein, 'protein', f.units, to),
        water: convertField(f.water, 'water', f.units, to),
      };
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaved(false);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const heightCm = heightFromFields({ cm: form.heightCm, ft: form.heightFt, in: form.heightIn }, form.units)!;
    const weightKg = weightFromField(form.weight, form.units)!;
    const input: ProfileInput = {
      birthMonth: Number(form.birthMonth),
      birthYear: Number(form.birthYear),
      sex: form.sex,
      heightCm,
      goal: form.goal,
      everydayActivity: form.everydayActivity,
      units: form.units,
      timezone: form.timezone,
      overrideKcalAdjustPct: num(form.adjust),
      overrideProteinGPerLb: form.protein.trim() === '' ? null : proteinFromField(form.protein, form.units),
      overrideFatPct: num(form.fat),
      overrideWaterBaseMlPerKg: form.water.trim() === '' ? null : waterFromField(form.water, form.units),
    };
    setSaving(true);
    try {
      await saveProfile(input);
      const changed = firstRun || initialKg === null || Math.abs(weightKg - initialKg) > 0.06;
      if (changed) {
        await addWeight(todayIn(form.timezone), weightKg);
        setInitialKg(weightKg);
      }
      if (firstRun) {
        navigate('/');
      } else {
        setSaved(true);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save. Your entries are still here; try again.');
    } finally {
      setSaving(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not sign out.');
      setSigningOut(false);
    }
  }

  if (loading) return <Spinner />;

  const imperial = form.units === 'imperial';
  const d = GOAL_DEFAULTS[form.goal];
  const ph = {
    adjust: String(d.adjustPct),
    protein: proteinToField(d.proteinGPerLb, form.units),
    fat: String(d.fatPct),
    water: waterToField(DEFAULT_WATER_ML_PER_KG, form.units),
  };

  const resetBtn = (key: 'adjust' | 'protein' | 'fat' | 'water', label: string) => (
    <Button
      variant="ghost"
      className={styles.reset}
      disabled={form[key] === ''}
      aria-label={`Reset ${label} to default`}
      onClick={() => set(key, '')}
    >
      Reset to default
    </Button>
  );

  return (
    <Layout title="Settings">
      {loadError && <p className="field__error" role="alert">{loadError}</p>}
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <Card title={firstRun ? 'Set up your profile' : 'Your profile'}>
          <div className={styles.stack}>
            {firstRun && (
              <p className="muted">
                A few details let us estimate your daily calorie, protein and water targets.
              </p>
            )}

            <div className={styles.row}>
              <div className="field">
                <label className="field__label" htmlFor="birth-month">Birth month</label>
                <select
                  id="birth-month"
                  className="field__input"
                  value={form.birthMonth}
                  aria-invalid={errors.birthMonth ? true : undefined}
                  onChange={(e) => set('birthMonth', e.target.value)}
                >
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
                {errors.birthMonth && <p className="field__error" role="alert">{errors.birthMonth}</p>}
              </div>
              <Field
                label="Birth year"
                inputMode="numeric"
                maxLength={4}
                value={form.birthYear}
                error={errors.birthYear}
                onChange={(e) => set('birthYear', e.target.value)}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="sex">Sex (used for the calorie formula)</label>
              <select id="sex" className="field__input" value={form.sex} onChange={(e) => set('sex', e.target.value as Sex)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>

            <div className="field">
              <span className="field__label" id="units-label">Units</span>
              <div className={styles.toggle} role="group" aria-labelledby="units-label">
                <Button variant={imperial ? 'primary' : 'secondary'} aria-pressed={imperial} onClick={() => changeUnits('imperial')}>
                  Imperial (ft, lb)
                </Button>
                <Button variant={imperial ? 'secondary' : 'primary'} aria-pressed={!imperial} onClick={() => changeUnits('metric')}>
                  Metric (cm, kg)
                </Button>
              </div>
            </div>

            {imperial ? (
              <div>
                <div className={styles.row}>
                  <Field
                    label="Height (ft)"
                    inputMode="numeric"
                    value={form.heightFt}
                    onChange={(e) => set('heightFt', e.target.value)}
                  />
                  <Field
                    label="Height (in)"
                    inputMode="decimal"
                    value={form.heightIn}
                    onChange={(e) => set('heightIn', e.target.value)}
                  />
                </div>
                {errors.height && <p className="field__error" role="alert">{errors.height}</p>}
              </div>
            ) : (
              <Field
                label="Height (cm)"
                inputMode="decimal"
                value={form.heightCm}
                error={errors.height}
                onChange={(e) => set('heightCm', e.target.value)}
              />
            )}

            <Field
              label={`Current weight (${imperial ? 'lb' : 'kg'})`}
              inputMode="decimal"
              value={form.weight}
              error={errors.weight}
              hint={firstRun ? 'Required. Saved as today’s weight.' : 'Saved as today’s weight if changed.'}
              onChange={(e) => set('weight', e.target.value)}
            />

            <div className="field">
              <label className="field__label" htmlFor="goal">Goal</label>
              <select id="goal" className="field__input" value={form.goal} onChange={(e) => set('goal', e.target.value as Goal)}>
                <option value="lose_fat">Lose fat</option>
                <option value="maintain">Maintain</option>
                <option value="build_muscle">Build muscle</option>
              </select>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="everyday">Everyday activity</label>
              <select id="everyday" className="field__input" value={form.everydayActivity} onChange={(e) => set('everydayActivity', e.target.value as EverydayActivity)}>
                <option value="sedentary">Mostly sitting</option>
                <option value="moderate">On your feet part of the day</option>
                <option value="active">On your feet most of the day / physical job</option>
              </select>
              <p className="muted">Counts for the hours you're not exercising.</p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="tz">Timezone</label>
              <select id="tz" className="field__input" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <details className={styles.advanced}>
            <summary className={styles.summary}>Advanced: adjust the rules</summary>
            <div className={styles.stack}>
              <p className="muted">
                Targets are estimates, not medical advice. Leave a field empty to use the default for your goal.
              </p>
              <div className={styles.override}>
                <Field
                  label="Calorie adjustment (%)"
                  inputMode="decimal"
                  placeholder={ph.adjust}
                  value={form.adjust}
                  error={errors.adjust}
                  hint="Applied to estimated burn, from -40 to 40."
                  onChange={(e) => set('adjust', e.target.value)}
                />
                {resetBtn('adjust', 'calorie adjustment')}
                {suggestedOn && num(form.adjust) === suggestedOn.pct && (
                  <p className="muted">Set from a suggestion on {fmtDate(suggestedOn.date)}</p>
                )}
              </div>
              <div className={styles.override}>
                <Field
                  label={imperial ? 'Protein (g per lb)' : 'Protein (g per kg)'}
                  inputMode="decimal"
                  placeholder={ph.protein}
                  value={form.protein}
                  error={errors.protein}
                  onChange={(e) => set('protein', e.target.value)}
                />
                {resetBtn('protein', 'protein')}
              </div>
              <div className={styles.override}>
                <Field
                  label="Fat (% of calories)"
                  inputMode="decimal"
                  placeholder={ph.fat}
                  value={form.fat}
                  error={errors.fat}
                  hint="From 10 to 60."
                  onChange={(e) => set('fat', e.target.value)}
                />
                {resetBtn('fat', 'fat')}
              </div>
              <div className={styles.override}>
                <Field
                  label={imperial ? 'Base water (fl oz per lb)' : 'Base water (ml per kg)'}
                  inputMode="decimal"
                  placeholder={ph.water}
                  value={form.water}
                  error={errors.water}
                  onChange={(e) => set('water', e.target.value)}
                />
                {resetBtn('water', 'base water')}
              </div>
            </div>
          </details>
        </Card>

        {Object.keys(errors).length > 0 && (
          <p className="field__error" role="alert">Please fix the highlighted fields.</p>
        )}
        {saveError && <p className="field__error" role="alert">{saveError}</p>}
        {saved && <p className={styles.saved} role="status">Saved</p>}
        <Button type="submit" block disabled={saving}>
          {saving ? 'Saving…' : firstRun ? 'Save and continue' : 'Save'}
        </Button>
      </form>

      <YourData onChanged={() => setReloadKey((k) => k + 1)} />

      {!firstRun && (
        <div className={styles.signout}>
          <Button variant="secondary" block disabled={signingOut} onClick={onSignOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      )}
      {firstRun && (
        <div className={styles.signout}>
          <Button variant="ghost" block disabled={signingOut} onClick={onSignOut}>Sign out</Button>
        </div>
      )}
    </Layout>
  );
}
