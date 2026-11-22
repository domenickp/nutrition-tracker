// Workout routine (contracts §8.1). The data comes from config/workouts.yaml (contracts §8.7), parsed at build time.
import routineData from '../../config/workouts.yaml';
export interface RoutineExercise {
  id: string; name: string; warmup: boolean; sets: number | null; reps: number | null;
  weightLb: number | null; timeMin: number | null; timeSec: number | null;
  rest: string | null; notes: string | null;
}
export interface RoutineDay { day: number; areas: string; exercises: RoutineExercise[] }
export interface Routine { schemaVersion: 1; days: RoutineDay[] }

export function routineDay(routine: Routine, day: number): RoutineDay | null {
  return routine.days.find((d) => d.day === day) ?? null;
}

export const ROUTINE: Routine = routineData;
