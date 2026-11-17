import { describe, expect, it } from 'vitest';
import { ML_PER_UNIT, baseVolumeMl, gramsPerMl, parseVolumeLabel } from './volume';
import type { Food } from './types';

const food = (over: Partial<Food>): Food => ({
  id: 'f', name: 'X', brand: null, source: 'usda', fdcId: 1, baseLabel: '100 g', baseGrams: 100,
  nutrients: { kcal: 89, proteinG: 1, carbsG: 23, fatG: 0, waterMl: 0 }, portions: [], lastUsedAt: null,
  ...over,
});

describe('parseVolumeLabel', () => {
  it('amount forms', () => {
    expect(parseVolumeLabel('1 cup')?.amount).toBe(1);
    expect(parseVolumeLabel('0.5 cup')?.amount).toBe(0.5);
    expect(parseVolumeLabel('.5 cup')?.amount).toBe(0.5);
    expect(parseVolumeLabel('1/2 cup')?.amount).toBe(0.5);
    expect(parseVolumeLabel('1 1/2 cups')?.amount).toBe(1.5);
    expect(parseVolumeLabel('cup')?.amount).toBe(1);
  });
  it('computes ml', () => {
    expect(parseVolumeLabel('2 tbsp')?.ml).toBeCloseTo(29.5736, 3);
    expect(parseVolumeLabel('1 1/2 cups')?.ml).toBeCloseTo(354.882, 3);
  });
  it.each([
    ['1 cup', 'cup'], ['2 cups', 'cup'], ['1 c', 'cup'], ['1 CUP', 'cup'],
    ['1 tbsp', 'tbsp'], ['1 tbs', 'tbsp'], ['1 tablespoon', 'tbsp'], ['2 Tablespoons', 'tbsp'], ['1 T', 'tbsp'],
    ['1 tsp', 'tsp'], ['1 teaspoon', 'tsp'], ['3 teaspoons', 'tsp'], ['1 t', 'tsp'],
    ['8 fl oz', 'fl oz'], ['8 fl. oz', 'fl oz'], ['8 floz', 'fl oz'], ['8 fluid ounces', 'fl oz'], ['1 fluid ounce', 'fl oz'],
    ['355 ml', 'ml'], ['355 mL', 'ml'], ['1 milliliter', 'ml'], ['2 millilitres', 'ml'],
  ])('unit %s', (label, unit) => {
    expect(parseVolumeLabel(label)?.unit).toBe(unit);
  });
  it('T and t are case-sensitive and only exact', () => {
    expect(parseVolumeLabel('1 T')?.unit).toBe('tbsp');
    expect(parseVolumeLabel('1 t')?.unit).toBe('tsp');
    expect(parseVolumeLabel('1 Tx')).toBeNull();
    expect(parseVolumeLabel('1 tx')).toBeNull();
  });
  it('notes', () => {
    expect(parseVolumeLabel('1 cup, sliced')?.note).toBe('sliced');
    expect(parseVolumeLabel('1 cup (8 fl oz)')?.note).toBe('(8 fl oz)');
    expect(parseVolumeLabel('1 cup')?.note).toBe('');
  });
  it('rejects non-volume', () => {
    expect(parseVolumeLabel('1 medium')).toBeNull();
    expect(parseVolumeLabel('1 medium (7" to 7-7/8" long)')).toBeNull();
    expect(parseVolumeLabel('100 g')).toBeNull();
    expect(parseVolumeLabel('1 oz')).toBeNull();
    expect(parseVolumeLabel('1 cm')).toBeNull();
    expect(parseVolumeLabel('1 serving')).toBeNull();
    expect(parseVolumeLabel('')).toBeNull();
  });
});

describe('gramsPerMl', () => {
  it('uses the first volume portion', () => {
    const f = food({ portions: [{ label: '1 medium', grams: 118 }, { label: '1 cup, sliced', grams: 150 }] });
    const r = gramsPerMl(f)!;
    expect(r.gPerMl).toBeCloseTo(150 / 236.588, 6);
    expect(r.basis).toBe('from 1 cup, sliced = 150 g');
  });
  it('null when none', () => {
    expect(gramsPerMl(food({ portions: [{ label: '1 medium', grams: 118 }] }))).toBeNull();
  });
});

describe('baseVolumeMl', () => {
  it('parses base label', () => {
    expect(baseVolumeMl(food({ baseLabel: '355 ml' }))).toBe(355);
    expect(baseVolumeMl(food({ baseLabel: '12 fl oz' }))).toBeCloseTo(12 * ML_PER_UNIT['fl oz'], 6);
    expect(baseVolumeMl(food({ baseLabel: '100 g' }))).toBeNull();
  });
});
