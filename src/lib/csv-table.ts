import { getDuckDB } from "@/lib/duckdb";
import { deriveTableName } from "@/lib/table-name";

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

export const SAMPLE_CSV_URL = "/sample-data/ventas.csv";
export const SAMPLE_CSV_NAME = "ventas-ejemplo.csv";
// The sample loads as a named table (not a generic "datos") so it reads well
// next to a user's own tables in the multi-table UI.
const SAMPLE_TABLE_NAME = "ventas";

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

// The virtual filename DuckDB reads from is derived from the (already
// sanitized) table name, never the user's real filename.
const virtualFileFor = (tableName: string) => `${tableName}.csv`;

async function extractSchema(
  conn: Awaited<ReturnType<Awaited<ReturnType<typeof getDuckDB>>["connect"]>>,
  tableName: string,
): Promise<TableSchema> {
  const describeResult = await conn.query(`DESCRIBE "${tableName}"`);
  const columns: ColumnSchema[] = describeResult.toArray().map((row) => ({
    name: row.column_name as string,
    type: row.column_type as string,
  }));

  const countResult = await conn.query(`SELECT COUNT(*)::BIGINT AS n FROM "${tableName}"`);
  const rowCount = Number(countResult.toArray()[0].toJSON().n);

  const sampleResult = await conn.query(`SELECT * FROM "${tableName}" LIMIT ${SAMPLE_ROW_COUNT}`);
  const sampleRows = sampleResult.toArray().map((row) => serializeRow(row.toJSON(), columns));

  const columnsWithCategories = await Promise.all(
    columns.map(async (column) => {
      if (!column.type.includes("VARCHAR")) return column;

      const distinctResult = await conn.query(
        `SELECT DISTINCT "${column.name}" AS v FROM "${tableName}" ` +
          `WHERE "${column.name}" IS NOT NULL LIMIT ${CATEGORICAL_MAX_DISTINCT + 1}`,
      );
      const values = distinctResult.toArray().map((row) => String(row.toJSON().v));
      if (values.length > CATEGORICAL_MAX_DISTINCT) return column;

      return { ...column, categoricalValues: values };
    }),
  );

  return { tableName, rowCount, columns: columnsWithCategories, sampleRows };
}

/**
 * Registers a CSV file in DuckDB-WASM under a named table and extracts the
 * schema + context an LLM needs. Only touches its own table (drops+replaces a
 * table of the same name), leaving any other loaded tables intact so several
 * files can coexist for cross-table joins.
 */
export async function loadCsvAsTable(file: File, tableName: string): Promise<TableSchema> {
  const db = await getDuckDB();
  const virtualName = virtualFileFor(tableName);

  await db.dropFile(virtualName).catch(() => {});
  const buffer = new Uint8Array(await file.arrayBuffer());
  await db.registerFileBuffer(virtualName, buffer);

  const conn = await db.connect();
  try {
    await conn.query(`DROP TABLE IF EXISTS "${tableName}"`);
    await conn.query(
      `CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${virtualName}')`,
    );
    return await extractSchema(conn, tableName);
  } finally {
    await conn.close();
  }
}

/** Drops a loaded table and unregisters its backing file buffer. */
export async function dropTable(tableName: string): Promise<void> {
  const db = await getDuckDB();
  const conn = await db.connect();
  try {
    await conn.query(`DROP TABLE IF EXISTS "${tableName}"`);
  } finally {
    await conn.close();
  }
  await db.dropFile(virtualFileFor(tableName)).catch(() => {});
}

/** Fetches the bundled sample CSV and loads it as a (uniquely named) table. */
export async function loadSampleTable(
  existing: string[] = [],
): Promise<{ schema: TableSchema; fileName: string; file: File }> {
  const tableName = deriveTableName(SAMPLE_TABLE_NAME, existing);
  const response = await fetch(SAMPLE_CSV_URL);
  const blob = await response.blob();
  const file = new File([blob], SAMPLE_CSV_NAME, { type: "text/csv" });
  const schema = await loadCsvAsTable(file, tableName);
  return { schema, fileName: SAMPLE_CSV_NAME, file };
}

// Bundled relational sample (a hardware-store warehouse) used by the
// multi-table eval battery. Loaded into fixed table names so the eval cases can
// reference them; each load drops+replaces its own table, leaving others alone.
export const FERRETERIA_TABLE_NAMES = ["proveedores", "clientes", "productos", "ventas"] as const;

/** Loads the 4 ferretería tables (fixed names) for cross-table JOIN queries. */
export async function loadFerreteriaSample(): Promise<TableSchema[]> {
  const schemas: TableSchema[] = [];
  for (const name of FERRETERIA_TABLE_NAMES) {
    const response = await fetch(`/sample-data/ferreteria/${name}.csv`);
    const blob = await response.blob();
    const file = new File([blob], `${name}.csv`, { type: "text/csv" });
    schemas.push(await loadCsvAsTable(file, name));
  }
  return schemas;
}
