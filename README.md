# AskQL

**AskQL** (ask + SQL) — sube un CSV, pregúntale en lenguaje natural, y obtén tus
datos como los pediste: tabla, SQL generado a la vista y export a Excel/CSV listo
para Power BI.

Proyecto de portafolio — no es un SaaS. El objetivo es mostrar un flujo completo
de text-to-SQL con las decisiones de diseño que separan un demo real de un
chatbot que alucina números.

## Principio central

**El LLM nunca lee los datos, solo el esquema.** El CSV se carga en
[DuckDB-WASM](https://github.com/duckdb/duckdb-wasm) dentro del navegador; el
modelo únicamente ve la estructura (columnas, tipos, muestras, valores
categóricos) y genera SQL. Un motor real ejecuta la consulta, así que los
resultados son exactos sin importar cuántas filas tenga el archivo.

Consecuencia directa: **los datos del usuario nunca salen del navegador.** No
hay backend que reciba el CSV; el único servidor es un proxy sin estado hacia
el LLM.

## Arquitectura

```
Navegador                                    Vercel (serverless)
┌─────────────────────────────────┐         ┌──────────────────┐
│ DuckDB-WASM (Web Worker)         │         │  /api/sql         │
│  ← CSV del usuario               │  POST   │  - rate limit     │
│ Validación SQL (solo SELECT)     │ ──────► │  - prompt         │
│ Ejecución + resultados           │ ◄────── │  - valida con Zod │
│ Export XLSX/CSV                  │         └────────┬──────────┘
└───────────────────────────────────┘                  │
                                                        ▼
                                                  Groq (LLM)
```

Un solo repo Next.js. El cliente hace todo el trabajo de datos; el servidor
solo arma el prompt, llama al LLM y valida su respuesta — nunca toca el CSV.

## Flujo

1. **Ingesta** — el CSV se registra en DuckDB y se crea una tabla (`datos`).
   Se extrae el esquema: columnas, tipos SQL, filas de muestra, y los valores
   distintos de columnas de baja cardinalidad (para que el modelo sepa que la
   columna `mes` tiene valores como `"Ago"`, no `"Agosto"`).
2. **Pregunta** — el usuario escribe en lenguaje natural. El backend arma un
   prompt con el esquema y llama a Groq (`llama-3.3-70b-versatile`).
3. **Human-in-the-loop** — si la pregunta es ambigua y el modelo no puede
   asumir algo razonable, responde con una aclaración en vez de adivinar
   (se muestra como diálogo). Si sí puede asumir algo, lo declara explícitamente
   ("interpreté 'mejores' como mayor monto total").
4. **Validación de seguridad** — antes de ejecutar cualquier SQL generado por
   el LLM: un solo statement, debe empezar con `SELECT`/`WITH`, se bloquean
   palabras clave de escritura (`DROP`, `INSERT`, `PRAGMA`, ...) y funciones
   de acceso a archivos (`read_csv`, `httpfs`, ...). Se fuerza un `LIMIT` y un
   timeout.
5. **Auto-corrección** — si DuckDB rechaza el SQL (columna mal escrita, tipo
   incompatible), el error real se reenvía al modelo para que se corrija,
   hasta 2 veces antes de mostrar un error final.
6. **Resultado** — interpretación en texto, SQL generado (colapsable, con
   resaltado de sintaxis), tabla ordenable/paginada, y export a XLSX/CSV.

## Stack

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS v4 +
  shadcn/ui (`base-ui/react`)
- **Motor de datos**: `@duckdb/duckdb-wasm`, autoalojado en `public/duckdb/`
  (sin dependencia de un CDN en runtime)
- **Tabla de resultados**: TanStack Table
- **Export**: SheetJS (`xlsx`, build oficial parchado desde `cdn.sheetjs.com`)
- **Syntax highlighting**: shiki
- **LLM**: [Groq](https://console.groq.com) (`llama-3.3-70b-versatile`, free tier)
- **Validación**: Zod (request/response de la API y del propio SQL)
- **Rate limiting**: contador en memoria por IP (ver limitación abajo)

## Correr localmente

```bash
npm install
```

Crea `.env.local` con tu API key de [Groq](https://console.groq.com/keys):

```
GROQ_API_KEY=gsk_tu_key_aqui
```

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Puedes usar tu propio CSV
o el botón "Usar datos de ejemplo".

## Decisiones y limitaciones conocidas

- **Rate limit en memoria**: se reinicia en cada cold start y no se comparte
  entre instancias serverless — un atacante decidido podría sortearlo. Es una
  simplificación intencional para un demo de bajo tráfico; en producción real
  se reemplazaría por Upstash Redis (`@upstash/ratelimit`).
- **Timeout de consultas no cancela la ejecución en curso**: DuckDB-WASM no
  expone una cancelación real para `query()`; el timeout solo deja de esperar
  la respuesta. Aceptable para un usuario único ejecutando SQL sobre su propio
  archivo en su propio navegador.
- **CSV con datos sucios**: `read_csv_auto` infiere `VARCHAR` cuando una
  columna mezcla formatos (`$100`, `N/A`, texto). El LLM ve el tipo real y
  puede necesitar `TRY_CAST` en el SQL que genera — es una prueba real de
  qué tan bien maneja datos del mundo real, no un caso que se oculte.

## Roadmap

Ver [PLAN.md](PLAN.md) para el detalle de v1 (completa) y el trabajo futuro
planeado para v2/v3 (gráficas automáticas, historial conversacional, múltiples
archivos con JOINs, conexión a Postgres real).
