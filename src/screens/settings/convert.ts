import { LB_PER_KG, ML_PER_FLOZ, cmToIn, inToCm, kgToLb, lbToKg } from '../../lib/units';
import type { Goal, Units } from '../../lib/types';

/** Goal defaults, mirroring src/lib/targets.ts (display only). */
export const GOAL_DEFAULTS: Record<Goal, { adjustPct: number; proteinGPerLb: number; fatPct: number }> = {
  lose_fat: { adjustPct: -20, proteinGPerLb: 1.0, fatPct: 25 },
  maintain: { adjustPct: 0, proteinGPerLb: 0.8, fatPct: 30 },
  build_muscle: { adjustPct: 10, proteinGPerLb: 1.0, fatPct: 25 },
};
export const DEFAULT_WATER_ML_PER_KG = 0.5 * ML_PER_FLOZ * LB_PER_KG;

export const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
const str = (n: number, dp: number) => String(round(n, dp));

/** Parse a user-typed decimal; null when empty or not a number. */
export function num(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function heightToFields(cm: number, units: Units): { cm: string; ft: string; in: string } {
  if (units === 'metric') return { cm: str(cm, 1), ft: '', in: '' };
  const totalIn = round(cmToIn(cm), 1);
  let ft = Math.floor(totalIn / 12);
  let inches = round(totalIn - ft * 12, 1);
  if (inches >= 12) { ft += 1; inches = 0; }
  return { cm: '', ft: String(ft), in: String(inches) };
}

export function heightFromFields(f: { cm: string; ft: string; in: string }, units: Units): number | null {
  if (units === 'metric') return num(f.cm);
  const ft = num(f.ft);
  const inches = f.in.trim() === '' ? 0 : num(f.in);
  if (ft === null || inches === null) return null;
  return inToCm(ft * 12 + inches);
}

export const weightToField = (kg: number, units: Units): string =>
  str(units === 'imperial' ? kgToLb(kg) : kg, 1);
export const weightFromField = (s: string, units: Units): number | null => {
  const n = num(s);
  return n === null ? null : units === 'imperial' ? lbToKg(n) : n;
};

/** Protein: stored per lb, shown per lb (imperial) or per kg (metric). */
export const proteinToField = (perLb: number, units: Units): string =>
  str(units === 'imperial' ? perLb : perLb * LB_PER_KG, 2);
export const proteinFromField = (s: string, units: Units): number | null => {
  const n = num(s);
  return n === null ? null : units === 'imperial' ? n : n / LB_PER_KG;
};

/** Water: stored ml per kg, shown as fl oz per lb (imperial) or ml per kg (metric). */
export const waterToField = (mlPerKg: number, units: Units): string =>
  str(units === 'imperial' ? mlPerKg / ML_PER_FLOZ / LB_PER_KG : mlPerKg, units === 'imperial' ? 2 : 1);
export const waterFromField = (s: string, units: Units): number | null => {
  const n = num(s);
  return n === null ? null : units === 'imperial' ? n * ML_PER_FLOZ * LB_PER_KG : n;
};

/** Convert a displayed field between unit systems; blanks and junk pass through. */
export function convertField(
  s: string,
  kind: 'weight' | 'protein' | 'water',
  from: Units,
  to: Units,
): string {
  const n = num(s);
  if (n === null) return s;
  const toBase = { weight: weightFromField, protein: proteinFromField, water: waterFromField }[kind];
  const fromBase = { weight: weightToField, protein: proteinToField, water: waterToField }[kind];
  const base = toBase(s, from);
  return base === null ? s : fromBase(base, to);
}

