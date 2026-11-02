// Mirror of the school's MEB site (velikoyosb.meb.k12.tr) on vosb.k12.tr.
//
// MEB's server answers quickly from Turkey but is slow and drops connections from Cloudflare
// (an F5 firewall sits in front of it): 3–35 s or a 522 on uncached requests. Visitors from
// Turkey land on CDG, AMS or FRA, so a per-location cache alone is often cold. Every successful
// GET is therefore kept in two places and served stale-while-revalidate:
//   - the edge cache of that location (all content types, fast),
//   - KV, shared by every location (text pages only, written at most once per KV_WRITE_MS).
// Visitors get a stored copy at once, it is refreshed in the background once older than
// FRESH_MS, and a slow or failing MEB never reaches the visitor while any copy exists.
// The cron keeps the home page (what Uptime Kuma checks) warm in KV.
const ORIGIN = 'https://velikoyosb.meb.k12.tr';
const PUBLIC = 'https://vosb.k12.tr';
const FRESH_MS = 5 * 60 * 1000;
const KV_WRITE_MS = 30 * 60 * 1000; // free plan: 1000 KV writes/day
const KEEP_SECONDS = 7 * 24 * 60 * 60; // how long an edge-cache copy stays available as a fallback
const KV_MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 25000;
const WARM_PATHS = ['/'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': '*',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } });
    }

    if (request.method !== 'GET') {
      try {
        return (await fetchOrigin(request, url)).response;
      } catch {
        return new Response('Gateway Timeout', { status: 504 });
      }
    }

    // Cookies and other per-visitor headers are not part of the key: the site is public.
    const key = url.pathname + url.search;
    const cache = caches.default;
    const cacheKey = new Request(url.toString());
    const refresh = async () => {
      const { response, text } = await fetchOrigin(request, url);
      if (response.ok) {
        await cache.put(cacheKey, forCache(response.clone()));
        if (text !== null) await saveToKv(env, key, response, text);
      }
      return response;
    };

    const cached = await cache.match(cacheKey);
    if (cached) {
      const age = Date.now() - Number(cached.headers.get('x-mirror-stored-at') || 0);
      if (age > FRESH_MS) ctx.waitUntil(refresh().catch(() => {}));
      return forVisitor(cached);
    }

    const stored = await env.MIRROR.getWithMetadata(key);
    if (stored.value !== null && stored.metadata) {
      ctx.waitUntil(refresh().catch(() => {}));
      return fromKv(stored.value, stored.metadata);
    }

    try {
      return await refresh();
    } catch {
      return new Response('Gateway Timeout', { status: 504 });
    }
  },

  async scheduled(event, env, ctx) {
    for (const path of WARM_PATHS) {
      const url = new URL(PUBLIC + path);
      try {
        const { response, text } = await fetchOrigin(new Request(url), url);
        if (response.ok && text !== null) await saveToKv(env, path, response, text);
      } catch {
        // MEB did not answer this time; the next run tries again.
      }
    }
  },
};

// Returns the rewritten response, plus its body as a string when it is a text type.
async function fetchOrigin(request, url) {
  const proxy = `${url.protocol}//${url.host}`;
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!['host', 'origin', 'referer'].includes(key.toLowerCase())) headers.set(key, value);
  });
  headers.set('Referer', ORIGIN);
  headers.set('Origin', ORIGIN);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  headers.set('Accept-Encoding', 'identity');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const response = await fetch(ORIGIN + url.pathname + url.search, {
    method: request.method,
    headers,
    body: hasBody ? request.body : null,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const ct = response.headers.get('content-type') ?? '';
  const isText = ct.includes('text/') || ct.includes('application/javascript') ||
    ct.includes('application/json') || ct.includes('application/xml');
  // Read text bodies here, inside the timeout, so a stalled transfer also counts as a failure.
  const text = isText
    ? (await response.text()).replaceAll(ORIGIN, proxy).replaceAll(`//${new URL(ORIGIN).host}`, `//${url.host}`)
    : null;

  const out = new Response(text ?? response.body, { status: response.status, statusText: response.statusText, headers: new Headers(response.headers) });
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  out.headers.set('Access-Control-Expose-Headers', '*');
  const location = out.headers.get('location');
  if (location) out.headers.set('location', location.replace(ORIGIN, proxy));
  return { response: out, text };
}

async function saveToKv(env, key, response, text) {
  if (text.length > KV_MAX_BYTES) return;
  const { metadata } = await env.MIRROR.getWithMetadata(key);
  if (metadata && Date.now() - metadata.at < KV_WRITE_MS) return;
  await env.MIRROR.put(key, text, {
    metadata: { at: Date.now(), ct: response.headers.get('content-type') ?? '', cc: response.headers.get('cache-control') ?? '' },
  });
}

function fromKv(text, metadata) {
  const h = new Headers(CORS);
  h.set('Access-Control-Expose-Headers', '*');
  if (metadata.ct) h.set('content-type', metadata.ct);
  if (metadata.cc) h.set('cache-control', metadata.cc);
  return new Response(text, { status: 200, headers: h });
}

// The stored copy carries its own lifetime; the origin's Cache-Control is kept aside for visitors.
function forCache(response) {
  const h = new Headers(response.headers);
  h.set('x-mirror-cc', h.get('cache-control') ?? '');
  h.set('x-mirror-stored-at', String(Date.now()));
  h.set('cache-control', `public, max-age=${KEEP_SECONDS}`);
  h.delete('set-cookie');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

function forVisitor(cached) {
  const h = new Headers(cached.headers);
  const cc = h.get('x-mirror-cc');
  if (cc) h.set('cache-control', cc);
  else h.delete('cache-control');
  h.delete('x-mirror-cc');
  h.delete('x-mirror-stored-at');
  return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers: h });
}
