import { DataType } from "apache-arrow";
import { getDuckDB } from "@/lib/duckdb";
import { validateSelectOnly } from "@/lib/sql-guard";

export interface QueryColumn {
  name: string;
  type: string;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

const MAX_ROWS = 1000;
const QUERY_TIMEOUT_MS = 10_000;

// Same DATE/TIMESTAMP-as-epoch-ms quirk as csv-table.ts, but keyed off the
// Arrow field type instead of a DESCRIBE string, since query results can
// have computed columns (aggregates, aliases) not present in the source table.
function formatCell(value: unknown, type: DataType): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && (DataType.isDate(type) || DataType.isTimestamp(type))) {
    const iso = new Date(value).toISOString();
    return DataType.isTimestamp(type) ? iso : iso.slice(0, 10);
  }
  // Aggregates over integers (e.g. SUM of BIGINT) come back as Arrow Decimals,
  // whose values are DecimalBigNum objects, not JS numbers. Their toString()
  // is scale-aware, so parse through it to get a number that matches what the
  // table shows — and that downstream chart/type logic can treat as numeric.
  if (value != null && DataType.isDecimal(type)) return Number(String(value));
  return value;
}

/**
 * Validates and executes a SQL query against the loaded table, enforcing a
 * row limit and a timeout.
 *
 * Note on the timeout: DuckDB-WASM's `query()` can't be cancelled mid-flight,
 * so this only stops *waiting* for a runaway query — the engine keeps working
 * in its worker after the promise rejects. Acceptable for a single-user,
 * browser-local demo; would need `send()` + `cancelSent()` for a real cancel.
 */
export async function runQuery(sql: string, allowedTables?: string[]): Promise<QueryResult> {
  const validated = validateSelectOnly(sql, allowedTables);
  const limited = `SELECT * FROM (${validated}) AS _q LIMIT ${MAX_ROWS + 1}`;

  const db = await getDuckDB();
  const conn = await db.connect();
  try {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`La consulta tardó más de ${QUERY_TIMEOUT_MS / 1000}s.`)),
        QUERY_TIMEOUT_MS,
      );
    });

    const table = await Promise.race([conn.query(limited), timeout]);
    const fields = table.schema.fields;

    const columns: QueryColumn[] = fields.map((field) => ({
      name: field.name,
      type: field.type.toString(),
    }));

    const allRows = table.toArray().map((row) => {
      const json = row.toJSON();
      return Object.fromEntries(
        fields.map((field) => [field.name, formatCell(json[field.name], field.type)]),
      );
    });

    const truncated = allRows.length > MAX_ROWS;
    return {
      columns,
      rows: truncated ? allRows.slice(0, MAX_ROWS) : allRows,
      rowCount: truncated ? MAX_ROWS : allRows.length,
      truncated,
    };
  } finally {
    await conn.close();
  }
}
