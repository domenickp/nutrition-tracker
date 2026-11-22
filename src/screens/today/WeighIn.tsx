import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field } from '../../components';
import { weightFromField, weightToField } from '../settings/convert';
import type { Units } from '../../lib/types';
import { formatWeight, kgToLb } from '../../lib/units';
import type { WeightAnalysis } from '../../lib/weightAnalysis';

export interface WeighInProps {
  units: Units;
  /** Today's weigh-in, or null when not weighed yet. */
  todayKg: number | null;
  /** Latest known weight, used to pre-fill the input. */
  fallbackKg: number | null;
  /** Null hides the trend line (load failed or not loaded). */
  analysis: WeightAnalysis | null;
  busy: boolean;
  onSave: (kg: number) => Promise<boolean>;
  onInvalid: (message: string) => void;
}

function signedRate(kgPerWeek: number, units: Units): string {
  const v = units === 'imperial' ? kgToLb(kgPerWeek) : kgPerWeek;
  const rounded = Math.round(v * 10) / 10;
  const sign = rounded < 0 ? '−' : rounded > 0 ? '+' : '';
  return `${sign}${Math.abs(rounded).toFixed(1)} ${units === 'imperial' ? 'lb' : 'kg'}/wk`;
}

function trendText(a: WeightAnalysis, units: Units): string | null {
  const last = a.trend[a.trend.length - 1];
  if (!last) return null;
  const w = formatWeight(last.trendKg, units);
  if (a.status === 'collecting' || !a.rate) return `Trend ${w} · collecting data`;
  return `Trend ${w} · ${signedRate(a.rate.kgPerWeek, units)}${a.status === 'on_track' ? ' ✓' : ''}`;
}

export function WeighIn({ units, todayKg, fallbackKg, analysis, busy, onSave, onInvalid }: WeighInProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const unit = units === 'imperial' ? 'lb' : 'kg';
  const showInput = todayKg === null || editing;

  const startEdit = () => {
    setText(weightToField(todayKg ?? fallbackKg ?? 0, units));
    setEditing(true);
  };
  const save = async () => {
    const kg = weightFromField(text, units);
    if (kg === null || kg < 25 || kg > 350) {
      onInvalid(units === 'imperial' ? 'Enter a weight between 55 and 770 lb.' : 'Enter a weight between 25 and 350 kg.');
      return;
    }
    if (await onSave(kg)) {
      setEditing(false);
      setText('');
    }
  };

  const trend = analysis ? trendText(analysis, units) : null;

  return (
    <div className="weighin">
      {showInput ? (
        <div className="weighin__row">
          <Field
            label={`Weight (${unit})`}
            type="number"
            inputMode="decimal"
            placeholder={fallbackKg === null ? undefined : weightToField(fallbackKg, units)}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button disabled={busy} onClick={save}>
            Save weight
          </Button>
        </div>
      ) : (
        <div className="weighin__row weighin__row--done">
          <span>
            Weight <strong className="num">{formatWeight(todayKg, units)}</strong>
          </span>
          <Button variant="ghost" onClick={startEdit}>
            Edit
          </Button>
        </div>
      )}
      {trend && (
        <p className="weighin__trend muted">
          <span className="num">{trend}</span> · <Link to="/progress">Progress</Link>
        </p>
      )}
    </div>
  );
}
