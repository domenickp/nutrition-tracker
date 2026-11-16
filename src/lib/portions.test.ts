import { describe, expect, it } from 'vitest';
import { amountOptions, computeEntry, scaleTotals, sumNutrients } from './portions';
import type { Food } from './types';

const usda: Food = {
  id: 'f1', name: 'Oats', brand: null, source: 'usda', fdcId: 1,
  baseLabel: '100 g', baseGrams: 100,
  nutrients: { kcal: 380, proteinG: 13, carbsG: 67, fatG: 7, waterMl: 8 },
  portions: [{ label: '1 cup', grams: 240 }], lastUsedAt: null,
};
const manual: Food = {
  ...usda, id: 'f2', source: 'manual', fdcId: null, baseLabel: '1 bar', baseGrams: null,
  nutrients: { kcal: 200, proteinG: 20, carbsG: 22, fatG: 6, waterMl: 0 },
};

describe('amountOptions', () => {
  it('with baseGrams', () => {
    expect(amountOptions(usda)).toEqual([
      { kind: 'base' }, { kind: 'portion', label: '1 cup', grams: 240 }, { kind: 'grams' },
    ]);
  });
  it('without baseGrams', () => {
    expect(amountOptions(manual)).toEqual([{ kind: 'base' }]);
  });
});

describe('computeEntry', () => {
  it('base on usda food', () => {
    const r = computeEntry(usda, 1.5, { kind: 'base' });
    expect(r.unitLabel).toBe('servings');
    expect(r.grams).toBe(150);
    expect(r.totals.kcal).toBe(570);
  });
  it('portion', () => {
    const r = computeEntry(usda, 0.5, { kind: 'portion', label: '1 cup', grams: 240 });
    expect(r.unitLabel).toBe('1 cup');
    expect(r.grams).toBe(120);
    expect(r.totals).toEqual({ kcal: 456, proteinG: 15.6, carbsG: 80.4, fatG: 8.4, waterMl: 9.6 });
  });
  it('grams', () => {
    const r = computeEntry(usda, 55, { kind: 'grams' });
    expect(r.unitLabel).toBe('g');
    expect(r.grams).toBe(55);
    expect(r.totals.kcal).toBe(209);
    expect(r.totals.proteinG).toBe(7.2);
  });
  it('manual food base has null grams', () => {
    const r = computeEntry(manual, 2, { kind: 'base' });
    expect(r.grams).toBeNull();
    expect(r.totals.kcal).toBe(400);
  });
  it('errors', () => {
    expect(() => computeEntry(manual, 1, { kind: 'grams' })).toThrow();
    expect(() => computeEntry(manual, 1, { kind: 'portion', label: 'x', grams: 5 })).toThrow();
    expect(() => computeEntry(usda, -1, { kind: 'base' })).toThrow();
    expect(() => computeEntry(usda, NaN, { kind: 'base' })).toThrow();
    expect(() => computeEntry(usda, Infinity, { kind: 'grams' })).toThrow();
  });
});

describe('scaleTotals / sumNutrients', () => {
  it('scales and rounds', () => {
    expect(scaleTotals(usda.nutrients, 1 / 3).kcal).toBe(126.7);
  });
  it('sums with rounding', () => {
    const a = { kcal: 0.1, proteinG: 1, carbsG: 2, fatG: 3, waterMl: 4 };
    const b = { kcal: 0.2, proteinG: 1.25, carbsG: 0, fatG: 0, waterMl: 0 };
    expect(sumNutrients([a, b])).toEqual({ kcal: 0.3, proteinG: 2.3, carbsG: 2, fatG: 3, waterMl: 4 });
    expect(sumNutrients([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0 });
  });
});
