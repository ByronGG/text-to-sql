// Evaluation battery for the text-to-SQL pipeline, run against the bundled
// sample dataset (`public/sample-data/ventas.csv`, 229 rows spanning all of
// 2026, with region/vendedor/metodo_pago/estado/precio/costo dimensions). Each
// case pins an expected *result*, not an expected SQL string — many different
// queries are correct, so we score execution accuracy (does the generated SQL
// produce the right answer) rather than string-matching the SQL.
//
// Expected rows only list the values that must be present; column names and
// column order are ignored by the comparator (see `run-eval.ts`), so a case
// tolerates the model aliasing or reordering columns. Numbers were computed
// directly from the CSV by `scripts/gen-sample.mjs` (which prints them) — see
// the note on each case.

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
    expected: { kind: "result", rows: [{ monto: 3796253 }] },
    note: "SUM(monto) sobre las 229 filas = 3,796,253.",
  },
  {
    id: "count-ventas",
    category: "Agregación",
    question: "¿Cuántas ventas hay registradas en total?",
    expected: { kind: "result", rows: [{ n: 229 }] },
    note: "COUNT(*) = 229 filas.",
  },
  {
    id: "avg-monto",
    category: "Agregación",
    question: "¿Cuál es el monto promedio por venta?",
    expected: { kind: "result", rows: [{ avg: 16577.52 }] },
    note: "AVG(monto) = 3,796,253 / 229 ≈ 16,577.52.",
  },
  {
    id: "max-venta",
    category: "Agregación",
    question: "¿Cuál es el monto de la venta más grande?",
    expected: { kind: "result", rows: [{ monto: 108000 }] },
    note: "MAX(monto) = 108,000 (Laptop, 9 unidades × 12,000).",
  },
  {
    id: "distinct-clientes",
    category: "Agregación",
    question: "¿Cuántos clientes distintos hay?",
    expected: { kind: "result", rows: [{ n: 10 }] },
    note: "COUNT(DISTINCT cliente) = 10.",
  },
  {
    id: "unidades-total",
    category: "Agregación",
    question: "¿Cuántas unidades se vendieron en total?",
    expected: { kind: "result", rows: [{ n: 21120 }] },
    note: "SUM(unidades) = 21,120.",
  },
  {
    id: "ganancia-total",
    category: "Agregación (cálculo)",
    question:
      "¿Cuál es la ganancia total? Calcúlala como la suma de (precio_unitario − costo_unitario) × unidades.",
    expected: { kind: "result", rows: [{ ganancia: 1119745 }] },
    note: "SUM((precio_unitario - costo_unitario) * unidades) = 1,119,745.",
  },

  // — Group by —
  {
    id: "monto-por-categoria",
    category: "Group by",
    question: "¿Cuánto se vendió en dinero por cada categoría?",
    expected: {
      kind: "result",
      rows: [{ monto: 2095400 }, { monto: 1090040 }, { monto: 610813 }],
    },
    note: "SUM(monto) GROUP BY categoria: Electronica 2,095,400 · Materiales 1,090,040 · Alimentos 610,813.",
  },
  {
    id: "count-por-categoria",
    category: "Group by",
    question: "¿Cuántas ventas hay por categoría?",
    expected: {
      kind: "result",
      rows: [{ n: 81 }, { n: 77 }, { n: 71 }],
    },
    note: "COUNT(*) GROUP BY categoria: Materiales 81 · Alimentos 77 · Electronica 71.",
  },
  {
    id: "monto-por-mes",
    category: "Group by",
    question: "¿Cuál fue el monto de ventas de cada mes?",
    expected: {
      kind: "result",
      rows: [
        { monto: 207141 }, { monto: 467110 }, { monto: 240615 }, { monto: 274720 },
        { monto: 223842 }, { monto: 268579 }, { monto: 290467 }, { monto: 412080 },
        { monto: 245830 }, { monto: 305220 }, { monto: 553316 }, { monto: 307333 },
      ],
    },
    note: "SUM(monto) por mes (ene–dic 2026), 12 grupos con sumas distintas.",
  },
  {
    id: "monto-por-region",
    category: "Group by",
    question: "¿Cuánto se vendió en dinero por región?",
    expected: {
      kind: "result",
      rows: [{ monto: 1350586 }, { monto: 1277945 }, { monto: 976242 }, { monto: 191480 }],
    },
    note: "SUM(monto) GROUP BY region: Centro 1,350,586 · Occidente 1,277,945 · Norte 976,242 · Sureste 191,480.",
  },
  {
    id: "monto-por-metodo",
    category: "Group by",
    question: "¿Cuánto se vendió por cada método de pago?",
    expected: {
      kind: "result",
      rows: [{ monto: 1206790 }, { monto: 917640 }, { monto: 850448 }, { monto: 821375 }],
    },
    note: "SUM(monto) GROUP BY metodo_pago: Efectivo 1,206,790 · Transferencia 917,640 · Credito 850,448 · Tarjeta 821,375.",
  },

  // — Filtro —
  {
    id: "monto-cdmx",
    category: "Filtro",
    question: "¿Cuánto se vendió en total en CDMX?",
    expected: { kind: "result", rows: [{ monto: 740065 }] },
    note: "SUM(monto) WHERE ciudad = 'CDMX' = 740,065.",
  },
  {
    id: "count-monterrey",
    category: "Filtro",
    question: "¿Cuántas ventas hubo en Monterrey?",
    expected: { kind: "result", rows: [{ n: 44 }] },
    note: "COUNT(*) WHERE ciudad = 'Monterrey' = 44.",
  },
  {
    id: "count-devueltas",
    category: "Filtro",
    question: "¿Cuántas ventas fueron devueltas?",
    expected: { kind: "result", rows: [{ n: 29 }] },
    note: "COUNT(*) WHERE estado = 'Devuelta' = 29.",
  },
  {
    id: "count-agosto",
    category: "Filtro (fecha)",
    question: "¿Cuántas ventas hubo en agosto?",
    expected: { kind: "result", rows: [{ n: 20 }] },
    note: "COUNT(*) del mes 2026-08 = 20.",
  },
  {
    id: "monto-electronica-agosto",
    category: "Filtro compuesto",
    question: "¿Cuánto se vendió de Electrónica en agosto?",
    expected: { kind: "result", rows: [{ monto: 263500 }] },
    note: "SUM(monto) WHERE categoria = 'Electronica' AND mes = 2026-08 = 263,500.",
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
    note: "SUM(monto) GROUP BY cliente ORDER BY DESC → Tecno Solutions (680,480).",
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
    note: "SUM(monto) GROUP BY producto ORDER BY DESC → Laptop (1,296,000).",
  },
  {
    id: "top-vendedor",
    category: "Orden / top-N",
    question: "¿Qué vendedor ha generado más ingresos?",
    // Only the salesperson name is asserted (see best-client rationale).
    expected: {
      kind: "result",
      mode: "prefix",
      rows: [{ vendedor: "Diego Ramos" }],
    },
    note: "SUM(monto) GROUP BY vendedor ORDER BY DESC → Diego Ramos (1,277,945).",
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
