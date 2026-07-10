import { describe, expect, it } from "vitest";
import { matchExact, matchPrefix, matchResult, rowMatches, scalarsMatch } from "@/lib/eval-compare";

describe("scalarsMatch", () => {
  it("compares numbers with a 2dp tolerance (AVG doubles)", () => {
    expect(scalarsMatch(19478.54, 19478.5366)).toBe(true);
    expect(scalarsMatch(19478.54, 19478.6)).toBe(false);
  });

  it("compares strings case- and whitespace-insensitively", () => {
    expect(scalarsMatch("Tecno Solutions", " tecno solutions ")).toBe(true);
    expect(scalarsMatch("Tecno", "Otra")).toBe(false);
  });

  it("coerces bigints to numbers", () => {
    // BigInt(...) rather than a 41n literal: the app's tsconfig targets < ES2020.
    expect(scalarsMatch(41, BigInt(41))).toBe(true);
  });
});

describe("rowMatches", () => {
  it("ignores column names and order", () => {
    expect(rowMatches({ monto: 798620 }, { "sum(monto)": 798620 })).toBe(true);
    expect(rowMatches({ n: 15 }, { categoria: "Electronica", "count_star()": 15 })).toBe(true);
  });

  it("tolerates extra columns the model adds", () => {
    expect(rowMatches({ cliente: "Tecno Solutions" }, { cliente: "Tecno Solutions", total: 264000 })).toBe(
      true,
    );
  });

  it("requires every expected value to be present", () => {
    expect(rowMatches({ cliente: "Tecno Solutions", monto: 264000 }, { cliente: "Tecno Solutions" })).toBe(
      false,
    );
  });
});

describe("matchExact", () => {
  it("matches regardless of row order (bijection)", () => {
    const specs = [{ n: 15 }, { n: 14 }, { n: 12 }];
    const rows = [{ c: "a", v: 12 }, { c: "b", v: 15 }, { c: "d", v: 14 }];
    expect(matchExact(specs, rows)).toBe(true);
  });

  it("requires the exact row count", () => {
    expect(matchExact([{ n: 1 }], [{ v: 1 }, { v: 2 }])).toBe(false);
    expect(matchExact([{ n: 1 }, { n: 2 }], [{ v: 1 }])).toBe(false);
  });

  it("fails when a value is missing", () => {
    expect(matchExact([{ n: 15 }, { n: 99 }], [{ v: 15 }, { v: 14 }])).toBe(false);
  });

  it("does not let one row satisfy two specs", () => {
    expect(matchExact([{ n: 5 }, { n: 5 }], [{ v: 5 }, { v: 7 }])).toBe(false);
  });
});

describe("matchPrefix", () => {
  it("matches the leading rows positionally and ignores the rest", () => {
    const rows = [{ cliente: "Tecno Solutions" }, { cliente: "Grupo Aranda" }];
    expect(matchPrefix([{ cliente: "Tecno Solutions" }], rows)).toBe(true);
  });

  it("is order-sensitive", () => {
    const rows = [{ cliente: "Grupo Aranda" }, { cliente: "Tecno Solutions" }];
    expect(matchPrefix([{ cliente: "Tecno Solutions" }], rows)).toBe(false);
  });

  it("fails when there are fewer rows than expected", () => {
    expect(matchPrefix([{ a: 1 }, { a: 2 }], [{ a: 1 }])).toBe(false);
  });
});

describe("matchResult", () => {
  it("defaults to exact mode", () => {
    const out = matchResult({ kind: "result", rows: [{ monto: 10 }] }, { rows: [{ x: 10 }], rowCount: 1 });
    expect(out.passed).toBe(true);
  });

  it("honours prefix mode, allowing trailing rows", () => {
    const out = matchResult(
      { kind: "result", mode: "prefix", rows: [{ p: "Laptop" }] },
      { rows: [{ p: "Laptop" }, { p: "Cemento" }], rowCount: 2 },
    );
    expect(out.passed).toBe(true);
  });

  it("explains a failure with the expected vs actual row counts", () => {
    const out = matchResult({ kind: "result", rows: [{ monto: 10 }] }, { rows: [], rowCount: 0 });
    expect(out.passed).toBe(false);
    expect(out.detail).toMatch(/se esperaban 1 fila/i);
  });
});
