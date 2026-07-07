import * as XLSX from "xlsx";

// Excel files enter the same pipeline as CSVs: we parse a sheet with SheetJS,
// serialize it to CSV, and hand that to DuckDB's read_csv_auto. Keeping a
// single ingestion path means all the type-inference and schema extraction
// already built for CSVs applies to spreadsheets for free.
const EXCEL_EXTENSION = /\.(xlsx|xls|xlsm|xlsb)$/i;

export function isExcelFile(file: File): boolean {
  return EXCEL_EXTENSION.test(file.name);
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

export interface ParsedWorkbook {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
}

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  return { workbook, sheetNames: workbook.SheetNames };
}

/** Serializes one sheet to a CSV File that can be fed to `loadCsvAsTable`. */
export function sheetToCsvFile(
  workbook: XLSX.WorkBook,
  sheetName: string,
  baseName: string,
): File {
  const sheet = workbook.Sheets[sheetName];
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
  return new File([csv], `${baseName}.csv`, { type: "text/csv" });
}
