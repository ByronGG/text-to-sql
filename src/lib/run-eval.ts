import { askQuestion } from "@/lib/ask-question";
import type { TableSchema } from "@/lib/csv-table";
import type { EvalCase } from "@/lib/eval-cases";
import { matchResult } from "@/lib/eval-compare";
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido.";
}

/**
 * Runs one eval case end-to-end through the real pipeline (ask the model →
 * validate + execute the SQL) and scores it against `tables` (one table for the
 * single-table battery, several for the multi-table/JOIN battery). Single
 * attempt, no auto-correction retry — this measures single-shot generation
 * accuracy and keeps the run to exactly one API request per case.
 */
export async function runEvalCase(
  evalCase: EvalCase,
  tables: TableSchema[],
): Promise<CaseOutcome> {
  let response;
  try {
    response = await askQuestion({ question: evalCase.question, tables });
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
    result = await runQuery(sql, tables.map((t) => t.tableName));
  } catch (err) {
    return { status: "error", detail: `El SQL no se pudo ejecutar: ${errorMessage(err)}`, sql };
  }

  const { passed, detail } = matchResult(evalCase.expected, result);
  return { status: passed ? "pass" : "fail", detail, sql };
}
