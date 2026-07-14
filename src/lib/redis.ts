import { Redis } from "@upstash/redis";

// Optional shared store for the rate limiter and the LLM caches. When
// UPSTASH_REDIS_REST_URL/TOKEN are set (e.g. on Vercel) everything is backed by
// Upstash Redis, so limits and cache hits survive cold starts and are shared
// across serverless instances. When they're absent (local dev, or a deploy
// without the vars) callers fall back to their per-instance in-memory paths —
// the app behaves exactly as before, just not shared.
//
// The client is memoized: `undefined` means "not yet resolved", `null` means
// "resolved to no-Redis" (so we don't re-read env on every call).
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    client = url && token ? new Redis({ url, token }) : null;
  }
  return client;
}
