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
- [x] **Paso 2 · Eval multi-tabla** — dataset de ferretería empaquetado en
  `public/sample-data/ferreteria/` (proveedores·clientes·productos·ventas) y **9 casos
  JOIN** (`JOIN_EVAL_CASES`) de 2 y 3 tablas. `/eval` ahora corre **dos baterías** con
  precisión separada (una tabla / multi-tabla), cada una con su botón "Correr" y un
  "Correr todo" (25 casos). `loadFerreteriaSample()` carga las 4 tablas a nombres fijos;
  `runEvalCase` pasó de una tabla a `tables[]`. Valores esperados computados
  independientemente de los CSV. Verificado vía API: 8/9 casos generan SQL multi-tabla
  correcto que solo referencia tablas registradas. Construir el eval **destapó
  ambigüedades reales de diseño** (dinero vs unidades; id vs nombre; pivote 1-fila vs
  2-filas agrupadas) → reformulé las preguntas para que "correcto" quede bien definido.
  Añadido `eval-cases.test.ts` (ids únicos, valores distintos por caso exact para la
  bijección greedy). Total: 69 tests.
- [x] **Paso 3 · UX de consulta** — tres mejoras:
  (a) **preguntas sugeridas** (`/api/suggest`): al cargar datos, chips clicables
  generados por el LLM del esquema (agregación/comparación/ranking/tendencia), cacheados
  por esquema — un clic ejecuta la pregunta;
  (b) **SQL editable**: "Editar y re-ejecutar" abre un textarea con el SQL generado;
  al ejecutar pasa por el mismo `runSql` (guard + ejecutor) y se agrega como turno nuevo;
  (c) **"Explicar"** (`/api/explain`): el modelo describe la consulta en lenguaje
  natural (el camino inverso). De paso se extrajo `api-groq.ts` (resolución de key +
  rate limit + llamada a Groq + errores) para no duplicar en las 3 rutas LLM, y
  `llm-client.ts` (`postLlm` con header BYOK) reusado por ask-question/suggest/explain.
  Verificado vía API: suggest devuelve preguntas variadas (cache HIT en repetición),
  explain da texto claro, `/api/sql` intacto tras el refactor. UI verificada por
  build/types/lint/69 tests (la corrida visual quedó pendiente: el dev server local
  ocupa el puerto y bloquea el MCP de preview).
- [x] **Paso 4 · Persistencia local de sesión** — la conversación y las tablas
  cargadas sobreviven un refresh (`session-store.ts`). Como DuckDB es en memoria, se
  guardan los **bytes del CSV en base64** + metadatos en `localStorage` y en refresh se
  **re-registran en DuckDB**. Diseño desacoplado: `page.tsx` persiste las tablas;
  `query-console.tsx` persiste sus turnos etiquetados con una **firma de las tablas**
  (`tablesSignature`) — al restaurar solo rehidrata si la firma coincide, así cargar
  otro dataset no revive resultados obsoletos. Solo modo Archivo (Postgres nunca se
  persiste: no guardamos credenciales); enlaces compartidos tienen prioridad y no
  pisan la sesión guardada; fallos de cuota degradan sin romper. Tests: base64
  round-trip (acentos, buffers grandes), validadores, firma. **Verificado en navegador
  con reload real**: tabla (card + chip + metadatos de DuckDB), conversación y
  resultado (gráfica) restaurados. Total: 79 tests.
- [x] **Paso 5 · Dashboard de resultados** — botón "Fijar al tablero" en cada resultado
  guarda la tarjeta (pregunta + interpretación + SQL + resultado) en un store reactivo
  (`dashboard-store.ts`, `useSyncExternalStore` + `localStorage`). La ruta `/dashboard`
  re-renderiza cada tarjeta con `QueryResults` (gráfica/tabla + export) **sin
  re-consultar** —el resultado ya está guardado—, con reordenar (subir/bajar), quitar y
  "limpiar tablero". Enlace "Tablero (N)" reactivo en el header. Lógica de arreglo pura
  y testeada (add idempotente, remove, move con no-ops en los extremos, sin mutación).
  **Verificado en navegador**: fijar actualiza conteo + botón reactivamente entre
  componentes; 2 tarjetas renderizan sus gráficas desde datos guardados; reordenar y
  quitar persisten y sobreviven un reload. Total: 89 tests.
- [ ] **Paso 6 · Infra compartida (si hay tráfico real)** — mover rate limit y cache a
  Upstash Redis (free tier) para que sobrevivan cold starts y se compartan entre
  instancias; hoy son por-instancia y está documentado como limitación consciente.
  **Diferido a propósito:** es infraestructura sin beneficio visible sin tráfico real;
  no vale la pena para un portafolio hoy. Se retoma solo si el demo empieza a recibir uso.
  (**Resuelto en v6 · paso 2**: rate limit + caches ahora usan Upstash Redis si se
  configuran las variables de entorno, con fallback en memoria.)

> **v4 cerrada** (pasos 1–5 completos; el 6 queda condicional). La app vive en
> **askql.vercel.app**; README actualizado a v1–v4. Total de tests: **89**.

---

## Roadmap v5 — Alcance y pulido

Tres extras posteriores a v4, cada uno funcional y demostrable por sí solo. No amplían
la arquitectura; suben el alcance del portafolio (bilingüe), la riqueza del demo (datos)
y la sensación de exploración guiada (seguimientos).

- [x] **Paso 1 · Interfaz bilingüe (ES/EN)** — sistema i18n propio **sin dependencia**
  (`i18n.tsx`): `LanguageProvider` + hooks `useLang`/`useT`, diccionarios tipados (`es`
  es la fuente de verdad y `en: Messages = typeof es` obliga a la misma forma),
  preferencia en `localStorage` (default español, aplicada tras el mount para no romper
  la hidratación). Switch `LanguageToggle` en el header de `/` y `/dashboard`. Traducida
  toda la UI de cara al usuario (página principal, tablero, ~10 componentes), incluido el
  formato de números por locale. El idioma **también viaja al modelo**: se añadió `lang`
  a los payloads de `/api/sql`, `/api/suggest`, `/api/explain` (y luego `/api/follow-up`)
  y `sql-prompt.ts` parametriza los prompts por idioma — el contrato JSON no cambia, solo
  el idioma del texto (interpretación, aclaración, sugerencias, explicación). Las claves
  de caché incluyen `lang` para no mezclar respuestas ES/EN. Verificado en navegador:
  toggle bidireccional, persistencia tras reload, y salida del modelo cambiando de idioma.
  `/eval` queda en español (herramienta interna).
- [x] **Paso 2 · Datos de ejemplo enriquecidos** — el CSV de ejemplo pasó de 41 filas/7
  columnas a **229 filas/13 columnas** de un año completo, añadiendo región▸ciudad▸
  cliente▸vendedor, método de pago, estado (completada/devuelta/pendiente) y precio/costo
  por unidad (habilita márgenes/ganancia). Se genera de forma determinista con
  `scripts/gen-sample.mjs` (PRNG sembrado) que además **imprime cada agregado** que fija
  la batería de una tabla → el CSV y `eval-cases.ts` nunca se desincronizan. `EVAL_CASES`
  recalculado + **5 casos nuevos** que ejercitan las columnas nuevas (ganancia total,
  top-vendedor, monto por región, por método de pago, ventas devueltas). Verificado por
  triple vía: cómputo del generador, parseo independiente del CSV en disco, y ejecución
  real en DuckDB vía la app (total 3,796,253 y ganancia 1,119,745 coincidieron). Beneficio:
  las preguntas sugeridas y de seguimiento se vuelven mucho más ricas.
- [x] **Paso 3 · Chips de seguimiento dinámicos** — nueva ruta `/api/follow-up` (mismo
  patrón que suggest/explain, reusa `api-groq.ts`) que recibe esquema + pregunta anterior
  + SQL y devuelve 2–3 refinamientos contextuales (filtrar por un valor, cambiar/añadir
  agrupación, desglosar por fecha, ordenar distinto, comparar). Prompt dedicado
  `FOLLOWUP_PROMPT` (ES/EN) y hook `fetchFollowUps`. En `query-console.tsx` un efecto los
  obtiene para el turno activo (keyed por `turnId`, con guarda anti-carrera) y se
  re-obtienen al cambiar de turno o idioma; se renderizan bajo "CONTINÚA CON" /
  "CONTINUE WITH". Al hacer clic corren como seguimiento (nuevo turno con historial).
  Cacheados server-side por hash `{tables, question, sql, lang}`. Verificado en navegador:
  chips contextuales que **encadenan** (cada resultado genera seguimientos nuevos), usan
  el historial, aprovechan las columnas nuevas, y el endpoint EN devuelve inglés.

> **v5 cerrada** (3/3 pasos). Los tres extras se verificaron en navegador; la suite de
> tests se mantiene en **89** (lógica pura sin cambios; lo nuevo es UI/prompts/ruta,
> cubierto por typecheck + verificación end-to-end).

---

## Roadmap v6 — Próximos pasos

Pendientes reales en orden de prioridad. El primero es un bug de contexto conocido; el
resto es el backlog que ya venía anotado.

- [x] **Paso 1 · Preguntas sugeridas con contexto multi-archivo** — con **un solo
  archivo** las sugerencias ("Prueba con") eran correctas, pero al **agregar más archivos**
  los chips no se regeneraban contemplando el nuevo esquema: seguían reflejando solo el
  primer archivo (y nunca proponían una pregunta con JOIN). Causa: en `query-console.tsx`
  el efecto que llama a `fetchSuggestions(tables, lang)` dependía solo de `[lang]`, así que
  no se re-disparaba cuando cambiaba `tables` (la consola se monta con `key={mode}`, no por
  conjunto de tablas, por lo que agregar un archivo tampoco la remonta). Arreglo: se añadió
  `persistSig` (la firma `tablesSignature(allowedTableNames)` que ya existía para
  persistencia) a las dependencias del efecto → re-obtiene sugerencias al cambiar el
  conjunto de tablas. `/api/suggest` ya recibía todas las tablas y cachea por hash del
  esquema, sin cambios en backend. Verificado en navegador con 2 archivos (`ventas` +
  `metas` con `vendedor` compartido): al soltar el 2º archivo se dispara una nueva llamada
  a `/api/suggest` y las sugerencias se regeneran incluyendo una pregunta que cruza ambas
  tablas ("ranking de vendedores por antigüedad y logro de metas").
- [x] **Paso 2 · Infra compartida (rate limit + caches en Redis, opt-in)** — el rate limit
  y los cuatro caches (SQL, sugerencias, seguimientos, explicaciones) pasan a **Upstash
  Redis** cuando `UPSTASH_REDIS_REST_URL`/`TOKEN` están definidos, y caen al camino en
  memoria si no (detección automática en `src/lib/redis.ts`; el resto de la app no cambia).
  Piezas nuevas: `redis.ts` (cliente memoizado o `null`), `kv-cache.ts` (`createCache` async
  con backend Redis-o-LRU y TTL de 1 día); `rate-limit.ts` reescrito async (INCR+EXPIRE en
  Redis, o bucket en memoria). `resolveGroqAccess` y los caches se volvieron async → `await`
  en las 4 rutas LLM; `sql-cache` conserva sus funciones puras (clave/cacheable) y delega el
  almacenamiento. Tests de caché migrados a async (89/89 verdes). **Verificado el fallback
  en memoria end-to-end** (MISS→HIT en `/api/suggest`, UI OK); el camino Redis quedó
  implementado pero **sin verificar** (requiere credenciales Upstash + variables en Vercel).

### Backlog (ideas sueltas, si sobra tiempo)
- Streaming de la respuesta del LLM (mejora percepción de velocidad; el JSON
  estructurado lo complica).
- Entrada Parquet (DuckDB lo lee nativo; solo falta el camino de carga).
- Cargar todas las hojas de un Excel de golpe (hoy se elige una hoja por carga).
- Verificación end-to-end del modo Postgres contra una DB real sembrada (Docker).
