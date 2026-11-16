// Pure USDA FoodData Central -> NewFood normalizer. No Deno globals, no runtime imports,
// so it runs under both Deno (Edge Function) and Node (Vitest).
import type { NewFood, Portion } from '../../../src/lib/types.ts';

export type UsdaFood = NewFood & { source: 'usda'; fdcId: number; dataType: string };

/* eslint-disable @typescript-eslint/no-explicit-any */

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Nutrient value by number from either a search item or a detail response. */
function nutrientValue(f: any, num: string): number | undefined {
  for (const n of f?.foodNutrients ?? []) {
    const number = n?.nutrientNumber ?? n?.nutrient?.number;
    if (String(number) !== num) continue;
    const v = n?.value ?? n?.amount;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

function cleanName(description: unknown): string {
  const s = typeof description === 'string' ? description.trim() : '';
  if (s && s === s.toUpperCase() && s !== s.toLowerCase()) {
    const lower = s.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return s;
}

function normalizeUnit(unit: unknown): string {
  const u = String(unit ?? '').trim().toLowerCase();
  if (u === 'grm') return 'g';
  if (u === 'mlt') return 'ml';
  return u;
}

/** `scale` converts per-100 values to the base serving; `label` (Branded detail) overrides. */
function build(
  f: any,
  base: Pick<NewFood, 'baseLabel' | 'baseGrams' | 'portions'>,
  scale: number,
  label?: any,
): UsdaFood {
  const kcal = nutrientValue(f, '208') ?? nutrientValue(f, '957') ?? nutrientValue(f, '958') ?? 0;
  const pick = (labelKey: string, per100: number): number => {
    const lv = label?.[labelKey]?.value;
    return round1(typeof lv === 'number' && Number.isFinite(lv) ? lv : per100 * scale);
  };
  return {
    name: cleanName(f.description),
    brand: f.brandName || f.brandOwner || null,
    source: 'usda',
    fdcId: Number(f.fdcId),
    dataType: String(f.dataType ?? ''),
    ...base,
    nutrients: {
      kcal: pick('calories', kcal),
      proteinG: pick('protein', nutrientValue(f, '203') ?? 0),
      carbsG: pick('carbohydrates', nutrientValue(f, '205') ?? 0),
      fatG: pick('fat', nutrientValue(f, '204') ?? 0),
      waterMl: 0,
    },
  };
}

function normalizeAny(f: any, portions: Portion[], useLabel: boolean): UsdaFood {
  if (f?.dataType === 'Branded') {
    const size = Number(f.servingSize);
    if (Number.isFinite(size) && size > 0) {
      const unit = normalizeUnit(f.servingSizeUnit);
      return build(
        f,
        { baseLabel: `${size} ${unit}`.trim(), baseGrams: unit === 'g' ? size : null, portions },
        size / 100,
        useLabel ? f.labelNutrients : undefined,
      );
    }
  }
  return build(f, { baseLabel: '100 g', baseGrams: 100, portions }, 1);
}

/** From a /v1/foods/search item. No portions are available there. */
export function normalizeSearchFood(f: any): UsdaFood {
  return normalizeAny(f, [], false);
}

/** From /v1/food/{fdcId}. Includes portions (Foundation / SR Legacy) and label nutrients (Branded). */
export function normalizeFoodDetail(f: any): UsdaFood {
  const portions: Portion[] = [];
  if (f?.dataType !== 'Branded') {
    for (const p of f?.foodPortions ?? []) {
      const grams = Number(p?.gramWeight);
      if (!(grams > 0)) continue;
      const modifier = typeof p?.modifier === 'string' ? p.modifier.trim() : '';
      const unitName = typeof p?.measureUnit?.name === 'string' ? p.measureUnit.name.trim() : '';
      if (!modifier && (!unitName || unitName.toLowerCase() === 'undetermined')) continue;
      const label = `${p?.amount ?? 1} ${modifier || unitName}`.trim();
      portions.push({ label, grams });
    }
  }
  return normalizeAny(f, portions, true);
}
