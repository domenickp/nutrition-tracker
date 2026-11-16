export interface ProgressState {
  remaining: number;
  over: boolean;
  /** Fill fraction clamped to 0..1. */
  fraction: number;
}

/** Remaining = target - value; over when value exceeds target. */
export function progressState(value: number, target: number): ProgressState {
  const remaining = target - value;
  return {
    remaining,
    over: remaining < 0,
    fraction: target > 0 ? Math.min(1, Math.max(0, value / target)) : value > 0 ? 1 : 0,
  };
}
