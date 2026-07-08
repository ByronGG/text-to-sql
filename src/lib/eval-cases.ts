// Evaluation battery for the text-to-SQL pipeline, run against the bundled
// sample dataset (`public/sample-data/ventas.csv`, 41 rows). Each case pins an
// expected *result*, not an expected SQL string — many different queries are
// correct, so we score execution accuracy (does the generated SQL produce the
// right answer) rather than string-matching the SQL.
//
// Expected rows only list the values that must be present; column names and
// column order are ignored by the comparator (see `run-eval.ts`), so a case
// tolerates the model aliasing or reordering columns. Numbers were computed
// directly from the CSV — see the note on each case.

/** A row of values that must appear in a matching result row (column-name agnostic). */
export type RowSpec = Record<string, number | string>;

export type Expectation =
  | {
      kind: "result";
      /**
       * "exact": the result must have exactly these rows (order-independent).
       * "prefix": the result's first rows must match these in order — for
       * top-N / "the best X" questions where an explicit LIMIT is optional.
       */
      mode?: "exact" | "prefix";
      rows: RowSpec[];
    }
  | { kind: "clarification" };

export interface EvalCase {
  id: string;
  category: string;
  question: string;
  expected: Expectation;
  /** Why this is the right answer — shown in the UI to justify the expectation. */
  note: string;
}

export const EVAL_CASES: EvalCase[] = [
  // — Agregación simple (escalares) —
  {
    id: "total-monto",
    category: "Agregación",
    question: "¿Cuál es el monto total de ventas?",
    expected: { kind: "result", rows: [{ monto: 798620 }] },
    note: "SUM(monto) sobre las 41 filas = 798,620.",
  },
  {
    id: "count-ventas",
    category: "Agregación",
    question: "¿Cuántas ventas hay registradas en total?",
    expected: { kind: "result", rows: [{ n: 41 }] },
    note: "COUNT(*) = 41 filas.",
  },
  {
    id: "avg-monto",
    category: "Agregación",
    question: "¿Cuál es el monto promedio por venta?",
    expected: { kind: "result", rows: [{ avg: 19478.54 }] },
    note: "AVG(monto) = 798,620 / 41 ≈ 19,478.54.",
  },
  {
    id: "max-venta",
    category: "Agregación",
    question: "¿Cuál es el monto de la venta más grande?",
    expected: { kind: "result", rows: [{ monto: 96000 }] },
    note: "MAX(monto) = 96,000 (Laptop, Grupo Aranda).",
  },
  {
    id: "distinct-clientes",
    category: "Agregación",
    question: "¿Cuántos clientes distintos hay?",
    expected: { kind: "result", rows: [{ n: 6 }] },
    note: "COUNT(DISTINCT cliente) = 6.",
  },
  {
    id: "unidades-total",
    category: "Agregación",
    question: "¿Cuántas unidades se vendieron en total?",
    expected: { kind: "result", rows: [{ n: 3625 }] },
    note: "SUM(unidades) = 3,625.",
  },

  // — Group by —
  {
    id: "monto-por-categoria",
    category: "Group by",
    question: "¿Cuánto se vendió en dinero por cada categoría?",
    expected: {
      kind: "result",
      rows: [{ monto: 498550 }, { monto: 202050 }, { monto: 98020 }],
    },
    note: "SUM(monto) GROUP BY categoria: Electronica 498,550 · Materiales 202,050 · Alimentos 98,020.",
  },
  {
    id: "count-por-categoria",
    category: "Group by",
    question: "¿Cuántas ventas hay por categoría?",
    expected: {
      kind: "result",
      rows: [{ n: 15 }, { n: 14 }, { n: 12 }],
    },
    note: "COUNT(*) GROUP BY categoria: Electronica 15 · Materiales 14 · Alimentos 12.",
  },
  {
    id: "monto-por-mes",
    category: "Group by",
    question: "¿Cuál fue el monto de ventas de cada mes?",
    expected: {
      kind: "result",
      rows: [{ monto: 151700 }, { monto: 131870 }, { monto: 349750 }, { monto: 165300 }],
    },
    note: "SUM(monto) por mes: jun 151,700 · jul 131,870 · ago 349,750 · sep 165,300.",
  },

  // — Filtro —
  {
    id: "monto-cdmx",
    category: "Filtro",
    question: "¿Cuánto se vendió en total en CDMX?",
    expected: { kind: "result", rows: [{ monto: 234550 }] },
    note: "SUM(monto) WHERE ciudad = 'CDMX' = 234,550.",
  },
  {
    id: "count-monterrey",
    category: "Filtro",
    question: "¿Cuántas ventas hubo en Monterrey?",
    expected: { kind: "result", rows: [{ n: 14 }] },
    note: "COUNT(*) WHERE ciudad = 'Monterrey' = 14.",
  },
  {
    id: "count-agosto",
    category: "Filtro (fecha)",
    question: "¿Cuántas ventas hubo en agosto?",
    expected: { kind: "result", rows: [{ n: 16 }] },
    note: "COUNT(*) del mes 2026-08 = 16.",
  },
  {
    id: "monto-electronica-agosto",
    category: "Filtro compuesto",
    question: "¿Cuánto se vendió de Electrónica en agosto?",
    expected: { kind: "result", rows: [{ monto: 229250 }] },
    note: "SUM(monto) WHERE categoria = 'Electronica' AND mes = 2026-08 = 229,250.",
  },

  // — Orden / top-N —
  {
    id: "mejor-cliente",
    category: "Orden / top-N",
    question: "¿Quién es mi mejor cliente por monto total?",
    // Only the client name is asserted: a correct query for "who is the best
    // client" selects just `cliente` (ordered by total), so requiring the
    // amount column too would fail a correct answer. The name alone still
    // forces the right grouping + ordering.
    expected: {
      kind: "result",
      mode: "prefix",
      rows: [{ cliente: "Tecno Solutions" }],
    },
    note: "SUM(monto) GROUP BY cliente ORDER BY DESC → Tecno Solutions (264,000).",
  },
  {
    id: "top-producto",
    category: "Orden / top-N",
    question: "¿Cuál es el producto que más ha vendido en dinero?",
    // Same as the best-client case: only the product name is asserted, since
    // a correct query need not select the amount column.
    expected: {
      kind: "result",
      mode: "prefix",
      rows: [{ producto: "Laptop" }],
    },
    note: "SUM(monto) GROUP BY producto ORDER BY DESC → Laptop (360,000).",
  },

  // — Ambigüedad (human-in-the-loop) —
  {
    id: "ambiguo-mejores",
    category: "Ambigüedad",
    question: "¿Cuáles son los mejores?",
    expected: { kind: "clarification" },
    note: "Sin métrica ni entidad ('mejores' qué, según qué): debería pedir aclaración.",
  },
];
