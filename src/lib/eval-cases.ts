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

// Multi-table battery, run against the bundled ferretería dataset
// (public/sample-data/ferreteria: proveedores, clientes, productos, ventas).
// Every case needs a JOIN — the model can only produce these numbers by
// relating tables through the shared *_id columns. Expected values were
// computed directly from the CSVs. This is the metric that guards the
// multi-file/JOIN feature (v3 · paso 2) against prompt regressions.
export const JOIN_EVAL_CASES: EvalCase[] = [
  // — 2 tablas: ventas + productos —
  {
    id: "j-ingresos-categoria",
    category: "JOIN · 2 tablas",
    question: "¿Cuánto se ha vendido en dinero por categoría de producto?",
    expected: {
      kind: "result",
      rows: [
        { monto: 151242 }, { monto: 52257 }, { monto: 41780 }, { monto: 39475 },
        { monto: 24014 }, { monto: 22311 }, { monto: 14495 },
      ],
    },
    note: "ventas ⋈ productos, SUM(precio_total) GROUP BY categoria (7 categorías).",
  },
  {
    id: "j-unidades-categoria",
    category: "JOIN · 2 tablas",
    question: "¿Cuántas unidades se vendieron por categoría de producto?",
    expected: {
      kind: "result",
      rows: [
        { n: 762 }, { n: 540 }, { n: 400 }, { n: 345 }, { n: 226 }, { n: 185 }, { n: 184 },
      ],
    },
    note: "ventas ⋈ productos, SUM(cantidad) GROUP BY categoria.",
  },
  {
    id: "j-top-producto",
    category: "JOIN · 2 tablas",
    question: "¿Qué producto ha generado más ingresos en total?",
    expected: { kind: "result", mode: "prefix", rows: [{ producto: "Pinzas de electricista" }] },
    note: "ventas ⋈ productos, SUM(precio_total) GROUP BY producto ORDER BY DESC → Pinzas de electricista (36,575).",
  },
  // — 2 tablas: ventas + clientes —
  {
    id: "j-ingresos-tipo-cliente",
    category: "JOIN · 2 tablas",
    // "por tipo de cliente" nudges toward GROUP BY tipo (two rows) rather than a
    // one-row CASE pivot, which our row-count check would otherwise reject.
    question: "¿Cuánto se ha vendido en total por tipo de cliente (mayorista o minorista)?",
    expected: { kind: "result", rows: [{ monto: 287623 }, { monto: 57951 }] },
    note: "ventas ⋈ clientes, SUM(precio_total) GROUP BY tipo: Mayorista 287,623 · Minorista 57,951.",
  },
  {
    id: "j-ciudad-cliente-top",
    category: "JOIN · 2 tablas",
    // "más ingresos" pins the metric to money (precio_total), not units.
    question: "¿Qué ciudad de clientes genera más ingresos?",
    expected: { kind: "result", mode: "prefix", rows: [{ ciudad: "Guadalajara" }] },
    note: "ventas ⋈ clientes, SUM(precio_total) GROUP BY ciudad ORDER BY DESC → Guadalajara (92,678).",
  },
  // — 2 tablas: productos + proveedores —
  {
    id: "j-productos-proveedor-ciudad",
    category: "JOIN · 2 tablas",
    // Filtering by proveedores.ciudad (which only exists in proveedores) forces
    // the join — a clean, unambiguous 2-table case.
    question: "¿Cuántos productos en total ofrecen los proveedores ubicados en Monterrey?",
    expected: { kind: "result", rows: [{ n: 16 }] },
    note: "productos ⋈ proveedores, COUNT(*) WHERE proveedores.ciudad = 'Monterrey' = 16 (Herramientas MX + Eléctrica del Norte).",
  },
  // — 3 tablas —
  {
    id: "j-proveedor-ingresos",
    category: "JOIN · 3 tablas",
    // Kept terse ("¿Qué proveedor…?"): it yields a clean 3-way join returning
    // the name; the wordier "¿nombre del proveedor…?" pushed the model toward a
    // buggy scalar-subquery instead.
    question: "¿Qué proveedor genera más ingresos por los productos que se le venden?",
    expected: { kind: "result", mode: "prefix", rows: [{ proveedor: "Herramientas MX" }] },
    note: "ventas ⋈ productos ⋈ proveedores, SUM(precio_total) GROUP BY proveedor ORDER BY DESC → Herramientas MX (151,242).",
  },
  {
    id: "j-ingresos-ciudad-proveedor",
    category: "JOIN · 3 tablas",
    question: "¿Cuánto se vendió según la ciudad del proveedor?",
    expected: {
      kind: "result",
      rows: [
        { monto: 203499 }, { monto: 41780 }, { monto: 39475 },
        { monto: 36806 }, { monto: 20269 }, { monto: 3745 },
      ],
    },
    note: "ventas ⋈ productos ⋈ proveedores, SUM(precio_total) GROUP BY proveedor.ciudad (6 ciudades).",
  },
  {
    id: "j-categoria-mayoristas",
    category: "JOIN · 3 tablas",
    // "gastan más dinero" pins the metric to precio_total, not units.
    question: "¿En qué categoría de producto gastan más dinero los clientes mayoristas?",
    expected: { kind: "result", mode: "prefix", rows: [{ categoria: "Herramientas" }] },
    note: "ventas ⋈ productos ⋈ clientes, WHERE tipo='Mayorista', SUM(precio_total) GROUP BY categoria ORDER BY DESC → Herramientas (123,449).",
  },
];
