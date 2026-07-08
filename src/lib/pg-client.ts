import type { TableSchema } from "@/lib/csv-table";
import type { QueryResult } from "@/lib/run-query";

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "La solicitud falló.");
  }
  return body as T;
}

/** Introspects a Postgres database into the same TableSchema shape as CSVs. */
export async function fetchPgSchema(connectionString: string): Promise<TableSchema[]> {
  const { tables } = await postJson<{ tables: TableSchema[] }>("/api/pg/schema", {
    connectionString,
  });
  return tables;
}

/** Runs a validated read-only query against the connected Postgres database. */
export async function runPgQuery(
  connectionString: string,
  sql: string,
  allowedTables: string[],
): Promise<QueryResult> {
  return postJson<QueryResult>("/api/pg/query", { connectionString, sql, allowedTables });
}
