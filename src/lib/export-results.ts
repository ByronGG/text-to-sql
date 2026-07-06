import * as XLSX from "xlsx";
import type { QueryResult } from "@/lib/run-query";

/** Exports a query result to XLSX or CSV, downloaded directly in the browser. */
export function exportQueryResult(
  result: QueryResult,
  format: "xlsx" | "csv",
  fileNameBase = "resultados",
) {
  const header = result.columns.map((column) => column.name);
  const worksheet = XLSX.utils.json_to_sheet(result.rows, { header });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");
  XLSX.writeFile(workbook, `${fileNameBase}.${format}`, { bookType: format });
}
