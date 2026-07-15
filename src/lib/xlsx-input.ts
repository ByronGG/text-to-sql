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

/** Serializes one sheet to CSV text (blank rows dropped); empty when the sheet has no data. */
export function sheetToCsv(workbook: XLSX.WorkBook, sheetName: string): string {
  return XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { blankrows: false });
}

/** Wraps `sheetToCsv` in a CSV File that can be fed to `loadCsvAsTable`. */
export function sheetToCsvFile(
  workbook: XLSX.WorkBook,
  sheetName: string,
  baseName: string,
): File {
  return new File([sheetToCsv(workbook, sheetName)], `${baseName}.csv`, { type: "text/csv" });
}
