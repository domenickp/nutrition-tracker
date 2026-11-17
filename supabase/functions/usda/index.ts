// Supabase Edge Function: USDA FoodData Central proxy. JWT is verified by the platform
// (verify_jwt = true in supabase/config.toml). The API key lives in env USDA_API_KEY.
import { normalizeFoodDetail, normalizeSearchFood } from './normalize.ts';
import { filterAndRank, queryWords, wildcardQuery } from './search.ts';

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

  const searchUrl = (query: string, requireAll: boolean): string => {
    const p = new URLSearchParams({
      api_key: apiKey,
      query,
      dataType: 'Foundation,SR Legacy,Branded',
      pageSize: '200',
    });
    if (requireAll) p.set('requireAllWords', 'true');
    return `${USDA_BASE}/foods/search?${p}`;
  };

  let target: string;
  if (op === 'search') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q) return json({ error: 'Missing query parameter q' }, 400);
    if (queryWords(q).length === 0) return json({ error: 'Missing query parameter q' }, 400);
    // Partial words: `word*` prefixes, every word required; plain words are the fallback below.
    target = searchUrl(wildcardQuery(q), true);
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
    if (op === 'search') {
      const q = (url.searchParams.get('q') ?? '').trim();
      let foods = filterAndRank((data.foods ?? []).map(normalizeSearchFood), q, 25);
      if (foods.length === 0) {
        const res2 = await fetch(searchUrl(q, false));
        if (res2.ok) {
          const data2 = await res2.json();
          foods = filterAndRank((data2.foods ?? []).map(normalizeSearchFood), q, 25);
        }
      }
      return json({ foods });
    }
    return json(normalizeFoodDetail(data));
  } catch (_e) {
    return json({ error: 'USDA request failed' }, 502);
  }
});
