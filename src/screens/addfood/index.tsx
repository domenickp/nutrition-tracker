import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Field, Layout, Spinner } from '../../components';
import { addFoodLog, getProfile, getUsdaFood, listFoods, saveFood, searchUsda, updateFood } from '../../data/api';
import { amountOptions, computeEntry, unitDisplayLabel } from '../../lib/portions';
import type { AmountUnit } from '../../lib/portions';
import type { Food, NewFood, Portion, Units } from '../../lib/types';
import { flOzToMl } from '../../lib/units';
import { baseVolumeMl, parseVolumeLabel } from '../../lib/volume';
import type { VolumeUnit } from '../../lib/volume';
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
          <Button variant="secondary" block onClick={() => { setError(null); setStep('manual'); }}>Enter manually</Button>
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

const unitKey = (u: AmountUnit): string =>
  u.kind === 'portion' ? `portion:${u.label}` : u.kind === 'volume' ? `volume:${u.unit}` : u.kind;

const MEASURE_UNITS: VolumeUnit[] = ['cup', 'tbsp', 'tsp', 'fl oz'];
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function AmountStep({ food: initialFood, date, onBack, onLogged }: { food: Food; date: string; onBack: () => void; onLogged: () => void }) {
  const [food, setFood] = useState<Food>(initialFood);
  const options = amountOptions(food);
  const label = (u: AmountUnit): string => (u.kind === 'base' ? `× ${food.baseLabel}` : u.kind === 'grams' ? 'grams' : unitDisplayLabel(food, u));
  const [qty, setQty] = useState('1');
  const [unitK, setUnitK] = useState<string>(unitKey(options[0]));
  const unit = options.find((o) => unitKey(o) === unitK) ?? options[0];
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [measureOpen, setMeasureOpen] = useState(false);
  const [mAmount, setMAmount] = useState('1');
  const [mUnit, setMUnit] = useState<VolumeUnit>('cup');
  const [mGrams, setMGrams] = useState('');
  const [mError, setMError] = useState<string | null>(null);
  const [mSaving, setMSaving] = useState(false);

  const q = qty.trim() === '' ? NaN : Number(qty);
  let entry: ReturnType<typeof computeEntry> | null = null;
  let qtyError: string | null = null;
  if (!Number.isFinite(q) || q < 0) qtyError = 'Enter a number, 0 or more';
  else {
    try { entry = computeEntry(food, q, unit); } catch (e) { qtyError = msg(e); }
  }

  // Keep the same physical amount: via grams, else via ml, else reset to 1.
  const changeUnit = (key: string) => {
    const next = options.find((o) => unitKey(o) === key);
    if (!next) return;
    let nextQty = 1;
    if (entry) {
      try {
        const one = computeEntry(food, 1, next);
        if (entry.grams != null && one.grams != null && one.grams > 0) nextQty = round3(entry.grams / one.grams);
        else if (entry.ml != null && one.ml != null && one.ml > 0) nextQty = round3(entry.ml / one.ml);
      } catch { /* keep 1 */ }
    }
    setQty(String(nextQty));
    setUnitK(key);
  };

  const saveMeasure = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseVolumeLabel(`${mAmount.trim()} ${mUnit}`);
    const amount = parsed ? round3(parsed.amount) : NaN;
    const g = mGrams.trim() === '' ? NaN : Number(mGrams);
    if (!parsed || !Number.isFinite(amount) || amount <= 0) { setMError('Enter an amount more than 0, like 1 or 1/2'); return; }
    if (!Number.isFinite(g) || g <= 0) { setMError('Grams must be more than 0'); return; }
    const { id, lastUsedAt, ...rest } = food;
    void lastUsedAt;
    setMSaving(true);
    setMError(null);
    try {
      const updated = await updateFood(id, { ...rest, portions: [{ label: `${amount} ${mUnit}`, grams: g }, ...food.portions] });
      setFood(updated);
      if (amountOptions(updated).some((o) => unitKey(o) === `volume:${mUnit}`)) { setUnitK(`volume:${mUnit}`); setQty('1'); }
      setMeasureOpen(false);
      setMGrams('');
    } catch (err) {
      setMError(msg(err));
    } finally {
      setMSaving(false);
    }
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

  const hasGrams = typeof food.baseGrams === 'number' && food.baseGrams > 0;
  const canMeasure = hasGrams || baseVolumeMl(food) !== null;
  const group = (kind: AmountUnit['kind']) => options.filter((o) => o.kind === kind);
  const opt = (o: AmountUnit) => <option key={unitKey(o)} value={unitKey(o)}>{label(o)}</option>;
  const portions = group('portion');
  const measures = group('volume');

  const t = entry?.totals;
  const total = entry?.grams != null ? `${fmt(entry.grams)} g` : entry?.ml != null ? `${fmt(entry.ml)} ml` : null;
  return (
    <div className="stack">
      <Card title={food.name}>
        {food.brand && <p className="muted">{food.brand}</p>}
        <div className="stack">
          <Field label="Amount" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} error={qtyError} />
          <div className="field">
            <label className="field__label" htmlFor="amount-unit">Unit</label>
            <select id="amount-unit" className="field__input" value={unitKey(unit)} onChange={(e) => changeUnit(e.target.value)}>
              {group('base').map(opt)}
              {portions.length > 0 && <optgroup label="Portions">{portions.map(opt)}</optgroup>}
              {measures.length > 0 && <optgroup label="Measures">{measures.map(opt)}</optgroup>}
              {group('grams').map(opt)}
            </select>
            {unit.kind === 'volume' && <p className="field__hint">{unit.basis}</p>}
          </div>
          {!measureOpen && (
            canMeasure
              ? <Button variant="ghost" onClick={() => { setMError(null); setMeasureOpen(true); }}>Add a measure</Button>
              : <p className="muted">Add grams per serving to this food to use cups and spoons</p>
          )}
          {measureOpen && (
            <form className="stack" onSubmit={saveMeasure} noValidate aria-label="Add a measure">
              {!hasGrams && <p className="muted">This adds a gram weight for this measure.</p>}
              <Field label="Measure amount" inputMode="decimal" value={mAmount} onChange={(e) => setMAmount(e.target.value)} />
              <div className="field">
                <label className="field__label" htmlFor="measure-unit">Measure unit</label>
                <select id="measure-unit" className="field__input" value={mUnit} onChange={(e) => setMUnit(e.target.value as VolumeUnit)}>
                  {MEASURE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <Field label="Measure grams" type="number" inputMode="decimal" min="0" step="any" value={mGrams} onChange={(e) => setMGrams(e.target.value)} />
              {mError && <p className="field__error" role="alert">{mError}</p>}
              <Button type="submit" disabled={mSaving}>{mSaving ? 'Saving…' : 'Save measure'}</Button>
              <Button variant="ghost" onClick={() => setMeasureOpen(false)}>Cancel</Button>
            </form>
          )}
        </div>
      </Card>
      <Card title="Preview">
        {t ? (
          <p className="num" data-testid="preview">
            <strong>{fmt(t.kcal)} kcal</strong> · P {fmt(t.proteinG)} g · C {fmt(t.carbsG)} g · F {fmt(t.fatG)} g
            {t.waterMl > 0 && <> · Water {fmt(t.waterMl)} ml</>}
            {total && <> · = {total}</>}
          </p>
        ) : <p className="muted">Enter a valid amount.</p>}
      </Card>
      {error && <p className="field__error" role="alert">{error}</p>}
      <Button block disabled={!entry || saving} onClick={log}>{saving ? 'Logging…' : 'Log it'}</Button>
      <Button variant="ghost" block onClick={onBack}>Back</Button>
    </div>
  );
}
