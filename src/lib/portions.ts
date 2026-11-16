import type { Food, Nutrients } from './types';

export type AmountUnit =
  | { kind: 'base' }
  | { kind: 'portion'; label: string; grams: number }
  | { kind: 'grams' };

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function amountOptions(food: Food): AmountUnit[] {
  const options: AmountUnit[] = [{ kind: 'base' }];
  if (typeof food.baseGrams === 'number' && food.baseGrams > 0) {
    for (const p of food.portions) options.push({ kind: 'portion', label: p.label, grams: p.grams });
    options.push({ kind: 'grams' });
  }
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
): { totals: Nutrients; unitLabel: string; grams: number | null } {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Quantity must be a non-negative number');
  }
  const baseGrams = food.baseGrams && food.baseGrams > 0 ? food.baseGrams : null;
  let ratio: number;
  let grams: number | null;
  let unitLabel: string;
  if (unit.kind === 'base') {
    ratio = quantity;
    grams = baseGrams ? quantity * baseGrams : null;
    unitLabel = 'servings';
  } else {
    if (!baseGrams) throw new Error('This food has no gram weight; use servings');
    grams = unit.kind === 'portion' ? quantity * unit.grams : quantity;
    ratio = grams / baseGrams;
    unitLabel = unit.kind === 'portion' ? unit.label : 'g';
  }
  return { totals: scaleTotals(food.nutrients, ratio), unitLabel, grams };
}
