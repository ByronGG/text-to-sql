import { createHash } from "node:crypto";
import { createCache } from "@/lib/kv-cache";
import type { LlmResponse, SqlRequest } from "@/lib/llm-schema";

// Cache of LLM responses, keyed by the exact prompt inputs. Since the model runs
// at temperature 0, the same (question + schema + lang) is deterministic, so a
// cache hit returns the same SQL without spending a Groq call. Biggest win:
// shared sample links, where many users ask the same question over the identical
// bundled dataset.
//
// Backed by Upstash Redis when configured (shared + durable), otherwise a
// per-instance in-memory LRU — see `kv-cache.ts`.

const MAX_ENTRIES = 500;
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 1 day
const cache = createCache<LlmResponse>("sql", { maxEntries: MAX_ENTRIES, ttlSeconds: CACHE_TTL_SECONDS });

function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Only first-turn requests are cacheable: follow-ups depend on conversation
 * history and auto-correction retries carry a failed SQL, so both produce
 * prompts that (question + schema) alone don't capture.
 */
export function isCacheable(request: SqlRequest): boolean {
  return !request.failedSql && (request.history?.length ?? 0) === 0;
}

/** Stable key over everything that shapes the prompt for a first-turn request. */
export function cacheKey(request: SqlRequest): string {
  const basis = JSON.stringify({
    q: normalizeQuestion(request.question),
    tables: request.tables,
    lang: request.lang ?? "es",
  });
  return createHash("sha256").update(basis).digest("hex");
}

export function getCached(key: string): Promise<LlmResponse | undefined> {
  return cache.get(key);
}

export function setCached(key: string, value: LlmResponse): Promise<void> {
  return cache.set(key, value);
}
