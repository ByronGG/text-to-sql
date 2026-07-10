import { describe, expect, it } from "vitest";
import type { LlmResponse, SqlRequest } from "@/lib/llm-schema";
import { cacheKey, getCached, isCacheable, setCached } from "@/lib/sql-cache";

const tables: SqlRequest["tables"] = [
  {
    tableName: "ventas",
    rowCount: 41,
    columns: [{ name: "monto", type: "BIGINT" }],
    sampleRows: [{ monto: 1 }],
  },
];

const request = (over: Partial<SqlRequest> = {}): SqlRequest => ({
  question: "¿Cuánto se vendió?",
  tables,
  ...over,
});

const answer = (sql: string): LlmResponse => ({
  tipo: "sql",
  consulta: sql,
  interpretacion: "…",
});

describe("isCacheable", () => {
  it("caches a first-turn request", () => {
    expect(isCacheable(request())).toBe(true);
    expect(isCacheable(request({ history: [] }))).toBe(true);
  });

  it("does not cache follow-ups, whose prompt depends on history", () => {
    expect(isCacheable(request({ history: [{ role: "user", content: "hola" }] }))).toBe(false);
  });

  it("does not cache auto-correction retries", () => {
    expect(isCacheable(request({ failedSql: { sql: "SELECT", error: "boom" } }))).toBe(false);
  });
});

describe("cacheKey", () => {
  it("is stable for the same inputs", () => {
    expect(cacheKey(request())).toBe(cacheKey(request()));
  });

  it("ignores case and surrounding/collapsed whitespace in the question", () => {
    const a = cacheKey(request({ question: "¿Cuánto se vendió?" }));
    const b = cacheKey(request({ question: "  ¿CUÁNTO   SE VENDIÓ?  " }));
    expect(a).toBe(b);
  });

  it("changes when the question changes", () => {
    expect(cacheKey(request({ question: "otra cosa" }))).not.toBe(cacheKey(request()));
  });

  it("changes when the schema changes — different datasets must not share answers", () => {
    const other = cacheKey(
      request({ tables: [{ ...tables[0], rowCount: 99 }] }),
    );
    expect(other).not.toBe(cacheKey(request()));
  });
});

describe("cache storage", () => {
  it("returns undefined on a miss and the value on a hit", () => {
    const key = `miss-${Math.random()}`;
    expect(getCached(key)).toBeUndefined();
    setCached(key, answer("SELECT 1"));
    expect(getCached(key)).toEqual(answer("SELECT 1"));
  });

  // Inserting 600 entries into a 500-cap cache leaves exactly the last 500,
  // regardless of whatever the earlier tests left behind (any older entries are
  // evicted first, being the oldest). That makes these assertions independent
  // of test order despite the cache being module-level state.
  it("caps the cache, evicting oldest-first", () => {
    const p = `lru-${Math.random()}-`;
    for (let i = 0; i < 600; i++) setCached(`${p}${i}`, answer(`SELECT ${i}`));

    expect(getCached(`${p}99`)).toBeUndefined(); // evicted
    expect(getCached(`${p}599`)).toBeDefined(); // newest, kept
  });

  it("treats a read as a use, sparing the entry from eviction", () => {
    const p = `mru-${Math.random()}-`;
    for (let i = 0; i < 600; i++) setCached(`${p}${i}`, answer(`SELECT ${i}`));

    // Cache now holds p100..p599. Touch the oldest survivor…
    expect(getCached(`${p}100`)).toBeDefined();
    // …then push one more in, forcing exactly one eviction.
    setCached(`${p}new`, answer("SELECT new"));

    expect(getCached(`${p}100`)).toBeDefined(); // survived: it was just read
    expect(getCached(`${p}101`)).toBeUndefined(); // evicted: now the oldest
  });
});
