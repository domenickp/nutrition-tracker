import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeFoodDetail, normalizeSearchFood } from './normalize.ts';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));

describe('normalizeFoodDetail', () => {
  it('Foundation: per 100 g with portions', () => {
    const r = normalizeFoodDetail(fx('foundation-banana'));
    expect(r).toMatchObject({
      name: 'Bananas, overripe, raw', brand: null, source: 'usda', fdcId: 1105073,
      dataType: 'Foundation', baseLabel: '100 g', baseGrams: 100,
      nutrients: { kcal: 85, proteinG: 0.7, carbsG: 20.1, fatG: 0.2, waterMl: 0 },
    });
    expect(r.portions).toEqual([
      { label: '1 Peeled', grams: 110 },
      { label: '1 RACC', grams: 140 },
    ]);
  });

  it('SR Legacy: modifier used when unit is undetermined', () => {
    const r = normalizeFoodDetail(fx('sr-legacy-banana'));
    expect(r.dataType).toBe('SR Legacy');
    expect(r.baseLabel).toBe('100 g');
    expect(r.nutrients.kcal).toBe(89);
    expect(r.portions).toContainEqual({ label: '1 NLEA serving', grams: 126 });
    expect(r.portions.every((p) => p.grams > 0 && !p.label.includes('undetermined'))).toBe(true);
  });

  it('skips undetermined portions without modifier and non-positive grams', () => {
    const r = normalizeFoodDetail({
      fdcId: 1, description: 'X', dataType: 'SR Legacy', foodNutrients: [],
      foodPortions: [
        { amount: 1, gramWeight: 50, measureUnit: { name: 'undetermined' } },
        { amount: 1, gramWeight: 0, modifier: 'cup', measureUnit: { name: 'undetermined' } },
        { amount: 2, gramWeight: 30, measureUnit: { name: 'slice' } },
      ],
    });
    expect(r.portions).toEqual([{ label: '2 slice', grams: 30 }]);
  });

  it('Branded with g serving', () => {
    const r = normalizeFoodDetail(fx('branded-g-peanut-butter'));
    expect(r.baseLabel).toBe('32 g');
    expect(r.baseGrams).toBe(32);
    expect(r.brand).toBe("BETTER'N PEANUT BUTTER");
    expect(r.nutrients).toEqual({ kcal: 99.8, proteinG: 4, carbsG: 13, fatG: 2, waterMl: 0 });
    expect(r.portions).toEqual([]);
  });

  it('Branded with ml serving: baseGrams null, labelNutrients preferred', () => {
    const r = normalizeFoodDetail(fx('branded-ml-cola'));
    expect(r.baseLabel).toBe('355 ml');
    expect(r.baseGrams).toBeNull();
    expect(r.nutrients).toEqual({ kcal: 138, proteinG: 0, carbsG: 36, fatG: 0, waterMl: 0 });
  });

  it('Branded ml without labelNutrients scales per-100 values', () => {
    const f = fx('branded-ml-cola');
    delete f.labelNutrients;
    expect(normalizeFoodDetail(f).nutrients.kcal).toBe(138.5);
  });

  it('Branded without servingSize falls back to 100 g', () => {
    const f = fx('branded-g-peanut-butter');
    delete f.servingSize;
    const r = normalizeFoodDetail(f);
    expect(r.baseLabel).toBe('100 g');
    expect(r.baseGrams).toBe(100);
    expect(r.nutrients.kcal).toBe(312);
  });
});

describe('normalizeSearchFood', () => {
  it('normalizes every item in a real search response', () => {
    const { foods } = fx('search-banana');
    const out = foods.map(normalizeSearchFood);
    expect(out).toHaveLength(foods.length);
    for (const f of out) {
      expect(f.source).toBe('usda');
      expect(f.portions).toEqual([]);
      expect(f.nutrients.kcal).toBeGreaterThan(0);
    }
    expect(out[0].name).toBe('Banana');
    expect(out[0].baseLabel).toBe('32 g');
    expect(out[0].nutrients.kcal).toBe(99.8);
    expect(out.find((f: { dataType: string }) => f.dataType === 'SR Legacy')?.baseLabel).toBe('100 g');
  });
});

describe('energy fallback and naming', () => {
  const base = { fdcId: 1, description: 'Thing', dataType: 'Foundation' };
  const n = (number: string, amount: number) => ({ nutrient: { number }, amount });

  it('falls back 208 -> 957 -> 958, else 0', () => {
    expect(normalizeFoodDetail({ ...base, foodNutrients: [n('957', 50), n('958', 40)] }).nutrients.kcal).toBe(50);
    expect(normalizeFoodDetail({ ...base, foodNutrients: [n('958', 40)] }).nutrients.kcal).toBe(40);
    expect(normalizeFoodDetail({ ...base, foodNutrients: [n('208', 10), n('957', 50)] }).nutrients.kcal).toBe(10);
    expect(normalizeFoodDetail({ ...base, foodNutrients: [] }).nutrients)
      .toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0 });
  });

  it('search items use nutrientNumber/value', () => {
    const r = normalizeSearchFood({ ...base, foodNutrients: [{ nutrientNumber: '957', value: 61.26 }] });
    expect(r.nutrients.kcal).toBe(61.3);
  });

  it('sentence-cases only ALL CAPS names', () => {
    expect(normalizeSearchFood({ ...base, description: 'CHOCOLATE CHIP COOKIES' }).name).toBe('Chocolate chip cookies');
    expect(normalizeSearchFood({ ...base, description: 'Bananas, raw' }).name).toBe('Bananas, raw');
  });

  it('brand falls back to brandOwner', () => {
    expect(normalizeSearchFood({ ...base, brandOwner: 'Owner Co' }).brand).toBe('Owner Co');
  });
});
