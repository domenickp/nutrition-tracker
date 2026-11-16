import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function Field({ label, hint, error, id, className, ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errId = error ? `${inputId}-err` : undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className={`field__input ${className ?? ''}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {hint && <p id={hintId} className="field__hint">{hint}</p>}
      {error && <p id={errId} className="field__error" role="alert">{error}</p>}
    </div>
  );
}
