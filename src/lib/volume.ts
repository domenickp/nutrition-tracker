import type { Food } from './types';

export type VolumeUnit = 'cup' | 'tbsp' | 'tsp' | 'fl oz' | 'ml';

export const ML_PER_UNIT: Record<VolumeUnit, number> = {
  cup: 236.588,
  tbsp: 14.7868,
  tsp: 4.92892,
  'fl oz': 29.5735,
  ml: 1,
};

export const VOLUME_UNITS: VolumeUnit[] = ['cup', 'tbsp', 'tsp', 'fl oz', 'ml'];

// Unit words, matched at the start of the text after the amount. T / t are
// case-sensitive and only match exactly; everything else is case-insensitive.
const UNIT_PATTERNS: Array<{ re: RegExp; unit: VolumeUnit }> = [
  { re: /^fl\.?\s*oz\.?(?![a-z])/i, unit: 'fl oz' },
  { re: /^floz\.?(?![a-z])/i, unit: 'fl oz' },
  { re: /^fluid\s+ounces?(?![a-z])/i, unit: 'fl oz' },
  { re: /^cups?(?![a-z])/i, unit: 'cup' },
  { re: /^c(?![a-z])/i, unit: 'cup' },
  { re: /^(?:tbsp|tbs|tablespoons?)\.?(?![a-z])/i, unit: 'tbsp' },
  { re: /^T(?![A-Za-z])/, unit: 'tbsp' },
  { re: /^(?:tsp|teaspoons?)\.?(?![a-z])/i, unit: 'tsp' },
  { re: /^t(?![A-Za-z])/, unit: 'tsp' },
  { re: /^(?:ml|milliliters?|millilitres?)(?![a-z])/i, unit: 'ml' },
];

const AMOUNT_RE = /^\s*(?:(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|(\d*\.?\d+))?\s*/;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function parseVolumeLabel(
  label: string,
): { amount: number; unit: VolumeUnit; ml: number; note: string } | null {
  const m = AMOUNT_RE.exec(label);
  if (!m) return null;
  let amount = 1;
  if (m[1] !== undefined) {
    if (Number(m[3]) === 0) return null;
    amount = Number(m[1]) + Number(m[2]) / Number(m[3]);
  } else if (m[4] !== undefined) {
    if (Number(m[5]) === 0) return null;
    amount = Number(m[4]) / Number(m[5]);
  } else if (m[6] !== undefined) {
    amount = Number(m[6]);
  }
  const rest = label.slice(m[0].length);
  for (const { re, unit } of UNIT_PATTERNS) {
    const u = re.exec(rest);
    if (!u) continue;
    const note = rest.slice(u[0].length).replace(/^[\s,;:.]+/, '').trim();
    return { amount, unit, ml: amount * ML_PER_UNIT[unit], note };
  }
  return null;
}

export function gramsPerMl(food: Food): { gPerMl: number; basis: string } | null {
  for (const p of food.portions) {
    const v = parseVolumeLabel(p.label);
    if (v && v.ml > 0 && p.grams > 0) {
      return { gPerMl: p.grams / v.ml, basis: `from ${p.label} = ${round1(p.grams)} g` };
    }
  }
  return null;
}

export function baseVolumeMl(food: Food): number | null {
  const v = parseVolumeLabel(food.baseLabel);
  return v && v.ml > 0 ? v.ml : null;
}
