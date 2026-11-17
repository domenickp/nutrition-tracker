# Volume measures, gram totals, and better search — Design

Date: 2026-11-17
Status: Approved by owner (approach (c) chosen in conversation)

## Why

The owner measures most food with measuring cups and spoons rather than a scale, because judging
volume is easier. Today they convert cups to grams by hand before logging. USDA search
returns many loosely related results, which makes the right food hard to find.

## Goals

1. Log any food by cup, tbsp, tsp, fl oz or ml when a volume-to-grams density is known.
2. Let the owner record their own measure once ("1 cup = 140 g") so it's there next time.
3. Show the entry's total grams (or ml) next to the nutrition preview.
4. Search finds foods where every typed word appears somewhere in the name or brand, even as
   a partial word, and ranks the likeliest matches first.

## Non-goals

- A built-in density table for generic ingredients. Density comes from the food's own
  portions or from the owner.
- Editing or deleting saved measures (a later issue if needed).
- Changing the Today screen's edit-quantity behaviour.

## Approaches considered

| Option | Trade-off | Decision |
|---|---|---|
| (a) Derive tbsp/tsp/fl oz/ml from any one volume portion a food already has | Works with no typing for many USDA foods; nothing for foods with no volume portion | Part of the choice |
| (b) Owner records "1 cup = N g" once per food, saved as a portion | Covers every food; needs one weighing or a label | Part of the choice |
| **(c) Both** | (b) supplies the density when (a) has nothing | **Chosen by owner** |

## Design

### Volume units (pure, `src/lib/volume.ts`)
- Units and ml: cup 236.588, tbsp 14.7868, tsp 4.92892, fl oz 29.5735, ml 1.
- `parseVolumeLabel(label)` recognizes a leading amount (integer, decimal, fraction like
  `1/2`, or mixed `1 1/2`) followed by a volume unit word, with synonyms (cup/cups/c,
  tbsp/tablespoon(s)/T, tsp/teaspoon(s)/t, fl oz/fluid ounce(s), ml/mL/milliliter(s)).
  Anything after (e.g. `", sliced"`) is a note. Returns `{ amount, unit, ml, note }` or null.
- **Density** for a food (g per ml): from the first portion whose label parses as volume.
  The owner's own measures are stored first in `portions` (prepended), so they take
  priority over USDA's.
- **Foods whose base serving is itself a volume** (e.g. Branded drinks with base `"355 ml"`,
  `baseGrams` null): volume units work directly by ratio of ml, with no density needed. This
  also lifts v1's "servings only" limit for ml-based foods.

### Amount options (`src/lib/portions.ts`)
- New `AmountUnit` kind `volume`: `{ kind: 'volume'; unit: VolumeUnit; gramsPerUnit: number | null; servingsPerUnit: number; basis: string }`.
  `basis` describes where the conversion came from, e.g. `"from 1 cup, sliced = 150 g"`
  or `"from 355 ml serving"`.
- `amountOptions(food)` order: base; existing portions; derived volume units (cup, tbsp,
  tsp, fl oz, ml) when a density or volume base exists; grams (when `baseGrams` known).
- `computeEntry` for volume: ratio = quantity × servingsPerUnit; grams = quantity ×
  gramsPerUnit when known; unitLabel = the unit (`"cup"`, `"tbsp"`, …).
- `computeEntry` also returns `ml: number | null` (known for volume units) so the UI can
  show "= 355 ml" when grams aren't known.

### Add food screen
- Preview line shows `= 360 g` (or `= 355 ml`, or nothing when neither is known) beside
  kcal and P/C/F, for every unit including servings.
- Volume options show their `basis` in small text when selected.
- "Add a measure" link in the amount step opens a small form: amount, unit (cup, tbsp, tsp,
  fl oz), and grams. Saving prepends the portion (label like `"1 cup"`) to the food via
  `updateFood` and refreshes the options. If the food has no `baseGrams` and its base serving
  isn't a volume, the link explains that grams per serving are needed first.

### Search
- USDA (Edge Function): fetch a larger page (up to 200). Keep only foods whose
  `description + brand` contains every query word as a case-insensitive substring. Rank
  Foundation/SR Legacy before Branded, then names starting with the first word, then
  shorter names. Return the top 25. The builder tests partial words against the live API
  (DEMO_KEY) and picks the query form that returns candidates for them, such as plain
  words or `word*` wildcards.
- Saved foods (`listFoods`): every word must match (`ilike` per word, ANDed).

## Left to the builder
Exact layout of the "Add a measure" form, ranking tie-breaks, and the USDA query form, all
backed by tests.
