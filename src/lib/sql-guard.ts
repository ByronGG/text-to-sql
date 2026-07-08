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
// these are function/table names, not SQL keywords. Covers both DuckDB and
// (in Postgres mode) Postgres — the read-only transaction is the real write
// guard, but these block obviously-dangerous reads/DoS as defense in depth.
const FORBIDDEN_CALLS = [
  "read_csv", "read_parquet", "read_json", "read_ndjson", "glob(",
  "pragma_", "duckdb_", "sqlite_scan", "httpfs",
  "pg_read", "pg_ls", "pg_stat_file", "pg_sleep", "lo_import", "lo_export",
  "dblink",
];

// Names defined inline by a CTE (`WITH name AS (...)`, plus each `, name AS (...)`),
// so they aren't mistaken for references to unknown tables.
function cteNames(lower: string): Set<string> {
  const names = new Set<string>();
  const re = /(?:\bwith\b|,)\s+"?([a-z_][a-z0-9_]*)"?\s+as\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lower)) !== null) names.add(match[1]);
  return names;
}

/**
 * Rejects the statement if it reads from a bare table name that isn't one of
 * the loaded tables (or a CTE it defines). Only bare identifiers right after
 * FROM/JOIN are checked — subqueries (`FROM (`) and table functions
 * (`name(...)`) are skipped — so this catches the model hallucinating a table
 * without tripping on legitimate SQL. `allowed` is matched case-insensitively.
 */
function validateTableReferences(statement: string, allowed: string[]): void {
  const lower = statement.toLowerCase();
  const known = new Set([...allowed.map((t) => t.toLowerCase()), ...cteNames(lower)]);

  // FROM/JOIN followed by an identifier. The negative lookahead skips table
  // functions (`name(...)`) without consuming characters — consuming here would
  // eat into a following JOIN keyword and miss its table. Subqueries (`FROM (`)
  // don't match since "(" isn't an identifier start.
  const re = /\b(?:from|join)\s+"?([a-z_][a-z0-9_]*)"?(?!\s*\()/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(lower)) !== null) {
    const name = match[1];
    if (!known.has(name)) {
      throw new SqlValidationError(
        `La consulta hace referencia a una tabla no cargada: ${name}.`,
      );
    }
  }
}

/**
 * Throws if `sql` is anything other than a single read-only SELECT/CTE
 * statement. Returns the trimmed statement (no trailing semicolons) on
 * success. This is the only gate between LLM-generated SQL and execution.
 *
 * When `allowedTables` is provided, the statement may only read from those
 * tables (or CTEs it defines) — see `validateTableReferences`.
 */
export function validateSelectOnly(sql: string, allowedTables?: string[]): string {
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

  if (allowedTables && allowedTables.length > 0) {
    validateTableReferences(statement, allowedTables);
  }

  return statement;
}
