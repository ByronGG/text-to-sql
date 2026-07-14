import { getRedis } from "@/lib/redis";

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const WINDOW_SECONDS = WINDOW_MS / 1000;
const MAX_REQUESTS = 20;

// Per-instance in-memory store: resets on cold start and isn't shared across
// serverless instances/regions. Used only when Upstash Redis isn't configured;
// when it is, the counter lives in Redis so the limit is shared and durable.
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// Fixed-window counter (20 requests / 10 min). Redis-backed when configured
// (INCR + EXPIRE), otherwise the in-memory bucket below. Async either way so
// callers have one signature regardless of backend.
export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  const now = Date.now();
  const redis = getRedis();

  if (redis) {
    const redisKey = `ratelimit:${key}`;
    const count = await redis.incr(redisKey);
    // Set the window TTL only on the first hit of a new window.
    if (count === 1) await redis.expire(redisKey, WINDOW_SECONDS);

    if (count > MAX_REQUESTS) {
      const ttl = await redis.ttl(redisKey); // seconds; <=0 if missing/no-expiry
      return { allowed: false, remaining: 0, resetAt: now + (ttl > 0 ? ttl * 1000 : WINDOW_MS) };
    }
    return { allowed: true, remaining: MAX_REQUESTS - count, resetAt: now + WINDOW_MS };
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt: now + WINDOW_MS };
  }

  if (bucket.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS - bucket.count, resetAt: bucket.resetAt };
}
