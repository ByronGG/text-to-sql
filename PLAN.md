# AskQL — Plan del proyecto

Web app de portafolio: el usuario sube un CSV, pregunta en lenguaje natural y recibe
los datos como los pidió (tabla + export a Excel/Power BI).

**Principio central:** el LLM nunca lee los datos, solo el esquema. Genera SQL y un
motor real (DuckDB) lo ejecuta. Los datos del usuario nunca salen de su navegador.

---

## Arquitectura general

```
┌─────────────────── Navegador ───────────────────┐      ┌──── Vercel ────┐
│  UI (Next.js/React)                              │      │  API route     │
│  DuckDB-WASM (Web Worker) ← CSV del usuario      │ ───► │  /api/sql      │ ───► Groq API
│  Validación SQL · Export XLSX/CSV                │ ◄─── │  (proxy + rate │      (LLM)
└──────────────────────────────────────────────────┘      │   limit)       │
                                                          └────────────────┘
```

- **Un solo repo Next.js desplegado en Vercel** (plan Hobby, gratis). Sin VPS, costo fijo $0.
- Todo el trabajo de datos ocurre en el cliente; el servidor solo hace de proxy al LLM
  para proteger la API key.

## Stack — Frontend

| Pieza | Elección | Para qué |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | UI + API routes en un solo deploy |
| Estilos | Tailwind CSS + shadcn/ui | UI limpia y rápida de armar |
| Motor SQL | `@duckdb/duckdb-wasm` | Ejecuta SQL sobre el CSV en un Web Worker |
| Tabla de resultados | TanStack Table | Orden, paginación |
| SQL visible | `shiki` | Syntax highlighting del SQL generado |
| Export | SheetJS (`xlsx`) | Genera XLSX/CSV en el cliente |
| Gráficas (v2) | Recharts | Gráfica automática según el resultado |

## Stack — Backend

Una sola API route de Next.js (`/api/sql`):

| Pieza | Elección | Para qué |
|---|---|---|
| LLM | Groq — `llama-3.3-70b-versatile` (free tier ~1,000 req/día) | Generar SQL; muy rápido |
| Validación de payloads | Zod | Validar request y la respuesta JSON del LLM |
| Rate limit | Por IP (Upstash Redis free tier, o contador simple) | Proteger la cuota gratuita |
| Secretos | Variables de entorno de Vercel | La key nunca toca el navegador |

Alternativas de LLM si Groq cambia su free tier: Google Gemini Flash (ai.google.dev)
u OpenRouter (modelos `:free`).

## Roadmap v1 — estado

- [x] **Paso 0 · Andamiaje** — Next.js + TypeScript + Tailwind + shadcn/ui + librerías instaladas
- [x] **Paso A · Ingesta** — carga CSV (drag & drop + ejemplo), DuckDB-WASM self-hosted, extracción de esquema/muestras/categóricos, preview
- [x] **Paso 1 · Ejecución con validación** — validador SQL (solo `SELECT`/`WITH`, un statement, `LIMIT` y timeout forzados) + ejecución en DuckDB con resultados serializados
- [x] **Paso 2 · Resultados + export** — tabla TanStack (orden/paginación) + export XLSX/CSV con SheetJS
- [x] **Paso 3 · API route `/api/sql`** — prompt + Groq + Zod; respuesta `sql` o `aclaracion` (requiere `GROQ_API_KEY` en `.env.local`)
- [x] **Paso 4 · Flujo de consulta en UI** — input NL → API → validar → ejecutar → resultados; ciclo de auto-corrección (máx. 2-3) y diálogo human-in-the-loop
- [x] **Paso 5 · Presentación** — interpretación en texto, SQL expandible con shiki, estados de carga/error
- [x] **Paso 6a · Endurecimiento** — rate limit por IP (429 + `Retry-After`), README de arquitectura, lint en 0 errores
- [x] **Paso 6b · Identidad y diseño** — rediseño Suizo/terracota (Archivo + IBM Plex Mono), nombre **AskQL**, favicon, metadata OG, disclaimer de privacidad
- [x] **Paso 6c · Deploy a Vercel** — desplegado en **askql.vercel.app** con `GROQ_API_KEY` configurada; auto-deploy en cada push a `main`

## Flujo lógico — v1

### Fase A · Ingesta (una vez por archivo)
1. Usuario sube CSV — o usa el **CSV de ejemplo precargado** (clave para que un
   reclutador pruebe el demo en 10 segundos).
2. `registerFileBuffer()` + `CREATE TABLE datos AS SELECT * FROM read_csv_auto(...)`.
   DuckDB infiere tipos (fechas, números) automáticamente.
3. Se extrae el contexto para el LLM:
   - `DESCRIBE datos` (columnas + tipos)
   - 3–5 filas de muestra
   - Valores distintos de columnas categóricas (p. ej. `mes` = "Ago", no "Agosto")

### Fase B · Consulta (cada pregunta)
4. Usuario escribe la pregunta en lenguaje natural.
5. `POST /api/sql` con `{ pregunta, esquema, muestras, historial }`.
6. El LLM responde JSON estructurado:
   - `{ tipo: "sql", consulta, interpretacion }` — incluye la suposición hecha
     (p. ej. "interpreté 'mejores' como mayor monto total"), o
   - `{ tipo: "aclaracion", pregunta_al_usuario }` — **human-in-the-loop**: si la
     pregunta es ambigua, el LLM pregunta antes de generar SQL.
7. **Validación en cliente antes de ejecutar:**
   - Un solo statement; debe empezar con `SELECT` o `WITH`
   - Nada de `INSERT/UPDATE/DELETE/DROP/ALTER/...`
   - `LIMIT` forzado (~1,000 filas) si el LLM no puso uno
   - Timeout en el Web Worker
8. Ejecución en DuckDB-WASM.
9. **Ciclo de auto-corrección:** si DuckDB lanza error, se reenvía
   `{ sql_fallido, mensaje_error }` a la API para que el LLM corrija.
   Máximo 2–3 reintentos; después se muestra un error amigable.
10. Resultado en pantalla: interpretación en texto + SQL expandible + tabla +
    botón "Exportar XLSX/CSV" (compatible con Excel y Power BI).

## Seguridad (v1)

- Allowlist `SELECT`/`WITH`, un solo statement, `LIMIT` y timeout forzados.
- Rate limit por IP en el proxy; API key solo en el servidor.
- Los datos nunca salen del navegador (argumento de privacidad para entrevistas).

---

## Roadmap v2 — Experiencia

Ordenado para que cada paso deje algo funcional y probable por sí solo.

- [x] **Paso 1 · Gráfica automática** — heurística por valores (`chart-spec.ts`):
  temporal + numérica → línea; categórica (≤25 filas) + numérica → barras; una fila
  de solo números → tarjetas de métrica; otra forma → solo tabla. Toggle Gráfica/Tabla
  (`result-chart.tsx`), gráfica por defecto. De paso: normalización de Decimals de
  Arrow (SUM de BIGINT) a `number` en `run-query.ts`.
- [x] **Paso 2 · Historial conversacional** — la consola guarda el hilo de turnos
  (pregunta/SQL/interpretación/resultado), envía los últimos 6 como `history`, y
  muestra la lista "CONVERSACIÓN" navegable (clic para ver ese resultado, botón
  "Limpiar"). Prompt reforzado para tratar el contexto de seguimiento. De paso:
  reemplazado `ResponsiveContainer` de Recharts por medición propia con
  `ResizeObserver` (cacheaba ancho 0 al remontar entre turnos).
- [x] **Paso 3 · XLSX como entrada** — SheetJS lee el Excel en el cliente
  (`xlsx-input.ts`), convierte la hoja a CSV y entra al mismo pipeline de DuckDB.
  Una hoja → carga directa; varias → selector de hoja en `csv-upload.tsx`. Copy
  actualizado (acepta CSV o Excel).
- [x] **Paso 4 · Compartir consulta por URL** — botón "Compartir" en cada resultado
  copia un enlace con `?q=<pregunta>` (+ `sample=1` si el dataset es el ejemplo).
  Enlace de ejemplo → auto-carga el CSV y ejecuta; enlace de archivo propio → muestra
  aviso y precarga la pregunta para re-subir el archivo (los datos nunca salen del
  navegador). Lectura de URL en `page.tsx`, `loadSampleTable()` centralizado.
- [ ] **Paso 5 · Cierre v2** — README actualizado (gif del flujo con gráfica),
  verificación responsive/accesibilidad. (Build + deploy ya cubiertos: la app vive en
  askql.vercel.app.)

---

## Roadmap v3 — Capacidad y robustez

Mismo criterio que v2: cada paso deja algo funcional y demostrable por sí solo. El
orden no es casual — 1 y 2 suben la capacidad del producto sin tocar la arquitectura;
3 y 4 son endurecimiento operativo barato; 5 es el único cambio arquitectónico y se
apoya en todos los anteriores.

- [x] **Paso 1 · Set de evaluación (execution accuracy)** — batería de 16 preguntas
  sobre el CSV de ejemplo (`eval-cases.ts`), corrida por el pipeline real
  (`askQuestion` → `sql-guard` → `runQuery`) desde la página `/eval`, que puntúa en
  vivo. Compara el *conjunto de resultados* del SQL generado, no su texto: cada caso
  fija solo los valores que deben aparecer, ignorando nombres/orden de columnas, con
  modos `exact` (bijección por valores, cardinalidad exacta) y `prefix` (top-N donde
  el LIMIT es opcional). Cubre agregación, group by, filtros de fecha/compuestos,
  top-N y el camino de "aclaración" (human-in-the-loop). Un intento por caso
  (single-shot, sin auto-corrección) → 16 de las 20 solicitudes del rate limit por
  ventana. Comparador en `run-eval.ts`.
- [x] **Paso 2 · Múltiples archivos con JOINs** — `page.tsx` mantiene una lista de
  tablas (agregar/quitar). Cada archivo carga en su propia tabla con nombre saneado por
  `deriveTableName` (identificador SQL seguro, deduplicado; el nombre real del archivo
  nunca llega a SQL), y `loadCsvAsTable(file, tableName)` ya no borra las demás. La
  API pasó de `schema` único a `tables[]`; `sql-prompt.ts` renderiza todas las tablas
  y añade "relaciones sugeridas" (columnas homónimas → posibles llaves de JOIN).
  `validateSelectOnly(sql, allowedTables)` rechaza referencias a tablas no cargadas
  (lookahead que salta funciones de tabla y subconsultas). UI: cada tabla es una
  tarjeta con su chip de nombre SQL y "Quitar", más "Agregar otro archivo".
  Verificado: JOINs correctos que solo referencian tablas registradas, guard con 8/8
  casos, y la muestra carga como tabla `ventas` en el navegador. La muestra pasa de
  `datos` a un nombre propio (`ventas`) para leerse bien junto a tablas del usuario.
- [x] **Paso 3 · BYOK (trae tu propia key)** — diálogo "API key" en el header
  (`api-key-dialog.tsx`) guarda la key en `localStorage` (`api-key.ts`); `ask-question`
  la envía por header `x-groq-api-key`. Si viene, la route la usa en lugar de
  `GROQ_API_KEY` y **salta el rate limit** (protege la cuota compartida, no la del
  usuario); nunca se persiste en el servidor. Mensaje 401 específico si Groq rechaza la
  key. Disponible también en `/eval`, donde evita el throttling del free-tier.
  Verificado: key inválida → 401 propio (prueba que la key del cliente se lee y se usa),
  sin header → key compartida OK, y el flujo de guardar/quitar/indicador "activa" en el
  navegador.
- [x] **Paso 4 · Cache de preguntas** — cache en memoria en la route (`sql-cache.ts`)
  con clave `sha256(pregunta normalizada + JSON del esquema)`. Se eligió servidor (no
  `localStorage`) porque el objetivo son los enlaces compartidos del ejemplo, donde
  muchos usuarios distintos hacen la misma pregunta sobre el mismo CSV → un hit los
  beneficia a todos. Solo cachea primer turno (sin `history` ni `failedSql`); LRU de
  500 entradas. El chequeo va **antes** del rate limit (un hit es gratis, no consume
  cuota ni requiere key). Header `x-cache: HIT|MISS`. Verificado: repetición idéntica y
  variación de mayúsculas/espacios → HIT (~7-11ms vs ~500ms, cuerpo idéntico); con
  history o esquema distinto → MISS. Beneficio extra: re-correr `/eval` es instantáneo
  y no toca el throttling de Groq.
- [x] **Paso 5 · Conexión a Postgres real** — modo separado ("Archivo" vs "Postgres"
  en la sección DATOS). La introspección y ejecución ocurren en el servidor
  (`pg-server.ts` con `pg`): `introspectSchema` lee el esquema `public` al mismo shape
  `TableSchema` que los CSV (así prompt/guard/UI se reutilizan intactos), y `runPgQuery`
  valida (SELECT-only + allowlist de tablas), ejecuta en **transacción `READ ONLY`** con
  `statement_timeout` y `LIMIT`, y serializa. Rutas `/api/pg/schema` y `/api/pg/query`.
  `QueryConsole` recibe un `runSql` inyectable (DuckDB por defecto, ejecutor PG en este
  modo). Credenciales solo en memoria del cliente, enviadas por consulta, nunca
  persistidas. Guard endurecido con funciones peligrosas de PG (`pg_read`, `pg_sleep`,
  `lo_import`, `dblink`…). Disclaimer propio ("tus datos sí salen del navegador; usa
  usuario de solo lectura"). Verificado sin DB viva: guard bloquea DELETE/pg_sleep/tabla
  desconocida **antes** de conectar, errores de conexión mapeados a mensajes amigables,
  y el UI completo del modo (switch, form, error). Falta corrida end-to-end con un
  Postgres real (necesita Docker levantado o una DB del usuario).

---

## Roadmap v4 — Calidad y producto

v3 subió mucho la superficie de código (multi-tabla, BYOK, cache, Postgres) sin red de
pruebas — solo el eval manual. v4 primero asegura esa base (1–2) y luego eleva la
sensación de producto (3–5). Mismo criterio: cada paso deja algo funcional y
demostrable por sí solo.

- [x] **Paso 1 · Tests unitarios + CI** — Vitest (`vitest.config.ts`, entorno node) con
  **65 pruebas** sobre la lógica pura: `sql-guard` (23, incluye la regresión del regex
  de JOIN de v3 y los bloqueos de `pg_sleep`/`dblink`), `table-name` (saneo, acentos,
  dedupe, e invariante "siempre un identificador SQL seguro"), `sql-cache`
  (normalización de clave, sensibilidad al esquema, cap y LRU), `chart-spec` y
  `eval-compare`. Para que la lógica fuera testeable sin DuckDB se extrajeron dos
  módulos puros: `table-name.ts` (de `csv-table.ts`) y `eval-compare.ts` (de
  `run-eval.ts`) — buena separación I/O vs lógica, además de testeable.
  Scripts `typecheck`/`test`/`test:watch`; CI en `.github/workflows/ci.yml`
  (lint + typecheck + tests en cada push/PR; Vercel cubre el build).
  De paso, los tests encontraron un bug real: `validateSelectOnly` devolvía el
  statement con espacio final (`"SELECT 1 "`) pese a documentar que venía trimmed.
- [ ] **Paso 2 · Eval multi-tabla** — segundo dataset de ejemplo empaquetado (el de
  ferretería: ventas/productos/clientes/proveedores) y ~8-10 casos de eval que exigen
  JOIN (dos y tres tablas), midiendo por separado precisión single-table vs multi-table.
  Es la métrica que valida el Paso 2 de v3 y protege el prompt de regresiones futuras.
- [ ] **Paso 3 · UX de consulta** — tres mejoras pequeñas con mucho efecto:
  (a) **preguntas sugeridas** al cargar datos (generadas por el LLM a partir del
  esquema, 1 llamada cacheada — el usuario nuevo no sabe qué preguntar);
  (b) **SQL editable**: editar el SQL generado y re-ejecutarlo (camino power-user;
  pasa por el mismo guard);
  (c) **"explica esta consulta"**: botón en el SQL que pide al modelo la explicación
  en lenguaje natural (el camino inverso, idea de banca desde v2).
- [ ] **Paso 4 · Persistencia local de sesión** — la conversación (turnos, SQL,
  resultados) y las tablas cargadas sobreviven un refresh vía `localStorage` +
  re-registro en DuckDB. Hoy un F5 pierde todo el hilo; para demos largas duele.
- [ ] **Paso 5 · Dashboard de resultados** — "fijar" resultados (tabla o gráfica) a un
  tablero de tarjetas reordenable. Convierte la herramienta de pregunta-única en algo
  que produce un entregable visual (screenshot-able para el README y para reclutadores).
- [ ] **Paso 6 · Infra compartida (si hay tráfico real)** — mover rate limit y cache a
  Upstash Redis (free tier) para que sobrevivan cold starts y se compartan entre
  instancias; hoy son por-instancia y está documentado como limitación consciente.

### Ideas sueltas (si sobra tiempo)
- Streaming de la respuesta del LLM (mejora percepción de velocidad; el JSON
  estructurado lo complica).
- Entrada Parquet (DuckDB lo lee nativo; solo falta el camino de carga).
- Toggle de idioma ES/EN (amplía el alcance del portafolio).
- Verificación end-to-end del modo Postgres contra una DB real sembrada (Docker).
