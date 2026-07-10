import type { Expectation, RowSpec } from "@/lib/eval-cases";

// Pure result-comparison logic for the eval battery, split out from `run-eval`
// (which does I/O) so it can be unit-tested without pulling in DuckDB or fetch.
//
// The core idea is *execution accuracy*: many different SQL strings are correct,
// so we compare the rows a query produced against the values we expect — never
// the SQL text. Expected rows list only the values that must be present, so
// column names, column order, and extra columns are all tolerated.

/** Numbers round to 2dp so aggregate doubles (e.g. AVG) compare cleanly; strings are trimmed/lower-cased. */
export function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Math.round(value * 100) / 100;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.trim().toLowerCase();
  return value;
}

export function scalarsMatch(expected: unknown, actual: unknown): boolean {
  const e = normalize(expected);
  const a = normalize(actual);
  if (typeof e === "number" && typeof a === "number") return Math.abs(e - a) < 0.01;
  return e === a;
}

/**
 * A result row matches a spec when every expected value appears somewhere in the
 * row — ignoring column names and order, so the model is free to alias columns
 * or add descriptive ones (e.g. selecting the client name alongside the total).
 */
export function rowMatches(spec: RowSpec, row: Record<string, unknown>): boolean {
  const actualValues = Object.values(row);
  return Object.values(spec).every((expectedValue) =>
    actualValues.some((actualValue) => scalarsMatch(expectedValue, actualValue)),
  );
}

/** Exact match: same row count, and a bijection between specs and rows. */
export function matchExact(specs: RowSpec[], rows: Record<string, unknown>[]): boolean {
  if (rows.length !== specs.length) return false;
  const used = new Array(rows.length).fill(false);
  // Greedy bijection: fine here because expected values within a case are
  // distinct, so there's no ambiguity in which row satisfies which spec.
  for (const spec of specs) {
    const idx = rows.findIndex((row, i) => !used[i] && rowMatches(spec, row));
    if (idx === -1) return false;
    used[idx] = true;
  }
  return true;
}

/** Prefix match: the first N rows match positionally; trailing rows are ignored. */
export function matchPrefix(specs: RowSpec[], rows: Record<string, unknown>[]): boolean {
  if (rows.length < specs.length) return false;
  return specs.every((spec, i) => rowMatches(spec, rows[i]));
}

/** Scores a result against a "result"-kind expectation, with a human-readable reason. */
export function matchResult(
  expected: Extract<Expectation, { kind: "result" }>,
  result: { rows: Record<string, unknown>[]; rowCount: number },
): { passed: boolean; detail: string } {
  const mode = expected.mode ?? "exact";
  const passed =
    mode === "prefix"
      ? matchPrefix(expected.rows, result.rows)
      : matchExact(expected.rows, result.rows);

  if (passed) {
    return { passed: true, detail: `Resultado correcto (${result.rowCount} fila(s)).` };
  }
  const expectedCount = mode === "prefix" ? `≥${expected.rows.length}` : `${expected.rows.length}`;
  return {
    passed: false,
    detail: `Resultado incorrecto: se esperaban ${expectedCount} fila(s) que coincidieran, se obtuvieron ${result.rowCount}.`,
  };
}
