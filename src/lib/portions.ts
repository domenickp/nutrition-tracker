import type { Food, Nutrients } from './types';
import { ML_PER_UNIT, VOLUME_UNITS, baseVolumeMl, gramsPerMl, type VolumeUnit } from './volume';

export type AmountUnit =
  | { kind: 'base' }
  | { kind: 'portion'; label: string; grams: number }
  | {
      kind: 'volume';
      unit: VolumeUnit;
      gramsPerUnit: number | null;
      servingsPerUnit: number;
      basis: string;
    }
  | { kind: 'grams' };

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function amountOptions(food: Food): AmountUnit[] {
  const options: AmountUnit[] = [{ kind: 'base' }];
  const baseGrams = typeof food.baseGrams === 'number' && food.baseGrams > 0 ? food.baseGrams : null;
  if (baseGrams) {
    for (const p of food.portions) options.push({ kind: 'portion', label: p.label, grams: p.grams });
  }
  const density = gramsPerMl(food);
  const baseMl = baseVolumeMl(food);
  if (baseGrams && density) {
    for (const unit of VOLUME_UNITS) {
      const gramsPerUnit = ML_PER_UNIT[unit] * density.gPerMl;
      options.push({
        kind: 'volume', unit, gramsPerUnit, servingsPerUnit: gramsPerUnit / baseGrams, basis: density.basis,
      });
    }
  } else if (baseMl) {
    for (const unit of VOLUME_UNITS) {
      const servingsPerUnit = ML_PER_UNIT[unit] / baseMl;
      const gramsPerUnit =
        baseGrams && density
          ? ML_PER_UNIT[unit] * density.gPerMl
          : baseGrams
            ? baseGrams * servingsPerUnit
            : null;
      options.push({
        kind: 'volume', unit, gramsPerUnit, servingsPerUnit, basis: `from ${food.baseLabel} serving`,
      });
    }
  }
  if (baseGrams) options.push({ kind: 'grams' });
  return options;
}

export function scaleTotals(totals: Nutrients, ratio: number): Nutrients {
  return {
    kcal: round1(totals.kcal * ratio),
    proteinG: round1(totals.proteinG * ratio),
    carbsG: round1(totals.carbsG * ratio),
    fatG: round1(totals.fatG * ratio),
    waterMl: round1(totals.waterMl * ratio),
  };
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  const sum: Nutrients = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0 };
  for (const n of list) {
    sum.kcal += n.kcal;
    sum.proteinG += n.proteinG;
    sum.carbsG += n.carbsG;
    sum.fatG += n.fatG;
    sum.waterMl += n.waterMl;
  }
  return scaleTotals(sum, 1);
}

export function computeEntry(
  food: Food,
  quantity: number,
  unit: AmountUnit,
): { totals: Nutrients; unitLabel: string; grams: number | null; ml: number | null } {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Quantity must be a non-negative number');
  }
  const baseGrams = food.baseGrams && food.baseGrams > 0 ? food.baseGrams : null;
  const density = gramsPerMl(food);
  let ratio: number;
  let grams: number | null;
  let ml: number | null;
  let unitLabel: string;
  if (unit.kind === 'base') {
    const baseMl = baseVolumeMl(food);
    ratio = quantity;
    grams = baseGrams ? quantity * baseGrams : null;
    ml = baseMl ? quantity * baseMl : null;
    unitLabel = 'servings';
  } else if (unit.kind === 'volume') {
    ratio = quantity * unit.servingsPerUnit;
    grams = unit.gramsPerUnit != null ? quantity * unit.gramsPerUnit : null;
    ml = quantity * ML_PER_UNIT[unit.unit];
    unitLabel = unit.unit;
  } else {
    if (!baseGrams) throw new Error('This food has no gram weight; use servings');
    grams = unit.kind === 'portion' ? quantity * unit.grams : quantity;
    ratio = grams / baseGrams;
    ml = density ? grams / density.gPerMl : null;
    unitLabel = unit.kind === 'portion' ? unit.label : 'g';
  }
  return {
    totals: scaleTotals(food.nutrients, ratio),
    unitLabel,
    grams: grams == null ? null : round1(grams),
    ml: ml == null ? null : round1(ml),
  };
}

export function unitDisplayLabel(food: Food, unit: AmountUnit): string {
  switch (unit.kind) {
    case 'base': return food.baseLabel;
    case 'portion': return unit.label;
    case 'volume': return unit.unit;
    case 'grams': return 'g';
  }
}

const fmtQty = (q: number): string => String(Math.round(q * 100) / 100);

/** Natural-reading amount text for a logged food, e.g. "2 × 1 cup (480 g)". */
export function formatAmount(quantity: number, unitLabel: string, grams: number | null): string {
  const q = fmtQty(quantity);
  if (unitLabel === 'g') return `${q} g`;
  let text: string;
  if (unitLabel === 'servings') text = quantity === 1 ? '1 serving' : `${q} servings`;
  else if (/^\d/.test(unitLabel)) text = quantity === 1 ? unitLabel : `${q} × ${unitLabel}`;
  else text = `${q} ${unitLabel}`;
  if (grams === null) return text;
  const rounded = Math.round(grams);
  const m = /^(\d+(?:\.\d+)?)\s*g$/.exec(unitLabel);
  if (m && Math.round(Number(m[1]) * quantity) === rounded) return text;
  return `${text} (${rounded} g)`;
}
