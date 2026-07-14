import { getRedis } from "@/lib/redis";

// A tiny async key-value cache with two backends chosen at call time:
//   - Upstash Redis when configured (shared across instances, survives cold
//     starts). Entries carry a TTL so the store can't grow unbounded.
//   - A per-instance in-memory LRU otherwise — the original behaviour, kept as a
//     zero-config fallback so nothing breaks without Redis.
// Values must be JSON-serializable (Upstash stores/returns them as JSON).

export interface Cache<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
}

export function createCache<T>(
  namespace: string,
  opts: { maxEntries: number; ttlSeconds: number },
): Cache<T> {
  // In-memory fallback: a Map is insertion-ordered, so the first key is the
  // least-recently-used once we move touched entries to the end.
  const mem = new Map<string, T>();
  const redisKey = (key: string) => `${namespace}:${key}`;

  return {
    async get(key: string): Promise<T | undefined> {
      const redis = getRedis();
      if (redis) {
        const value = await redis.get<T>(redisKey(key));
        return value ?? undefined;
      }
      const hit = mem.get(key);
      if (hit === undefined) return undefined;
      // Mark as most-recently-used.
      mem.delete(key);
      mem.set(key, hit);
      return hit;
    },

    async set(key: string, value: T): Promise<void> {
      const redis = getRedis();
      if (redis) {
        await redis.set(redisKey(key), value, { ex: opts.ttlSeconds });
        return;
      }
      mem.set(key, value);
      if (mem.size > opts.maxEntries) {
        // Evict the least-recently-used entry (oldest insertion order).
        const oldest = mem.keys().next().value;
        if (oldest !== undefined) mem.delete(oldest);
      }
    },
  };
}
