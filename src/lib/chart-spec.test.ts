import { describe, expect, it } from "vitest";
import { deriveChartSpec } from "@/lib/chart-spec";
import type { QueryResult } from "@/lib/run-query";

/** Builds a QueryResult from rows, inferring column names from the first row. */
function result(rows: Record<string, unknown>[]): QueryResult {
  const names = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    columns: names.map((name) => ({ name, type: "?" })),
    rows,
    rowCount: rows.length,
    truncated: false,
  };
}

describe("deriveChartSpec", () => {
  it("renders a single row of pure numbers as metric cards", () => {
    const spec = deriveChartSpec(result([{ total: 798620, promedio: 19478.54 }]));
    expect(spec).toEqual({
      kind: "metric",
      metrics: [
        { label: "total", value: 798620 },
        { label: "promedio", value: 19478.54 },
      ],
    });
  });

  it("draws a line for a temporal + numeric pair", () => {
    const spec = deriveChartSpec(
      result([
        { fecha: "2026-06-01", monto: 100 },
        { fecha: "2026-07-01", monto: 200 },
      ]),
    );
    expect(spec).toEqual({ kind: "line", xKey: "fecha", yKey: "monto" });
  });

  it("draws bars for a categorical + numeric pair", () => {
    const spec = deriveChartSpec(
      result([
        { categoria: "Electronica", monto: 498550 },
        { categoria: "Materiales", monto: 202050 },
      ]),
    );
    expect(spec).toEqual({ kind: "bar", xKey: "categoria", yKey: "monto" });
  });

  it("falls back to the table when there are too many bar categories", () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({ cat: `c${i}`, v: i }));
    expect(deriveChartSpec(result(rows))).toEqual({ kind: "none" });
  });

  it("returns none when there is no numeric column", () => {
    expect(deriveChartSpec(result([{ a: "x" }, { a: "y" }]))).toEqual({ kind: "none" });
  });

  it("returns none for a single row that is not all-numeric", () => {
    // One row, mixed types: neither metric cards nor a meaningful chart.
    expect(deriveChartSpec(result([{ cliente: "Tecno", monto: 10 }]))).toEqual({ kind: "none" });
  });

  it("prefers a line over bars when a temporal column is present", () => {
    const spec = deriveChartSpec(
      result([
        { fecha: "2026-06-01", categoria: "A", monto: 1 },
        { fecha: "2026-07-01", categoria: "B", monto: 2 },
      ]),
    );
    expect(spec).toEqual({ kind: "line", xKey: "fecha", yKey: "monto" });
  });

  it("ignores nulls when classifying a column", () => {
    const spec = deriveChartSpec(
      result([
        { categoria: "A", monto: 1 },
        { categoria: "B", monto: null },
        { categoria: "C", monto: 3 },
      ]),
    );
    expect(spec).toEqual({ kind: "bar", xKey: "categoria", yKey: "monto" });
  });
});
