import { describe, expect, it } from 'vitest';
import { amountOptions, computeEntry, scaleTotals, sumNutrients, unitDisplayLabel } from './portions';
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
    // The "1 cup" portion also gives a density, so volume units are offered.
    const opts = amountOptions(usda);
    expect(opts[0]).toEqual({ kind: 'base' });
    expect(opts[1]).toEqual({ kind: 'portion', label: '1 cup', grams: 240 });
    expect(opts.slice(2, -1).map((o) => (o.kind === 'volume' ? o.unit : o.kind))).toEqual([
      'cup', 'tbsp', 'tsp', 'fl oz', 'ml',
    ]);
    expect(opts[opts.length - 1]).toEqual({ kind: 'grams' });
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

const banana: Food = {
  id: 'b', name: 'Banana', brand: null, source: 'usda', fdcId: 2,
  baseLabel: '100 g', baseGrams: 100,
  nutrients: { kcal: 89, proteinG: 1.1, carbsG: 22.8, fatG: 0.3, waterMl: 75 },
  portions: [{ label: '1 cup, sliced', grams: 150 }], lastUsedAt: null,
};
const drink: Food = {
  id: 'd', name: 'Drink', brand: 'Co', source: 'usda', fdcId: 3,
  baseLabel: '355 ml', baseGrams: null,
  nutrients: { kcal: 140, proteinG: 0, carbsG: 35, fatG: 0, waterMl: 0 },
  portions: [], lastUsedAt: null,
};

describe('volume units', () => {
  it('density-derived tbsp', () => {
    const tbsp = amountOptions(banana).find((o) => o.kind === 'volume' && o.unit === 'tbsp')!;
    expect(tbsp).toMatchObject({ basis: 'from 1 cup, sliced = 150 g' });
    const r = computeEntry(banana, 2, tbsp);
    expect(r.grams).toBe(18.8); // 18.75 rounded to 1 decimal
    expect(r.totals.kcal).toBe(16.7);
    expect(r.ml).toBe(29.6);
    expect(r.unitLabel).toBe('tbsp');
  });
  it('density-derived cup', () => {
    const cup = amountOptions(banana).find((o) => o.kind === 'volume' && o.unit === 'cup')!;
    const r = computeEntry(banana, 1, cup);
    expect(r.grams).toBe(150);
    expect(r.totals.kcal).toBe(133.5);
  });
  it('ml-based drink', () => {
    const opts = amountOptions(drink);
    expect(opts.map((o) => o.kind)).toEqual(['base', 'volume', 'volume', 'volume', 'volume', 'volume']);
    const cup = opts.find((o) => o.kind === 'volume' && o.unit === 'cup')!;
    expect(cup).toMatchObject({ gramsPerUnit: null, basis: 'from 355 ml serving' });
    const r = computeEntry(drink, 1, cup);
    expect(r.totals.kcal).toBe(93.3); // 140 * 236.588 / 355
    expect(r.grams).toBeNull();
    expect(r.ml).toBe(236.6);
    const base = computeEntry(drink, 2, { kind: 'base' });
    expect(base.ml).toBe(710);
    expect(base.grams).toBeNull();
  });
  it('no volume info -> no volume options', () => {
    const noVol = { ...banana, portions: [{ label: '1 medium', grams: 118 }] };
    expect(amountOptions(noVol).some((o) => o.kind === 'volume')).toBe(false);
    expect(amountOptions(manual).some((o) => o.kind === 'volume')).toBe(false);
  });
  it('ml for portion and grams entries', () => {
    expect(computeEntry(banana, 150, { kind: 'grams' }).ml).toBe(236.6);
    expect(computeEntry(usda, 1, { kind: 'base' }).ml).toBeNull();
  });
  it('base serving with volume label and grams', () => {
    const milk: Food = { ...banana, baseLabel: '1 cup', baseGrams: 245, portions: [] };
    const tbsp = amountOptions(milk).find((o) => o.kind === 'volume' && o.unit === 'tbsp')!;
    expect(tbsp).toMatchObject({ basis: 'from 1 cup serving' });
    expect(computeEntry(milk, 16, tbsp).grams).toBeCloseTo(245, 0);
    expect(computeEntry(milk, 1, { kind: 'base' }).ml).toBe(236.6);
  });
});

describe('unitDisplayLabel', () => {
  it('labels', () => {
    expect(unitDisplayLabel(banana, { kind: 'base' })).toBe('100 g');
    expect(unitDisplayLabel(banana, { kind: 'portion', label: '1 cup, sliced', grams: 150 })).toBe('1 cup, sliced');
    expect(unitDisplayLabel(banana, { kind: 'grams' })).toBe('g');
    const cup = amountOptions(banana).find((o) => o.kind === 'volume')!;
    expect(unitDisplayLabel(banana, cup)).toBe('cup');
  });
});
