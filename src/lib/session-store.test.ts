import { describe, expect, it } from "vitest";
import {
  decodeBase64,
  encodeBase64,
  isPersistedTables,
  isPersistedTurns,
  tablesSignature,
} from "@/lib/session-store";

describe("base64 round-trip", () => {
  it("preserves arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 254, 255, 65, 66, 10, 13]);
    expect(Array.from(decodeBase64(encodeBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("preserves UTF-8 CSV content including accents", () => {
    const text = "categoría,ñandú\n10,20\n";
    const bytes = new TextEncoder().encode(text);
    const restored = new TextDecoder().decode(decodeBase64(encodeBase64(bytes)));
    expect(restored).toBe(text);
  });

  it("handles an empty buffer", () => {
    expect(encodeBase64(new Uint8Array())).toBe("");
    expect(decodeBase64("").length).toBe(0);
  });

  it("survives a larger buffer (past the chunk size)", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(Array.from(decodeBase64(encodeBase64(bytes)))).toEqual(Array.from(bytes));
  });
});

describe("tablesSignature", () => {
  it("is order-independent", () => {
    expect(tablesSignature(["ventas", "clientes"])).toBe(tablesSignature(["clientes", "ventas"]));
  });

  it("differs for a different set of tables", () => {
    expect(tablesSignature(["ventas"])).not.toBe(tablesSignature(["ventas", "clientes"]));
  });
});

describe("isPersistedTables", () => {
  it("accepts a valid array", () => {
    expect(isPersistedTables([{ tableName: "v", fileName: "v.csv", csvBase64: "AAA" }])).toBe(true);
  });

  it("rejects malformed entries", () => {
    expect(isPersistedTables([{ tableName: "v" }])).toBe(false);
    expect(isPersistedTables("nope")).toBe(false);
    expect(isPersistedTables([{ tableName: 1, fileName: "x", csvBase64: "y" }])).toBe(false);
  });
});

describe("isPersistedTurns", () => {
  it("accepts a sig + turns array", () => {
    expect(isPersistedTurns({ sig: "ventas", turns: [] })).toBe(true);
  });

  it("rejects missing sig or non-array turns", () => {
    expect(isPersistedTurns({ turns: [] })).toBe(false);
    expect(isPersistedTurns({ sig: "x", turns: "no" })).toBe(false);
    expect(isPersistedTurns(null)).toBe(false);
  });
});
