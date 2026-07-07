import type { QueryResult } from "@/lib/run-query";

export type ChartSpec =
  | { kind: "none" }
  | { kind: "metric"; metrics: { label: string; value: number }[] }
  | { kind: "line"; xKey: string; yKey: string }
  | { kind: "bar"; xKey: string; yKey: string };

type ColumnRole = "numeric" | "temporal" | "categorical" | "empty";

// Bars stop being readable past this many categories; beyond it we fall back
// to the table rather than draw an unusable chart.
const MAX_BAR_CATEGORIES = 25;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

// Classifies by the actual serialized values, not the SQL/Arrow type name:
// run-query already turns numbers into `number` and DATE/TIMESTAMP into ISO
// strings, so value inspection is both simpler and more reliable than parsing
// Arrow's type strings.
function classifyColumn(result: QueryResult, name: string): ColumnRole {
  const values = result.rows
    .map((row) => row[name])
    .filter((v) => v !== null && v !== undefined && v !== "");

  if (values.length === 0) return "empty";
  if (values.every((v) => typeof v === "number" && Number.isFinite(v))) return "numeric";
  if (values.every((v) => typeof v === "string" && ISO_DATE.test(v))) return "temporal";
  return "categorical";
}

/**
 * Picks the single most appropriate chart for a result, or "none" (table only).
 * Deliberately conservative and rule-based so the choice is predictable:
 *   - one row of pure numbers        → metric cards
 *   - one temporal + a numeric col   → line
 *   - one categorical + a numeric col → bar (few enough categories)
 *   - anything else                  → none
 */
export function deriveChartSpec(result: QueryResult): ChartSpec {
  const roles = new Map(result.columns.map((c) => [c.name, classifyColumn(result, c.name)]));
  const numeric = result.columns.filter((c) => roles.get(c.name) === "numeric");
  const temporal = result.columns.filter((c) => roles.get(c.name) === "temporal");
  const categorical = result.columns.filter((c) => roles.get(c.name) === "categorical");

  if (numeric.length === 0) return { kind: "none" };

  // A single row of only-numeric columns reads best as metric cards.
  if (result.rows.length === 1 && numeric.length === result.columns.length) {
    return {
      kind: "metric",
      metrics: numeric.map((c) => ({
        label: c.name,
        value: Number(result.rows[0][c.name]),
      })),
    };
  }

  if (result.rows.length < 2) return { kind: "none" };

  if (temporal.length === 1) {
    return { kind: "line", xKey: temporal[0].name, yKey: numeric[0].name };
  }

  if (categorical.length >= 1 && result.rows.length <= MAX_BAR_CATEGORIES) {
    return { kind: "bar", xKey: categorical[0].name, yKey: numeric[0].name };
  }

  return { kind: "none" };
}
