import { createHash } from "node:crypto";
import type { LlmResponse, SqlRequest } from "@/lib/llm-schema";

// In-memory cache of LLM responses, keyed by the exact prompt inputs. Since the
// model runs at temperature 0, the same (question + schema) is deterministic, so
// a cache hit returns the same SQL without spending a Groq call. Biggest win:
// shared sample links, where many users ask the same question over the identical
// bundled dataset.
//
// Per-instance and in-memory: resets on cold start and isn't shared across
// serverless instances. Fine for a portfolio demo; a real deployment would back
// it with a shared store (e.g. Upstash Redis), same as the rate limiter.

const MAX_ENTRIES = 500;
const cache = new Map<string, LlmResponse>();

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

export function getCached(key: string): LlmResponse | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  // Move to most-recently-used position.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function setCached(key: string, value: LlmResponse): void {
  cache.set(key, value);
  if (cache.size > MAX_ENTRIES) {
    // Evict the least-recently-used entry (Map preserves insertion order).
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}
