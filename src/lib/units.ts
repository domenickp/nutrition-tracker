import type { Units } from './types';

export const LB_PER_KG = 2.20462;
export const CM_PER_IN = 2.54;
export const ML_PER_FLOZ = 29.5735;

export function kgToLb(kg: number): number { return kg * LB_PER_KG; }
export function lbToKg(lb: number): number { return lb / LB_PER_KG; }
export function cmToIn(cm: number): number { return cm / CM_PER_IN; }
export function inToCm(inches: number): number { return inches * CM_PER_IN; }
export function mlToFlOz(ml: number): number { return ml / ML_PER_FLOZ; }
export function flOzToMl(oz: number): number { return oz * ML_PER_FLOZ; }

export function formatWeight(kg: number, units: Units): string {
  return units === 'imperial' ? `${kgToLb(kg).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;
}

export function formatVolume(ml: number, units: Units): string {
  if (units === 'imperial') return `${Math.round(mlToFlOz(ml))} fl oz`;
  if (ml < 1000) return `${Math.round(ml)} ml`;
  return `${(ml / 1000).toFixed(1)} L`;
}
