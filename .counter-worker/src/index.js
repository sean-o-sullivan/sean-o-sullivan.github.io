const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  }
});

const hex = bytes => [...new Uint8Array(bytes)]
  .map(byte => byte.toString(16).padStart(2, '0'))
  .join('');

const digestAddress = async (address, salt) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(address)));
};

const corsHeaders = origin => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin'
});

const getCounter = env => {
  const id = env.DISCOVERY_COUNTER.idFromName('curated-internet-v3');
  return env.DISCOVERY_COUNTER.get(id);
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = new Set(env.ALLOWED_ORIGINS.split(',').map(value => value.trim()));
    const allowed = allowedOrigins.has(origin);

    if (request.method === 'OPTIONS') {
      return allowed
        ? new Response(null, { status: 204, headers: corsHeaders(origin) })
        : json({ error: 'Origin not allowed' }, 403);
    }

    const url = new URL(request.url);
    const counter = getCounter(env);

    if (request.method === 'GET' && url.pathname === '/count') {
      const counterResponse = await counter.fetch('https://counter.internal/count');
      return json(await counterResponse.json());
    }

    if (request.method !== 'POST' || url.pathname !== '/found') {
      return json({ error: 'Not found' }, 404);
    }

    if (!allowed) return json({ error: 'Origin not allowed' }, 403);

    const address = request.headers.get('CF-Connecting-IP');
    if (!address || !env.COUNTER_SALT) {
      return json({ error: 'Counter unavailable' }, 503, corsHeaders(origin));
    }

    const visitorKey = await digestAddress(address, env.COUNTER_SALT);
    const counterResponse = await counter.fetch('https://counter.internal/increment', {
      method: 'POST',
      headers: { 'X-Visitor-Key': visitorKey }
    });
    const result = await counterResponse.json();

    return json(result, 200, corsHeaders(origin));
  }
};

export class DiscoveryCounter {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/count') {
      return json({ count: await this.ctx.storage.get('count') || 0 });
    }

    const visitorKey = request.headers.get('X-Visitor-Key') || '';

    if (request.method !== 'POST' || url.pathname !== '/increment' || !/^[a-f0-9]{64}$/.test(visitorKey)) {
      return json({ error: 'Invalid request' }, 400);
    }

    return json(await this.increment(visitorKey));
  }

  async increment(visitorKey) {
    return this.ctx.storage.transaction(async transaction => {
      const now = Date.now();
      const seenKey = `seen:${visitorKey}`;
      const [count = 0, seenUntil = 0] = await Promise.all([
        transaction.get('count'),
        transaction.get(seenKey)
      ]);

      if (seenUntil > now) return { count, counted: false };

      const nextCount = count + 1;
      await Promise.all([
        transaction.put('count', nextCount),
        transaction.put(seenKey, now + DEDUPE_WINDOW_MS)
      ]);

      const alarm = await transaction.getAlarm();
      if (!alarm) await transaction.setAlarm(now + DEDUPE_WINDOW_MS);

      return { count: nextCount, counted: true };
    });
  }

  async alarm() {
    const now = Date.now();
    const entries = await this.ctx.storage.list({ prefix: 'seen:' });
    const expired = [];
    let nextExpiry = Infinity;

    for (const [key, expiresAt] of entries) {
      if (expiresAt <= now) expired.push(key);
      else nextExpiry = Math.min(nextExpiry, expiresAt);
    }

    if (expired.length) await this.ctx.storage.delete(expired);
    if (Number.isFinite(nextExpiry)) await this.ctx.storage.setAlarm(nextExpiry);
  }
}
