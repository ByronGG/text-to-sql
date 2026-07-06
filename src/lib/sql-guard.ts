export class SqlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlValidationError";
  }
}

// Statement-level keywords that must never appear outside of identifiers —
// matched with word boundaries so e.g. "created_at" doesn't trip "create".
const FORBIDDEN_KEYWORDS = [
  "insert", "update", "delete", "drop", "alter", "create", "truncate",
  "attach", "detach", "copy", "export", "import", "install", "load",
  "call", "grant", "revoke", "vacuum", "set", "reset", "checkpoint",
  "pragma",
];

// Function-like calls that reach outside the loaded table (filesystem,
// extension loader, system catalogs). Matched as plain substrings since
// these are function/table names, not SQL keywords.
const FORBIDDEN_CALLS = [
  "read_csv", "read_parquet", "read_json", "read_ndjson", "glob(",
  "pragma_", "duckdb_", "sqlite_scan", "httpfs",
];

/**
 * Throws if `sql` is anything other than a single read-only SELECT/CTE
 * statement. Returns the trimmed statement (no trailing semicolons) on
 * success. This is the only gate between LLM-generated SQL and execution.
 */
export function validateSelectOnly(sql: string): string {
  const statement = sql.trim().replace(/;+\s*$/, "");

  if (statement.length === 0) {
    throw new SqlValidationError("La consulta está vacía.");
  }
  if (statement.includes(";")) {
    throw new SqlValidationError("Solo se permite una consulta a la vez.");
  }
  if (!/^\s*(select|with)\b/i.test(statement)) {
    throw new SqlValidationError("Solo se permiten consultas SELECT.");
  }

  const lower = statement.toLowerCase();

  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`).test(lower)) {
      throw new SqlValidationError(
        `La consulta contiene una operación no permitida: ${keyword.toUpperCase()}.`,
      );
    }
  }
  for (const call of FORBIDDEN_CALLS) {
    if (lower.includes(call)) {
      throw new SqlValidationError(
        `La consulta usa una función no permitida: ${call.replace("(", "")}.`,
      );
    }
  }

  return statement;
}
