import { describe, expect, it } from 'vitest';
import { addDays, localDate, todayIn } from './dates';

describe('localDate', () => {
  it('shifts to the previous day in New York', () => {
    expect(localDate('2026-11-16T01:59:00Z', 'America/New_York')).toBe('2026-11-15');
  });
  it('keeps the UTC day in UTC', () => {
    expect(localDate('2026-11-16T01:59:00Z', 'UTC')).toBe('2026-11-16');
  });
  it('shifts forward east of UTC', () => {
    expect(localDate('2026-11-15T20:00:00Z', 'Asia/Tokyo')).toBe('2026-11-16');
  });
});

describe('todayIn', () => {
  it('uses the injected now', () => {
    const now = new Date('2026-07-01T03:30:00Z');
    expect(todayIn('America/New_York', now)).toBe('2026-06-30');
    expect(todayIn('UTC', now)).toBe('2026-07-01');
  });
  it('defaults to the real clock', () => {
    expect(todayIn('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('is unaffected by DST changes', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-11-02', -1)).toBe('2026-11-01');
    expect(addDays('2026-03-07', 3)).toBe('2026-03-10');
  });
  it('handles zero and large offsets', () => {
    expect(addDays('2026-11-16', 0)).toBe('2026-11-16');
    expect(addDays('2026-11-16', 365)).toBe('2027-11-16');
  });
});
