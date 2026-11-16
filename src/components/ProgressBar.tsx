import { progressState } from './progress';

export interface ProgressBarProps {
  value: number;
  target: number;
  label: string;
  unit: string;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function ProgressBar({ value, target, label, unit }: ProgressBarProps) {
  const { remaining, over, fraction } = progressState(value, target);
  return (
    <div className={`progress${over ? ' progress--over' : ''}`}>
      <div className="progress__row">
        <span className="progress__label">{label}</span>
        <span className="progress__remaining num">
          {fmt(Math.abs(remaining))}
          <small>{unit} {over ? 'over' : 'left'}</small>
        </span>
      </div>
      <div
        className="progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.round(value)}
      >
        <div className="progress__fill" style={{ width: `${fraction * 100}%` }} />
      </div>
      <span className="progress__detail num">{fmt(value)} of {fmt(target)} {unit}</span>
    </div>
  );
}
