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
- [ ] **Paso 6c · Deploy a Vercel** — conectar el repo en vercel.com/new + env var `GROQ_API_KEY` (acción del dueño del repo)

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
  verificación responsive/accesibilidad, build + deploy.

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
- [ ] **Paso 2 · Múltiples archivos con JOINs** — `csv-upload` maneja una lista de
  archivos, cada uno a su propia tabla. Rompe el invariante de nombre fijo `datos`:
  hay que derivar nombres saneados (allowlist de caracteres, nunca interpolar el
  nombre crudo del archivo) y mantener un registro de tablas activas. El esquema de
  todas las tablas + pistas de llaves de join (columnas homónimas del mismo tipo) van
  al prompt; `sql-guard` valida que el SQL solo referencie tablas registradas. UI:
  lista de tablas cargadas con quitar/reemplazar.
- [ ] **Paso 3 · BYOK (trae tu propia key)** — campo opcional de API key en
  `localStorage`, enviado por header a `/api/sql`; si viene, la route la usa en lugar
  de `GROQ_API_KEY` y salta el rate limit. Nunca se persiste en el servidor. Protege
  contra el límite del free tier de Groq.
- [ ] **Paso 4 · Cache de preguntas** — hash de `(pregunta normalizada + huella del
  esquema)` → respuesta del LLM, en la route (o `localStorage` en cliente). Ahorra
  cuota sobre todo con los enlaces compartidos del dataset de ejemplo, reproducibles
  por diseño.
- [ ] **Paso 5 · Conexión a Postgres real** — el cierre grande y el único que cambia
  la arquitectura: aparece un backend con credenciales, usuario read-only, límites de
  filas/timeout del lado servidor. El argumento "tus datos nunca salen del navegador"
  ya no aplica en este modo, así que se presenta como un modo separado con su propio
  disclaimer. Máxima superficie de riesgo → va al final, apoyado en el eval del Paso 1
  para validar el prompt.

### Ideas sueltas (si sobra tiempo)
- Modo "explica esta consulta" (SQL → lenguaje natural, el camino inverso). Barato,
  se puede colar en cualquier hueco.
- Streaming de la respuesta del LLM (mejora percepción de velocidad; el JSON
  estructurado lo complica).
