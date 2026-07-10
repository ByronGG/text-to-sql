import { describe, expect, it } from "vitest";
import { SqlValidationError, validateSelectOnly } from "@/lib/sql-guard";

const TABLES = ["ventas", "clientes"];

describe("validateSelectOnly — shape", () => {
  it("accepts a plain SELECT and strips trailing semicolons", () => {
    expect(validateSelectOnly("SELECT 1;")).toBe("SELECT 1");
    expect(validateSelectOnly("  SELECT 1 ;; ")).toBe("SELECT 1");
  });

  it("accepts a CTE", () => {
    const sql = 'WITH t AS (SELECT 1 AS a) SELECT * FROM t';
    expect(validateSelectOnly(sql)).toBe(sql);
  });

  it("rejects an empty statement", () => {
    expect(() => validateSelectOnly("   ")).toThrow(SqlValidationError);
  });

  it("rejects multiple statements", () => {
    expect(() => validateSelectOnly("SELECT 1; SELECT 2")).toThrow(/una consulta a la vez/i);
  });

  it("rejects anything that does not start with SELECT/WITH", () => {
    expect(() => validateSelectOnly("EXPLAIN SELECT 1")).toThrow(/solo se permiten consultas select/i);
  });
});

describe("validateSelectOnly — forbidden operations", () => {
  it.each([
    ["INSERT INTO ventas VALUES (1)"],
    ["UPDATE ventas SET monto = 1"],
    ["DELETE FROM ventas"],
    ["DROP TABLE ventas"],
  ])("rejects the write statement %s", (sql) => {
    expect(() => validateSelectOnly(sql)).toThrow(SqlValidationError);
  });

  it("rejects a write keyword smuggled inside a SELECT", () => {
    expect(() => validateSelectOnly("SELECT * FROM ventas WHERE 1=1; DROP TABLE ventas")).toThrow(
      SqlValidationError,
    );
    expect(() => validateSelectOnly("WITH x AS (SELECT 1) INSERT INTO ventas SELECT * FROM x")).toThrow(
      /INSERT/i,
    );
  });

  it("does not trip on identifiers that merely contain a keyword", () => {
    // "created_at" contains "create"; word boundaries must keep it legal.
    expect(() => validateSelectOnly('SELECT "created_at" FROM ventas')).not.toThrow();
    // "updated_at" contains "update".
    expect(() => validateSelectOnly('SELECT "updated_at" FROM ventas')).not.toThrow();
  });

  it.each([
    ["SELECT * FROM read_csv_auto('/etc/passwd')", /read_csv/i],
    ["SELECT pg_sleep(10)", /pg_sleep/i],
    ["SELECT pg_read_file('/etc/passwd')", /pg_read/i],
    ["SELECT * FROM dblink('...', '...')", /dblink/i],
    ["SELECT lo_import('/etc/passwd')", /lo_import/i],
  ])("rejects the dangerous call in %s", (sql, pattern) => {
    expect(() => validateSelectOnly(sql)).toThrow(pattern);
  });
});

describe("validateSelectOnly — table allowlist", () => {
  it("allows queries over registered tables", () => {
    expect(() => validateSelectOnly('SELECT SUM("monto") FROM ventas', TABLES)).not.toThrow();
    expect(() =>
      validateSelectOnly('SELECT * FROM ventas v JOIN clientes c ON v."id" = c."id"', TABLES),
    ).not.toThrow();
    expect(() => validateSelectOnly('SELECT * FROM "ventas" JOIN "clientes" USING ("id")', TABLES)).not.toThrow();
  });

  it("allows CTE names it defines itself", () => {
    expect(() =>
      validateSelectOnly('WITH top AS (SELECT "cliente" FROM ventas) SELECT * FROM top', TABLES),
    ).not.toThrow();
  });

  it("ignores subqueries after FROM", () => {
    expect(() => validateSelectOnly("SELECT * FROM (SELECT * FROM ventas) sub", TABLES)).not.toThrow();
  });

  it("rejects a table that is not loaded", () => {
    expect(() => validateSelectOnly("SELECT * FROM pedidos", TABLES)).toThrow(/tabla no cargada: pedidos/i);
  });

  // Regression: an earlier implementation consumed the character after the
  // table name, which ate the "J" of a following JOIN and silently skipped
  // validating its table. `FROM ventas JOIN pedidos` must still be rejected.
  it("rejects an unknown table referenced by a JOIN after a known table", () => {
    expect(() => validateSelectOnly("SELECT * FROM ventas JOIN pedidos ON true", TABLES)).toThrow(
      /tabla no cargada: pedidos/i,
    );
  });

  it("matches table names case-insensitively", () => {
    expect(() => validateSelectOnly("SELECT * FROM VENTAS", TABLES)).not.toThrow();
  });

  it("skips the allowlist entirely when no tables are given", () => {
    expect(() => validateSelectOnly("SELECT * FROM cualquiera")).not.toThrow();
  });
});
