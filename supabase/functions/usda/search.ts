// Pure USDA search helpers: per-word substring filtering and ranking. No Deno globals,
// no runtime imports, so it runs under Deno (Edge Function), Node (Vitest) and the client.
import type { UsdaFood } from './normalize.ts';

/** Lowercased query words: split on whitespace and commas, no empties, no duplicates. */
export function queryWords(q: string): string[] {
  const out: string[] = [];
  for (const w of q.toLowerCase().split(/[\s,]+/)) {
    if (w && !out.includes(w)) out.push(w);
  }
  return out;
}

const isWordStart = (hay: string, w: string): boolean => {
  for (let i = hay.indexOf(w); i !== -1; i = hay.indexOf(w, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(hay[i - 1])) return true;
  }
  return false;
};

/**
 * Keep foods where every query word is a substring of "name brand" (case-insensitive), then
 * rank: Foundation/SR Legacy before Branded, name starts with the first word, more words
 * matching at a word start, shorter name. Ties keep USDA's order (stable sort).
 */
export function filterAndRank(foods: UsdaFood[], q: string, limit = 25): UsdaFood[] {
  const words = queryWords(q);
  if (words.length === 0) return [];
  const scored = foods
    .map((f) => {
      const name = f.name.toLowerCase();
      return { f, name, hay: `${name} ${(f.brand ?? '').toLowerCase()}` };
    })
    .filter(({ hay }) => words.every((w) => hay.includes(w)))
    .map(({ f, name, hay }) => ({
      f,
      branded: f.dataType === 'Branded' ? 1 : 0,
      starts: name.startsWith(words[0]) ? 0 : 1,
      wordStarts: words.filter((w) => isWordStart(hay, w)).length,
      len: name.length,
    }));
  scored.sort(
    (a, b) => a.branded - b.branded || a.starts - b.starts || b.wordStarts - a.wordStarts || a.len - b.len,
  );
  return scored.slice(0, limit).map((s) => s.f);
}

/** Concatenate result lists in order, dropping repeats of the same fdcId. */
export function mergeFoods(...lists: UsdaFood[][]): UsdaFood[] {
  const seen = new Set<number>();
  const out: UsdaFood[] = [];
  for (const list of lists) {
    for (const f of list) {
      if (seen.has(f.fdcId)) continue;
      seen.add(f.fdcId);
      out.push(f);
    }
  }
  return out;
}

/** USDA query form: each plain word gets a trailing `*` so partial words match as prefixes. */
export function wildcardQuery(q: string): string {
  return queryWords(q)
    .map((w) => (/^[\p{L}\p{N}]+$/u.test(w) ? `${w}*` : w))
    .join(' ');
}
