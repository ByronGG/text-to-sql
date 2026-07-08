import { askQuestion } from "@/lib/ask-question";
import type { TableSchema } from "@/lib/csv-table";
import type { EvalCase, Expectation, RowSpec } from "@/lib/eval-cases";
import { runQuery, type QueryResult } from "@/lib/run-query";

export type CaseStatus = "pass" | "fail" | "error";

export interface CaseOutcome {
  status: CaseStatus;
  /** Human-readable reason for the status. */
  detail: string;
  /** The SQL the model produced, when it produced any. */
  sql?: string;
  /** The clarifying question, when the model asked one. */
  clarification?: string;
}

// Numbers are rounded so aggregate doubles (e.g. AVG) compare cleanly, and
// strings are trimmed/lower-cased so casing differences don't cause misses.
function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Math.round(value * 100) / 100;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.trim().toLowerCase();
  return value;
}

function scalarsMatch(expected: unknown, actual: unknown): boolean {
  const e = normalize(expected);
  const a = normalize(actual);
  if (typeof e === "number" && typeof a === "number") return Math.abs(e - a) < 0.01;
  return e === a;
}

// A result row matches an expected spec when every expected value appears
// somewhere in the row — ignoring column names and order, so the model is free
// to alias columns or add descriptive ones (e.g. selecting the client name
// alongside the total we asked about).
function rowMatches(spec: RowSpec, row: Record<string, unknown>): boolean {
  const actualValues = Object.values(row);
  return Object.values(spec).every((expectedValue) =>
    actualValues.some((actualValue) => scalarsMatch(expectedValue, actualValue)),
  );
}

function matchExact(specs: RowSpec[], rows: Record<string, unknown>[]): boolean {
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

function matchPrefix(specs: RowSpec[], rows: Record<string, unknown>[]): boolean {
  if (rows.length < specs.length) return false;
  return specs.every((spec, i) => rowMatches(spec, rows[i]));
}

function matchResult(
  expected: Extract<Expectation, { kind: "result" }>,
  result: QueryResult,
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido.";
}

/**
 * Runs one eval case end-to-end through the real pipeline (ask the model →
 * validate + execute the SQL) and scores it. Single attempt, no
 * auto-correction retry — this measures single-shot generation accuracy and
 * keeps the run to exactly one API request per case (mindful of the rate limit).
 */
export async function runEvalCase(evalCase: EvalCase, schema: TableSchema): Promise<CaseOutcome> {
  let response;
  try {
    response = await askQuestion({ question: evalCase.question, schema });
  } catch (err) {
    return { status: "error", detail: `La API falló: ${errorMessage(err)}` };
  }

  if (response.tipo === "aclaracion") {
    const clarification = response.pregunta_al_usuario;
    if (evalCase.expected.kind === "clarification") {
      return { status: "pass", detail: "Pidió aclaración, como se esperaba.", clarification };
    }
    return {
      status: "fail",
      detail: "Pidió aclaración en lugar de responder.",
      clarification,
    };
  }

  // response.tipo === "sql"
  const sql = response.consulta;
  if (evalCase.expected.kind === "clarification") {
    return { status: "fail", detail: "Generó SQL en lugar de pedir aclaración.", sql };
  }

  let result: QueryResult;
  try {
    result = await runQuery(sql);
  } catch (err) {
    return { status: "error", detail: `El SQL no se pudo ejecutar: ${errorMessage(err)}`, sql };
  }

  const { passed, detail } = matchResult(evalCase.expected, result);
  return { status: passed ? "pass" : "fail", detail, sql };
}
