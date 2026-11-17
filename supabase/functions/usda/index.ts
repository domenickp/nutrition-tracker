// Supabase Edge Function: USDA FoodData Central proxy. JWT is verified by the platform
// (verify_jwt = true in supabase/config.toml). The API key lives in env USDA_API_KEY.
import { normalizeFoodDetail, normalizeSearchFood, type UsdaFood } from './normalize.ts';
import { filterAndRank, mergeFoods, queryWords, wildcardQuery } from './search.ts';

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const apiKey = Deno.env.get('USDA_API_KEY');
  if (!apiKey) return json({ error: 'USDA_API_KEY is not configured' }, 500);

  const url = new URL(req.url);
  const op = url.searchParams.get('op');

  const searchUrl = (query: string, dataType: string, requireAll: boolean): string => {
    const p = new URLSearchParams({ api_key: apiKey, query, dataType, pageSize: '100' });
    if (requireAll) p.set('requireAllWords', 'true');
    return `${USDA_BASE}/foods/search?${p}`;
  };

  // One page of generic (Foundation/SR Legacy) and one of Branded, so Branded can't crowd
  // out generic foods. Returns null when a call fails.
  const fetchFoods = async (target: string): Promise<UsdaFood[] | null> => {
    try {
      const res = await fetch(target);
      if (!res.ok) return null;
      const data = await res.json();
      return (data.foods ?? []).map(normalizeSearchFood);
    } catch (_e) {
      return null;
    }
  };

  // null only when both calls fail.
  const searchBoth = async (query: string, requireAll: boolean): Promise<UsdaFood[] | null> => {
    const [generic, branded] = await Promise.all([
      fetchFoods(searchUrl(query, 'Foundation,SR Legacy', requireAll)),
      fetchFoods(searchUrl(query, 'Branded', requireAll)),
    ]);
    if (generic === null && branded === null) return null;
    return mergeFoods(generic ?? [], branded ?? []);
  };

  let target: string;
  if (op === 'search') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (queryWords(q).length === 0) return json({ error: 'Missing query parameter q' }, 400);
    // Partial words: `word*` prefixes, every word required; plain words are the fallback.
    const first = await searchBoth(wildcardQuery(q), true);
    if (first === null) return json({ error: 'USDA request failed' }, 502);
    let foods = filterAndRank(first, q, 25);
    if (foods.length === 0) {
      const second = await searchBoth(q, false);
      if (second === null) return json({ error: 'USDA request failed' }, 502);
      foods = filterAndRank(second, q, 25);
    }
    return json({ foods });
  } else if (op === 'food') {
    const raw = url.searchParams.get('fdcId') ?? '';
    if (!/^\d+$/.test(raw)) return json({ error: 'Missing or invalid fdcId' }, 400);
    target = `${USDA_BASE}/food/${raw}?${new URLSearchParams({ api_key: apiKey })}`;
  } else {
    return json({ error: 'Unknown or missing op (expected search or food)' }, 400);
  }

  try {
    const res = await fetch(target);
    if (!res.ok) return json({ error: `USDA request failed (${res.status})` }, 502);
    const data = await res.json();
    return json(normalizeFoodDetail(data));
  } catch (_e) {
    return json({ error: 'USDA request failed' }, 502);
  }
});
