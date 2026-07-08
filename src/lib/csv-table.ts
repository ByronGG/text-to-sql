import { getDuckDB } from "@/lib/duckdb";

export interface ColumnSchema {
  name: string;
  type: string;
  /** Distinct values, only populated for low-cardinality text columns. */
  categoricalValues?: string[];
}

export interface TableSchema {
  tableName: string;
  rowCount: number;
  columns: ColumnSchema[];
  sampleRows: Record<string, unknown>[];
}

export const TABLE_NAME = "datos";

export const SAMPLE_CSV_URL = "/sample-data/ventas.csv";
export const SAMPLE_CSV_NAME = "ventas-ejemplo.csv";

// Fixed virtual filename: avoids ever interpolating the user's real
// filename (which could contain quotes/special chars) into SQL.
const VIRTUAL_FILE_NAME = "upload.csv";
const SAMPLE_ROW_COUNT = 5;
const CATEGORICAL_MAX_DISTINCT = 20;

// DuckDB-WASM (via Arrow) surfaces DATE/TIMESTAMP columns as raw epoch-ms
// numbers rather than JS Date instances, so formatting must key off the
// column's SQL type rather than the runtime type of the value.
function serializeValue(value: unknown, columnType: string): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && columnType.includes("DATE")) {
    const iso = new Date(value).toISOString();
    return columnType.includes("TIMESTAMP") ? iso : iso.slice(0, 10);
  }
  return value;
}

function serializeRow(
  row: Record<string, unknown>,
  columns: ColumnSchema[],
): Record<string, unknown> {
  const typeByColumn = new Map(columns.map((c) => [c.name, c.type]));
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      serializeValue(value, typeByColumn.get(key) ?? ""),
    ]),
  );
}

/** Registers a CSV file in DuckDB-WASM and extracts the schema + context an LLM needs. */
export async function loadCsvAsTable(file: File): Promise<TableSchema> {
  const db = await getDuckDB();

  await db.dropFile(VIRTUAL_FILE_NAME).catch(() => {});
  const buffer = new Uint8Array(await file.arrayBuffer());
  await db.registerFileBuffer(VIRTUAL_FILE_NAME, buffer);

  const conn = await db.connect();
  try {
    await conn.query(`DROP TABLE IF EXISTS ${TABLE_NAME}`);
    await conn.query(
      `CREATE TABLE ${TABLE_NAME} AS SELECT * FROM read_csv_auto('${VIRTUAL_FILE_NAME}')`,
    );

    const describeResult = await conn.query(`DESCRIBE ${TABLE_NAME}`);
    const columns: ColumnSchema[] = describeResult.toArray().map((row) => ({
      name: row.column_name as string,
      type: row.column_type as string,
    }));

    const countResult = await conn.query(
      `SELECT COUNT(*)::BIGINT AS n FROM ${TABLE_NAME}`,
    );
    const rowCount = Number(countResult.toArray()[0].toJSON().n);

    const sampleResult = await conn.query(
      `SELECT * FROM ${TABLE_NAME} LIMIT ${SAMPLE_ROW_COUNT}`,
    );
    const sampleRows = sampleResult
      .toArray()
      .map((row) => serializeRow(row.toJSON(), columns));

    const columnsWithCategories = await Promise.all(
      columns.map(async (column) => {
        if (!column.type.includes("VARCHAR")) return column;

        const distinctResult = await conn.query(
          `SELECT DISTINCT "${column.name}" AS v FROM ${TABLE_NAME} ` +
            `WHERE "${column.name}" IS NOT NULL LIMIT ${CATEGORICAL_MAX_DISTINCT + 1}`,
        );
        const values = distinctResult.toArray().map((row) => String(row.toJSON().v));
        if (values.length > CATEGORICAL_MAX_DISTINCT) return column;

        return { ...column, categoricalValues: values };
      }),
    );

    return {
      tableName: TABLE_NAME,
      rowCount,
      columns: columnsWithCategories,
      sampleRows,
    };
  } finally {
    await conn.close();
  }
}

/** Fetches the bundled sample CSV and loads it as the table. */
export async function loadSampleTable(): Promise<{ schema: TableSchema; fileName: string }> {
  const response = await fetch(SAMPLE_CSV_URL);
  const blob = await response.blob();
  const file = new File([blob], SAMPLE_CSV_NAME, { type: "text/csv" });
  const schema = await loadCsvAsTable(file);
  return { schema, fileName: SAMPLE_CSV_NAME };
}
