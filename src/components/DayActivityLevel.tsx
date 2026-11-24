import { useId } from 'react';
import { EVERYDAY_LABEL, EVERYDAY_LEVELS } from '../lib/activityLevels';
import type { EverydayActivity } from '../lib/types';

export interface DayActivityLevelProps {
  value: EverydayActivity | null;
  profileDefault: EverydayActivity;
  onChange: (v: EverydayActivity | null) => void;
  otherScreen: 'Today' | 'Activity';
  disabled?: boolean;
  /** When set, the override is not used on this day: the select is disabled and this note is shown. */
  unusedReason?: string;
}

/** Per-day override of Settings' everyday activity; shared by Today and Activity. */
export function DayActivityLevel({ value, profileDefault, onChange, otherScreen, disabled, unusedReason }: DayActivityLevelProps) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>Everyday activity today</label>
      <select
        id={id}
        className="field__input"
        value={value ?? ''}
        disabled={disabled || unusedReason !== undefined}
        onChange={(e) => onChange(e.target.value === '' ? null : (e.target.value as EverydayActivity))}
      >
        <option value="">Settings default ({EVERYDAY_LABEL[profileDefault]})</option>
        {EVERYDAY_LEVELS.map((l) => (
          <option key={l} value={l}>{EVERYDAY_LABEL[l]}</option>
        ))}
      </select>
      {unusedReason !== undefined ? (
        <p className="muted">{unusedReason}</p>
      ) : (
        <p className="muted">Same setting as on the {otherScreen} screen. Changing it in either place is enough.</p>
      )}
    </div>
  );
}
