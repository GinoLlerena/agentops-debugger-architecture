import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, MiddlewareHandler } from 'hono';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * In-memory token-bucket rate limiter keyed by client IP. Both the bucket
 * capacity and the refill rate are `perMinute`: a full bucket drains after
 * `perMinute` requests in quick succession, then refills continuously (one token
 * every `60000 / perMinute` ms). Process-local — adequate for a single hackathon
 * instance; a shared store (e.g. Redis) is the production upgrade.
 *
 * `perMinute <= 0` disables limiting and returns a pass-through middleware, so
 * the offline default (0) never throttles local runs or the test suite.
 */
export function rateLimit(perMinute: number): MiddlewareHandler {
  if (perMinute <= 0) {
    return async (_c, next) => {
      await next();
    };
  }

  const capacity = perMinute;
  const refillPerMs = perMinute / 60_000;
  const buckets = new Map<string, Bucket>();
  const IDLE_MS = 5 * 60_000;
  const MAX_KEYS = 4096;

  return async (c, next) => {
    const now = Date.now();
    const key = clientIp(c);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now };
      buckets.set(key, bucket);
    } else {
      bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.lastRefill) * refillPerMs);
      bucket.lastRefill = now;
    }

    if (bucket.tokens < 1) {
      return c.json({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' }, 429);
    }
    bucket.tokens -= 1;

    // Opportunistic prune so a flood of distinct IPs can't grow the map without
    // bound: drop buckets idle long enough to have fully refilled anyway.
    if (buckets.size > MAX_KEYS) {
      for (const [k, b] of buckets) {
        if (now - b.lastRefill > IDLE_MS) buckets.delete(k);
      }
    }

    await next();
  };
}

/**
 * Best-effort client IP: prefer the left-most `X-Forwarded-For` hop (set by the
 * deploy's reverse proxy), else the TCP peer. Falls back to a shared `unknown`
 * key when connection info is unavailable (e.g. `app.request()` in tests) — fine
 * because limiting is disabled by default there.
 */
function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
