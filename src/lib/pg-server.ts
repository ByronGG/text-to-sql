import "server-only";
import { Client, type ClientConfig, type FieldDef } from "pg";
import type { ColumnSchema, TableSchema } from "@/lib/csv-table";
import type { QueryColumn, QueryResult } from "@/lib/run-query";
import { validateSelectOnly } from "@/lib/sql-guard";

// Server-side Postgres mode: unlike the DuckDB path, the query runs against a
// real database the user points us at. The security boundary is layered:
//   1. SELECT-only guard + table allowlist (validateSelectOnly), same as DuckDB.
//   2. Every query runs inside a READ ONLY transaction — the DB itself rejects
//      any write/DDL that slips past the regex guard.
//   3. statement_timeout caps runaway/`pg_sleep`-style queries.
//   4. A hard LIMIT wraps the result.
// We also recommend (in the UI) pointing us at a read-only DB user.

const CONNECT_TIMEOUT_MS = 8000;
const STATEMENT_TIMEOUT_MS = 10_000;
const MAX_ROWS = 1000;
const SAMPLE_ROW_COUNT = 5;
const CATEGORICAL_MAX_DISTINCT = 20;
const MAX_TABLES = 25;

// pg type OIDs we special-case. int8/numeric arrive as strings (to avoid
// precision loss); we coerce them to numbers so downstream charts/formatting
// treat them as numeric, accepting the precision tradeoff for a demo.
const NUMERIC_OIDS = new Set([20, 21, 23, 700, 701, 1700]);
const DATE_OID = 1082;
const TYPE_NAME: Record<number, string> = {
  16: "BOOLEAN", 20: "BIGINT", 21: "SMALLINT", 23: "INTEGER", 25: "TEXT",
  700: "REAL", 701: "DOUBLE", 1042: "CHAR", 1043: "VARCHAR", 1082: "DATE",
  1114: "TIMESTAMP", 1184: "TIMESTAMPTZ", 1700: "NUMERIC", 114: "JSON",
  3802: "JSONB", 2950: "UUID",
};

/** Double-quotes a SQL identifier from the catalog (escaping embedded quotes). */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function makeClient(connectionString: string): Client {
  const config: ClientConfig = {
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: STATEMENT_TIMEOUT_MS,
  };
  // Managed Postgres (Supabase/Neon/RDS) generally needs TLS. If the connection
  // string asks for SSL, enable it. rejectUnauthorized:false trades cert
  // verification for broad compatibility — acceptable for a user-driven demo.
  if (/\bsslmode=(require|verify-ca|verify-full|prefer)\b/i.test(connectionString) || /\bssl=true\b/i.test(connectionString)) {
    config.ssl = { rejectUnauthorized: false };
  }
  return new Client(config);
}

function serializeCell(value: unknown, oid: number): unknown {
  if (value == null) return value;
  if (value instanceof Date) {
    const iso = value.toISOString();
    return oid === DATE_OID ? iso.slice(0, 10) : iso;
  }
  if (typeof value === "string" && NUMERIC_OIDS.has(oid)) {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object") return JSON.stringify(value); // json/arrays → text
  return value;
}

function serializeRow(
  row: Record<string, unknown>,
  fields: FieldDef[],
): Record<string, unknown> {
  const oidByName = new Map(fields.map((f) => [f.name, f.dataTypeID]));
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, serializeCell(v, oidByName.get(k) ?? 0)]),
  );
}

function typeLabel(dataType: string): string {
  const map: Record<string, string> = {
    "character varying": "VARCHAR",
    "timestamp without time zone": "TIMESTAMP",
    "timestamp with time zone": "TIMESTAMPTZ",
    "double precision": "DOUBLE",
  };
  return (map[dataType] ?? dataType).toUpperCase();
}

/**
 * Connects, introspects the `public` schema, and returns the same `TableSchema`
 * shape the CSV path produces — so the prompt/guard/UI all work unchanged.
 * Restricted to `public` (bare table names) to keep table names consistent
 * between the prompt, the guard allowlist, and execution.
 */
export async function introspectSchema(connectionString: string): Promise<TableSchema[]> {
  const client = makeClient(connectionString);
  await client.connect();
  try {
    const tablesRes = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type IN ('BASE TABLE', 'VIEW')
       ORDER BY table_name LIMIT ${MAX_TABLES}`,
    );

    const out: TableSchema[] = [];
    for (const { table_name: name } of tablesRes.rows) {
      const q = `"public".${quoteIdent(name)}`;

      const colsRes = await client.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [name],
      );

      const countRes = await client.query<{ n: string }>(`SELECT COUNT(*)::bigint AS n FROM ${q}`);
      const rowCount = Number(countRes.rows[0]?.n ?? 0);

      const sampleRes = await client.query(`SELECT * FROM ${q} LIMIT ${SAMPLE_ROW_COUNT}`);
      const sampleRows = sampleRes.rows.map((r) => serializeRow(r, sampleRes.fields));

      const columns: ColumnSchema[] = await Promise.all(
        colsRes.rows.map(async (c) => {
          const base: ColumnSchema = { name: c.column_name, type: typeLabel(c.data_type) };
          if (!/char|text/i.test(c.data_type)) return base;

          const distinctRes = await client.query<{ v: unknown }>(
            `SELECT DISTINCT ${quoteIdent(c.column_name)} AS v FROM ${q}
             WHERE ${quoteIdent(c.column_name)} IS NOT NULL LIMIT ${CATEGORICAL_MAX_DISTINCT + 1}`,
          );
          const values = distinctRes.rows.map((r) => String(r.v));
          return values.length > CATEGORICAL_MAX_DISTINCT ? base : { ...base, categoricalValues: values };
        }),
      );

      out.push({ tableName: name, rowCount, columns, sampleRows });
    }
    return out;
  } finally {
    await client.end();
  }
}

/**
 * Validates and runs a read-only query against the connected database, enforcing
 * the SELECT-only guard, a READ ONLY transaction, a row cap, and a timeout.
 */
export async function runPgQuery(
  connectionString: string,
  sql: string,
  allowedTables?: string[],
): Promise<QueryResult> {
  const validated = validateSelectOnly(sql, allowedTables);
  const limited = `SELECT * FROM (${validated}) AS _q LIMIT ${MAX_ROWS + 1}`;

  const client = makeClient(connectionString);
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const res = await client.query(limited);
    await client.query("ROLLBACK");

    const columns: QueryColumn[] = res.fields.map((f) => ({
      name: f.name,
      type: TYPE_NAME[f.dataTypeID] ?? "TEXT",
    }));
    const allRows = res.rows.map((r) => serializeRow(r, res.fields));
    const truncated = allRows.length > MAX_ROWS;

    return {
      columns,
      rows: truncated ? allRows.slice(0, MAX_ROWS) : allRows,
      rowCount: truncated ? MAX_ROWS : allRows.length,
      truncated,
    };
  } finally {
    await client.end();
  }
}

/** Maps low-level connection/query failures to a friendly Spanish message. */
export function friendlyPgError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|timeout|ETIMEDOUT/i.test(msg)) {
    return "No se pudo conectar a la base de datos. Revisa host, puerto y que sea accesible.";
  }
  if (/password|authentication|role .* does not exist|no pg_hba/i.test(msg)) {
    return "Autenticación fallida. Revisa usuario y contraseña.";
  }
  if (/database .* does not exist/i.test(msg)) {
    return "La base de datos indicada no existe.";
  }
  if (/self.signed|certificate|SSL|TLS/i.test(msg)) {
    return "Error de SSL/TLS. Prueba agregando ?sslmode=require a la cadena de conexión.";
  }
  return "Error al consultar la base de datos.";
}
