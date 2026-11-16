import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Layout, Spinner } from '../../components';
import { addFoodLog, getProfile, getUsdaFood, listFoods, saveFood, searchUsda } from '../../data/api';
import { amountOptions, computeEntry } from '../../lib/portions';
import type { AmountUnit } from '../../lib/portions';
import type { Food, NewFood, Portion, Units } from '../../lib/types';
import { flOzToMl } from '../../lib/units';
import type { UsdaFood } from '../../../supabase/functions/usda/normalize';

const msg = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong');
const fmt = (n: number): string => String(Math.round(n * 10) / 10);

type Step = 'find' | 'manual' | 'amount';

const listStyle = { listStyle: 'none', padding: 0, margin: 0, gap: 'var(--sp-1)' } as const;

function FoodRow({ food, onPick, disabled }: { food: NewFood; onPick: () => void; disabled?: boolean }) {
  return (
    <li>
      <button
        type="button"
        className="btn btn--ghost btn--block"
        style={{ justifyContent: 'space-between', textAlign: 'left', height: 'auto', minHeight: 'var(--tap)' }}
        onClick={onPick}
        disabled={disabled}
      >
        <span>
          <strong>{food.name}</strong>
          {food.brand && <span className="muted"> · {food.brand}</span>}
          <br />
          <span className="muted">per {food.baseLabel}</span>
        </span>
        <span className="num">{fmt(food.nutrients.kcal)} kcal</span>
      </button>
    </li>
  );
}

export default function AddFoodScreen() {
  const { date = '' } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('find');
  const [term, setTerm] = useState('');
  const [saved, setSaved] = useState<Food[]>([]);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [usda, setUsda] = useState<UsdaFood[]>([]);
  const [usdaLoading, setUsdaLoading] = useState(false);
  const [usdaError, setUsdaError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [food, setFood] = useState<Food | null>(null);
  const [units, setUnits] = useState<Units>('imperial');
  const trimmed = term.trim();

  useEffect(() => {
    getProfile().then((p) => p && setUnits(p.units)).catch(() => undefined);
  }, []);

  // Saved foods: immediate on mount / term change (recent foods when empty).
  useEffect(() => {
    let active = true;
    listFoods(trimmed || undefined)
      .then((f) => { if (active) { setSaved(f); setSavedError(null); } })
      .catch((e) => active && setSavedError(msg(e)));
    return () => { active = false; };
  }, [trimmed]);

  // USDA: debounced, only for term length >= 3.
  useEffect(() => {
    if (trimmed.length < 3) {
      setUsda([]);
      setUsdaError(null);
      setUsdaLoading(false);
      return;
    }
    let active = true;
    setUsdaLoading(true);
    setUsdaError(null);
    const t = setTimeout(() => {
      searchUsda(trimmed)
        .then((r) => active && setUsda(r))
        .catch((e) => { if (active) { setUsda([]); setUsdaError(msg(e)); } })
        .finally(() => active && setUsdaLoading(false));
    }, 400);
    return () => { active = false; clearTimeout(t); };
  }, [trimmed]);

  const choose = (f: Food) => { setFood(f); setError(null); setStep('amount'); };

  const chooseUsda = async (u: UsdaFood) => {
    setPicking(true);
    setError(null);
    try {
      const detail = await getUsdaFood(u.fdcId);
      choose(await saveFood(detail));
    } catch (e) {
      setError(msg(e));
    } finally {
      setPicking(false);
    }
  };

  const savedFdc = new Set(saved.map((f) => f.fdcId).filter((x): x is number => x != null));
  const usdaShown = usda.filter((u) => !savedFdc.has(u.fdcId));
  const back = () => { setError(null); setStep('find'); };

  return (
    <Layout title="Add food" actions={<Button variant="ghost" onClick={() => navigate(`/day/${date}`)}>Cancel</Button>}>
      {step === 'find' && (
        <div className="stack">
          <Field
            label="Search foods"
            type="search"
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="e.g. banana"
          />
          {error && <p className="field__error" role="alert">{error}</p>}
          <Card title="Your foods">
            {savedError && <p className="field__error" role="alert">{savedError}</p>}
            {!savedError && saved.length === 0 && <p className="muted">{trimmed ? 'No saved matches.' : 'No saved foods yet.'}</p>}
            <ul className="stack" style={listStyle}>
              {saved.map((f) => <FoodRow key={f.id} food={f} onPick={() => choose(f)} disabled={picking} />)}
            </ul>
          </Card>
          {trimmed.length >= 3 && (
            <Card title="USDA results">
              {usdaLoading && <Spinner />}
              {usdaError && <p className="field__error" role="alert">USDA search failed: {usdaError}</p>}
              {!usdaLoading && !usdaError && usdaShown.length === 0 && <p className="muted">No USDA results.</p>}
              <ul className="stack" style={listStyle}>
                {usdaShown.map((u) => <FoodRow key={u.fdcId} food={u} onPick={() => chooseUsda(u)} disabled={picking} />)}
              </ul>
            </Card>
          )}
          <Button variant="secondary" block onClick={() => { setError(null); setStep('manual'); }}>Enter manually</Button>
        </div>
      )}
      {step === 'manual' && (
        <ManualForm units={units} initialName={trimmed} onBack={back} onSaved={choose} />
      )}
      {step === 'amount' && food && (
        <AmountStep food={food} date={date} onBack={back} onLogged={() => navigate(`/day/${date}`)} />
      )}
    </Layout>
  );
}

function ManualForm({ units, initialName, onBack, onSaved }: { units: Units; initialName: string; onBack: () => void; onSaved: (f: Food) => void }) {
  const [v, setV] = useState({ name: initialName, brand: '', serving: '', grams: '', kcal: '', protein: '', carbs: '', fat: '', water: '' });
  const [extras, setExtras] = useState<{ label: string; grams: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((p) => ({ ...p, [k]: e.target.value }));
  const waterUnit = units === 'imperial' ? 'fl oz' : 'ml';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const num = (key: string, raw: string, required: boolean): number | null => {
      if (raw.trim() === '') {
        if (required) errs[key] = 'Required';
        return null;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) { errs[key] = 'Enter a number, 0 or more'; return null; }
      return n;
    };
    if (!v.name.trim()) errs.name = 'Required';
    if (!v.serving.trim()) errs.serving = 'Required';
    const grams = num('grams', v.grams, false);
    if (grams === 0) errs.grams = 'Must be more than 0';
    const kcal = num('kcal', v.kcal, true);
    const protein = num('protein', v.protein, true);
    const carbs = num('carbs', v.carbs, true);
    const fat = num('fat', v.fat, true);
    const water = num('water', v.water, false);
    const portions: Portion[] = [];
    if (grams) {
      extras.forEach((x, i) => {
        if (!x.label.trim() && x.grams.trim() === '') return;
        const g = num(`extra${i}`, x.grams, true);
        if (!x.label.trim()) errs[`extra${i}`] = 'Label required';
        else if (g !== null && g > 0) portions.push({ label: x.label.trim(), grams: g });
        else if (g === 0) errs[`extra${i}`] = 'Must be more than 0';
      });
    }
    setErrors(errs);
    if (Object.keys(errs).length || kcal === null || protein === null || carbs === null || fat === null) return;
    const waterMl = water === null ? 0 : units === 'imperial' ? flOzToMl(water) : water;
    setSaving(true);
    setFormError(null);
    try {
      const f = await saveFood({
        source: 'manual',
        fdcId: null,
        name: v.name.trim(),
        brand: v.brand.trim() || null,
        baseLabel: v.serving.trim(),
        baseGrams: grams,
        nutrients: { kcal, proteinG: protein, carbsG: carbs, fatG: fat, waterMl: Math.round(waterMl * 10) / 10 },
        portions,
      });
      onSaved(f);
    } catch (err) {
      setFormError(msg(err));
    } finally {
      setSaving(false);
    }
  };

  const numField = (k: keyof typeof v, label: string) => (
    <Field label={label} type="number" inputMode="decimal" min="0" step="any" value={v[k]} onChange={set(k)} error={errors[k]} />
  );

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Card title="New food">
        <div className="stack">
          <Field label="Name" value={v.name} onChange={set('name')} error={errors.name} />
          <Field label="Brand (optional)" value={v.brand} onChange={set('brand')} />
          <Field label="Serving" placeholder="1 bar" value={v.serving} onChange={set('serving')} error={errors.serving} />
          {numField('grams', 'Grams per serving (optional)')}
          {numField('kcal', 'Calories (kcal)')}
          {numField('protein', 'Protein (g)')}
          {numField('carbs', 'Carbs (g)')}
          {numField('fat', 'Fat (g)')}
          {numField('water', `Water (${waterUnit}, optional)`)}
        </div>
      </Card>
      {Number(v.grams) > 0 && (
        <Card title="Extra portions (optional)">
          <div className="stack">
            {extras.map((x, i) => (
              <div key={i} className="stack" style={{ gap: 'var(--sp-2)' }}>
                <Field label="Portion label" placeholder="1 cup" value={x.label} onChange={(e) => setExtras((p) => p.map((q, j) => (j === i ? { ...q, label: e.target.value } : q)))} />
                <Field label="Grams" type="number" inputMode="decimal" min="0" step="any" value={x.grams} error={errors[`extra${i}`]} onChange={(e) => setExtras((p) => p.map((q, j) => (j === i ? { ...q, grams: e.target.value } : q)))} />
                <Button variant="ghost" onClick={() => setExtras((p) => p.filter((_, j) => j !== i))}>Remove portion</Button>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setExtras((p) => [...p, { label: '', grams: '' }])}>Add portion</Button>
          </div>
        </Card>
      )}
      {formError && <p className="field__error" role="alert">{formError}</p>}
      <Button type="submit" block disabled={saving}>{saving ? 'Saving…' : 'Save food'}</Button>
      <Button variant="ghost" block onClick={onBack}>Back</Button>
    </form>
  );
}

const unitKey = (u: AmountUnit): string => (u.kind === 'portion' ? `portion:${u.label}` : u.kind);

function AmountStep({ food, date, onBack, onLogged }: { food: Food; date: string; onBack: () => void; onLogged: () => void }) {
  const options = amountOptions(food);
  const label = (u: AmountUnit): string => (u.kind === 'base' ? `× ${food.baseLabel}` : u.kind === 'portion' ? u.label : 'grams');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState<AmountUnit>(options[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const q = qty.trim() === '' ? NaN : Number(qty);
  let entry: ReturnType<typeof computeEntry> | null = null;
  let qtyError: string | null = null;
  if (!Number.isFinite(q) || q < 0) qtyError = 'Enter a number, 0 or more';
  else {
    try { entry = computeEntry(food, q, unit); } catch (e) { qtyError = msg(e); }
  }

  const changeUnit = (key: string) => {
    const next = options.find((o) => unitKey(o) === key);
    if (!next) return;
    if (next.kind === 'grams' && entry?.grams != null) setQty(fmt(entry.grams));
    setUnit(next);
  };

  const log = async () => {
    if (!entry) return;
    setSaving(true);
    setError(null);
    try {
      await addFoodLog({ date, foodId: food.id, name: food.name, quantity: q, unitLabel: entry.unitLabel, grams: entry.grams, totals: entry.totals });
      onLogged();
    } catch (e) {
      setError(msg(e));
      setSaving(false);
    }
  };

  const t = entry?.totals;
  return (
    <div className="stack">
      <Card title={food.name}>
        {food.brand && <p className="muted">{food.brand}</p>}
        <div className="stack">
          <Field label="Amount" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} error={qtyError} />
          <div className="field">
            <label className="field__label" htmlFor="amount-unit">Unit</label>
            <select id="amount-unit" className="field__input" value={unitKey(unit)} onChange={(e) => changeUnit(e.target.value)}>
              {options.map((o) => <option key={unitKey(o)} value={unitKey(o)}>{label(o)}</option>)}
            </select>
          </div>
        </div>
      </Card>
      <Card title="Preview">
        {t ? (
          <p className="num" data-testid="preview">
            <strong>{fmt(t.kcal)} kcal</strong> · P {fmt(t.proteinG)} g · C {fmt(t.carbsG)} g · F {fmt(t.fatG)} g
            {t.waterMl > 0 && <> · Water {fmt(t.waterMl)} ml</>}
          </p>
        ) : <p className="muted">Enter a valid amount.</p>}
      </Card>
      {error && <p className="field__error" role="alert">{error}</p>}
      <Button block disabled={!entry || saving} onClick={log}>{saving ? 'Logging…' : 'Log it'}</Button>
      <Button variant="ghost" block onClick={onBack}>Back</Button>
    </div>
  );
}
