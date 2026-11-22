import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { ROUTINE, routineDay } from './routine';
import { parseRoutineConfig } from './routineConfig';
import { loadReferenceRoutine } from '../test/referenceRoutine';

describe('ROUTINE (live plan, config/workouts.yaml)', () => {
  it('is schemaVersion 1 with days that each have exercises', () => {
    expect(ROUTINE.schemaVersion).toBe(1);
    expect(ROUTINE.days.length).toBeGreaterThanOrEqual(1);
    for (const d of ROUTINE.days) expect(d.exercises.length, `day ${d.day}`).toBeGreaterThanOrEqual(1);
  });
  it('equals the validator output for config/workouts.yaml', () => {
    const yaml = parse(readFileSync('config/workouts.yaml', 'utf8'));
    expect(ROUTINE).toEqual(parseRoutineConfig(yaml));
  });
  it('routineDay finds a day or returns null', () => {
    const first = ROUTINE.days[0].day;
    expect(routineDay(ROUTINE, first)?.day).toBe(first);
    expect(routineDay(ROUTINE, 9999)).toBeNull();
  });
});

describe('reference routine (FatherWorkout routine.json)', () => {
  it('still parses with 4 days and 38 exercises', () => {
    const ref = loadReferenceRoutine();
    expect(ref.days.map((d) => d.day)).toEqual([1, 2, 3, 4]);
    expect(ref.days.reduce((n, d) => n + d.exercises.length, 0)).toBe(38);
  });
});
