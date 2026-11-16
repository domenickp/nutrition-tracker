// Supabase Edge Function: USDA FoodData Central proxy. JWT is verified by the platform
// (verify_jwt = true in supabase/config.toml). The API key lives in env USDA_API_KEY.
import { normalizeFoodDetail, normalizeSearchFood } from './normalize.ts';

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

  let target: string;
  if (op === 'search') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q) return json({ error: 'Missing query parameter q' }, 400);
    const p = new URLSearchParams({
      api_key: apiKey,
      query: q,
      dataType: 'Foundation,SR Legacy,Branded',
      pageSize: '25',
    });
    target = `${USDA_BASE}/foods/search?${p}`;
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
      return json({ foods: (data.foods ?? []).map(normalizeSearchFood) });
    }
    return json(normalizeFoodDetail(data));
  } catch (_e) {
    return json({ error: 'USDA request failed' }, 502);
  }
});
