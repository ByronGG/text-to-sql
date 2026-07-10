import { describe, expect, it } from "vitest";
import { deriveTableName } from "@/lib/table-name";

describe("deriveTableName", () => {
  it("lowercases and drops the file extension", () => {
    expect(deriveTableName("Ventas.CSV")).toBe("ventas");
    expect(deriveTableName("report.xlsx")).toBe("report");
  });

  it("strips accents", () => {
    expect(deriveTableName("Facturación.csv")).toBe("facturacion");
    expect(deriveTableName("años.csv")).toBe("anos");
  });

  it("replaces unsafe characters with underscores and trims them", () => {
    expect(deriveTableName("ventas 2026 (final).csv")).toBe("ventas_2026_final");
    expect(deriveTableName("--ventas--.csv")).toBe("ventas");
    expect(deriveTableName("libro.xlsx · Hoja 1")).toBe("libro_xlsx_hoja_1");
  });

  it("never lets a name start with a digit", () => {
    expect(deriveTableName("2026-ventas.csv")).toBe("t_2026_ventas");
  });

  it("falls back to 'tabla' when nothing usable survives", () => {
    expect(deriveTableName("!!!.csv")).toBe("tabla");
    expect(deriveTableName("")).toBe("tabla");
  });

  it("caps the identifier length", () => {
    expect(deriveTableName("a".repeat(80)).length).toBe(40);
  });

  it("dedupes against existing names", () => {
    expect(deriveTableName("ventas.csv", ["ventas"])).toBe("ventas_2");
    expect(deriveTableName("ventas.csv", ["ventas", "ventas_2"])).toBe("ventas_3");
  });

  it("only ever produces a safe SQL identifier", () => {
    const nasty = [
      'ventas"; DROP TABLE x; --.csv',
      "../../etc/passwd",
      "tabla'; SELECT 1 --",
      "ñ ü ç.csv",
    ];
    for (const input of nasty) {
      expect(deriveTableName(input)).toMatch(/^[a-z_][a-z0-9_]*$/);
    }
  });
});
