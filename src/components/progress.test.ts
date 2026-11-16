import { describe, expect, it } from 'vitest';
import { progressState } from './progress';

describe('progressState', () => {
  it('computes remaining and fraction', () => {
    expect(progressState(500, 2000)).toEqual({ remaining: 1500, over: false, fraction: 0.25 });
  });
  it('flags over target and clamps fill', () => {
    expect(progressState(2300, 2000)).toEqual({ remaining: -300, over: true, fraction: 1 });
  });
  it('handles zero target', () => {
    expect(progressState(0, 0).fraction).toBe(0);
  });
});
