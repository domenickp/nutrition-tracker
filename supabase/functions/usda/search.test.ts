import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeSearchFood, type UsdaFood } from './normalize.ts';
import { filterAndRank, mergeFoods, queryWords, wildcardQuery } from './search.ts';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));
const real = (n: string): UsdaFood[] => fx(n).foods.map(normalizeSearchFood);

let id = 1;
const food = (name: string, dataType = 'SR Legacy', brand: string | null = null): UsdaFood => ({
  name, brand, source: 'usda', fdcId: id++, dataType, baseLabel: '100 g', baseGrams: 100,
  nutrients: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1, waterMl: 0 }, portions: [],
});
const names = (fs: UsdaFood[]) => fs.map((f) => f.name);

describe('queryWords', () => {
  it('lowercases and splits on whitespace and commas', () => {
    expect(queryWords('Chick  Brea,RAW')).toEqual(['chick', 'brea', 'raw']);
  });
  it('drops empties and duplicates', () => {
    expect(queryWords('  , a ,, A b a ')).toEqual(['a', 'b']);
    expect(queryWords('')).toEqual([]);
  });
});

describe('wildcardQuery', () => {
  it('appends * to plain words only', () => {
    expect(wildcardQuery('chick brea')).toBe('chick* brea*');
    expect(wildcardQuery('2% milk')).toBe('2% milk*');
  });
});

describe('mergeFoods', () => {
  it('keeps order across lists and dedupes by fdcId', () => {
    const a = food('A');
    const b = food('B');
    const c = food('C');
    expect(names(mergeFoods([a, b], [{ ...b }, c], []))).toEqual(['A', 'B', 'C']);
    expect(mergeFoods()).toEqual([]);
  });
});

describe('filterAndRank filtering', () => {
  it('partial words match: "chick brea" keeps real chicken breast foods', () => {
    const out = filterAndRank(real('search-chick-brea'), 'chick brea');
    expect(out.length).toBe(20);
    expect(names(out)).toContain('Chicken, breast, boneless, skinless, raw');
  });
  it('drops a food missing any word', () => {
    const out = filterAndRank([food('Chicken thigh'), food('Chicken, breast')], 'chick brea');
    expect(names(out)).toEqual(['Chicken, breast']);
  });
  it('brand counts toward matching', () => {
    const out = filterAndRank([food('Yogurt', 'Branded', 'Chobani'), food('Yogurt', 'Branded', 'Other')], 'chob yog');
    expect(out.map((f) => f.brand)).toEqual(['Chobani']);
  });
  it('is case-insensitive and honours the limit; empty query yields nothing', () => {
    const many = Array.from({ length: 40 }, (_, i) => food(`Oat ${i}`));
    expect(filterAndRank(many, 'OAT')).toHaveLength(25);
    expect(filterAndRank(many, 'oat', 5)).toHaveLength(5);
    expect(filterAndRank(many, '  ')).toEqual([]);
  });
});

describe('filterAndRank ranking', () => {
  it('real fixture: "banana raw" puts Bananas, raw first and Foundation/SR before Branded', () => {
    const out = filterAndRank(real('search-banana-raw'), 'banana raw');
    expect(out[0].name).toBe('Bananas, raw');
    const firstBranded = out.findIndex((f) => f.dataType === 'Branded');
    expect(firstBranded).toBeGreaterThan(0);
    expect(out.slice(firstBranded).every((f) => f.dataType === 'Branded')).toBe(true);
    expect(out).toHaveLength(11);
  });
  it('(1) Foundation/SR Legacy before Branded', () => {
    const out = filterAndRank([food('Banana', 'Branded'), food('Banana, raw', 'Foundation')], 'banana');
    expect(out.map((f) => f.dataType)).toEqual(['Foundation', 'Branded']);
  });
  it('(2) name starting with the first word wins', () => {
    const out = filterAndRank([food('Sauce, peanut butter'), food('Peanut butter, creamy')], 'peanut butt');
    expect(names(out)).toEqual(['Peanut butter, creamy', 'Sauce, peanut butter']);
  });
  it('(3) more words matching at a word start wins', () => {
    const out = filterAndRank([food('Xbanana araw'), food('Zbanana, raw')], 'banana raw');
    // neither starts with the first word; only the second has "raw" at a word start
    expect(names(out)).toEqual(['Zbanana, raw', 'Xbanana araw']);
  });
  it('(4) shorter name wins, stable otherwise', () => {
    const out = filterAndRank([food('Bananas, overripe, raw'), food('Bananas, raw'), food('Bananas, ripe')], 'banana');
    expect(names(out)).toEqual(['Bananas, raw', 'Bananas, ripe', 'Bananas, overripe, raw']);
    const tie = filterAndRank([food('Oat a'), food('Oat b')], 'oat');
    expect(names(tie)).toEqual(['Oat a', 'Oat b']);
  });
});
