// The routine the FatherWorkout sample data was recorded with (docs/reference/fatherworkout/routine.json).
// Tests on historical data use this instead of the live ROUTINE, which the owner edits in config/workouts.yaml.
import { readFileSync } from 'node:fs';
import type { Routine } from '../lib/routine';
import { parseRoutineConfig } from '../lib/routineConfig';

export function loadReferenceRoutine(): Routine {
  const { source: _source, ...config } = JSON.parse(
    readFileSync('docs/reference/fatherworkout/routine.json', 'utf8'),
  ) as Record<string, unknown>;
  return parseRoutineConfig(config);
}
