import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUTINE, routineDay } from './routine';

describe('ROUTINE', () => {
  it('matches routine.json days and schemaVersion', () => {
    const json = JSON.parse(readFileSync('docs/reference/fatherworkout/routine.json', 'utf8'));
    expect(ROUTINE.schemaVersion).toBe(json.schemaVersion);
    expect(ROUTINE.days).toEqual(json.days);
  });
  it('has 4 days and 38 exercises', () => {
    expect(ROUTINE.days.map((d) => d.day)).toEqual([1, 2, 3, 4]);
    expect(ROUTINE.days.reduce((n, d) => n + d.exercises.length, 0)).toBe(38);
  });
  it('routineDay finds a day or returns null', () => {
    expect(routineDay(ROUTINE, 3)?.day).toBe(3);
    expect(routineDay(ROUTINE, 9)).toBeNull();
  });
});
