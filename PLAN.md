# Text-to-SQL — Plan del proyecto

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
- [ ] **Paso 6 · Endurecimiento y deploy** — rate limit por IP, README de arquitectura, deploy a Vercel

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

## Trabajo futuro

### v2 — Experiencia
- **Gráfica automática** según la forma del resultado (serie temporal → línea,
  categorías → barras) con Recharts.
- **Historial conversacional**: preguntas de seguimiento ("y ahora solo los de CDMX")
  reutilizando el contexto.
- Aceptar XLSX como archivo de entrada (además de CSV).
- Compartir consulta por URL (esquema + pregunta codificados).

### v3 — Alcance
- **Múltiples archivos con JOINs** entre tablas (complica prompt y validación).
- Conexión a una base **Postgres real** (aquí sí aparece un backend de verdad:
  credenciales, usuario read-only, sandboxing).
- BYOK: que el usuario pegue su propia API key para uso sin límites.
- Cache de preguntas frecuentes para ahorrar tokens.

### Ideas sueltas (si sobra tiempo)
- Modo "explica esta consulta" (SQL → lenguaje natural, el camino inverso).
- Evaluación: set de preguntas de prueba con SQL esperado para medir precisión.
