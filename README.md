# AskQL

**AskQL** (ask + SQL) — dale tus datos, pregúntale en lenguaje natural, y obtén la
respuesta como una tabla o gráfica, con el SQL generado a la vista y export a
Excel/CSV.

**Demo en vivo: [askql.vercel.app](https://askql.vercel.app)** · sin registro, con
datos de ejemplo listos para probar.

Proyecto de portafolio — no es un SaaS. El objetivo es mostrar un flujo completo de
text-to-SQL con las decisiones de diseño que separan un demo real de un chatbot que
alucina números: un motor SQL de verdad, una batería de evaluación que mide precisión,
y seguridad en capas.

## Principio central

**El LLM nunca lee los datos, solo el esquema.** El modelo ve la estructura
(columnas, tipos, filas de muestra, valores categóricos) y genera SQL; un motor real
ejecuta la consulta, así que los resultados son exactos sin importar cuántas filas
tenga el dataset. El modelo traduce la intención — la aritmética la hace el motor.

Hay dos modos de datos:

- **Archivo (por defecto, local en el navegador):** el CSV/Excel se consulta con
  [DuckDB-WASM](https://github.com/duckdb/duckdb-wasm) dentro del navegador. **Los
  datos del usuario nunca salen de su máquina** — solo el esquema viaja al modelo.
- **Postgres (servidor):** el usuario conecta su propia base; la introspección y la
  ejecución ocurren en el servidor contra ella (aquí los datos sí salen del navegador,
  por lo que se recomienda un usuario de solo lectura). Es un modo opt-in con su propio
  aviso.

## Qué hace

- **Pregunta en lenguaje natural → SQL → resultado**, con interpretación en texto y el
  SQL generado colapsable y resaltado.
- **Múltiples archivos con JOINs** — carga varias tablas; el prompt detecta columnas
  homónimas como posibles llaves de join.
- **Gráfica automática** — heurística por los valores del resultado (línea para series
  temporales, barras para categóricas, tarjetas para métricas únicas).
- **Historial conversacional** — preguntas de seguimiento que se apoyan en las
  anteriores ("y ahora solo los de Monterrey").
- **Preguntas sugeridas** generadas del esquema para arrancar, y **chips de
  seguimiento** que tras cada resultado proponen refinamientos contextuales de esa
  consulta (desglosar por fecha, filtrar por un valor, comparar contra otro grupo).
- **"Explicar"** — SQL → lenguaje natural, el camino inverso.
- **Bilingüe (ES/EN)** — un switch cambia toda la interfaz *y* el idioma de lo que
  genera el modelo (interpretaciones, aclaraciones, sugerencias y explicaciones); la
  preferencia se guarda localmente.
- **SQL editable** — edita el SQL generado y re-ejecútalo por el mismo guard.
- **Tablero** — fija resultados como tarjetas reordenables (un entregable visual).
- **La sesión sobrevive un refresh** — tablas y conversación se guardan localmente.
- **Trae tu propia API key (BYOK)** — usa tu cuota de Groq y salta el límite compartido.
- **Export a XLSX/CSV** de cualquier resultado.

## Arquitectura

```
Navegador (modo Archivo)                    Vercel (serverless)
┌──────────────────────────────────┐        ┌────────────────────────────────┐
│ DuckDB-WASM (Web Worker)          │        │  /api/sql       (NL → SQL)     │
│   ← CSV/Excel del usuario         │  POST  │  /api/suggest   (sugerencias)  │
│ Validación SQL (guard)            │ ─────► │  /api/follow-up (seguimiento)  │ ──► Groq
│ Ejecución + resultados + gráfica  │ ◄───── │  /api/explain   (explicación)  │     (LLM)
│ Persistencia local · Tablero      │        │  rate limit · Zod · cache      │
└──────────────────────────────────┘        └────────────────────────────────┘
                                             Modo Postgres:
                                             /api/pg/schema · /api/pg/query
                                             (introspección + ejecución READ ONLY
                                              contra la base del usuario)
```

Un solo repo Next.js. En modo Archivo el cliente hace todo el trabajo de datos y el
servidor solo arma prompts, llama al LLM y valida su respuesta (nunca toca el CSV). En
modo Postgres, la ejecución se mueve al servidor pero **reutiliza el mismo prompt, el
mismo guard y la misma UI** — solo cambia el ejecutor de SQL que se inyecta.

## Flujo (modo Archivo)

1. **Ingesta** — el archivo se registra en DuckDB bajo un nombre de tabla saneado (el
   nombre real del archivo nunca toca SQL). Se extrae el esquema: columnas, tipos,
   filas de muestra y valores distintos de columnas de baja cardinalidad (para que el
   modelo sepa que `mes` vale `"Ago"`, no `"Agosto"`).
2. **Pregunta** — el backend arma un prompt con el esquema de todas las tablas y llama a
   Groq (`llama-3.3-70b-versatile`).
3. **Human-in-the-loop** — si la pregunta es ambigua y el modelo no puede asumir algo
   razonable, pide una aclaración en vez de adivinar; si asume algo, lo declara
   ("interpreté 'mejores' como mayor monto total").
4. **Validación de seguridad** (`sql-guard.ts`) — antes de ejecutar: un solo statement,
   debe empezar con `SELECT`/`WITH`, se bloquean palabras de escritura (`DROP`,
   `INSERT`, `PRAGMA`…) y funciones peligrosas (`read_csv`, `httpfs`, `pg_read`,
   `pg_sleep`…), y se rechaza cualquier referencia a una tabla no cargada. `LIMIT` y
   timeout forzados.
5. **Auto-corrección** — si el motor rechaza el SQL, el error real se reenvía al modelo
   para que corrija, hasta 2 veces.
6. **Resultado** — interpretación, SQL colapsable, gráfica/tabla, y export.

## Evaluación (precisión de ejecución)

La ruta **`/eval`** corre dos baterías fijas de preguntas por el pipeline real (modelo →
guard → ejecución) y puntúa la **precisión de ejecución**: compara el *conjunto de
resultados* del SQL generado con el esperado, no el texto del SQL (hay muchos SQL
correctos). Cubre una tabla (agregación, cálculo de ganancia, group by, filtros, top-N,
ambigüedad) y multi-tabla (JOINs de 2 y 3 tablas), midiendo cada una por separado. Es la
métrica que protege el prompt de regresiones y el argumento de que los números son
correctos, no plausibles.

El dataset de ejemplo de una tabla (`public/sample-data/ventas.csv`, 229 filas de un año
completo con región, vendedor, método de pago, estado y precio/costo por unidad) se
genera de forma determinista con [`scripts/gen-sample.mjs`](scripts/gen-sample.mjs), que
además imprime cada agregado que la batería fija — así el CSV y los valores esperados
nunca se desincronizan.

## Stack

- **Framework**: Next.js (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
  (`@base-ui/react`)
- **i18n (ES/EN)**: implementación propia con diccionarios tipados (sin dependencia),
  que también parametriza los prompts para que el modelo responda en el idioma activo
- **Motor de datos (cliente)**: `@duckdb/duckdb-wasm`, autoalojado en `public/duckdb/`
  (sin CDN en runtime)
- **Postgres (servidor)**: `pg` (node-postgres), ejecución en transacción `READ ONLY`
- **Resultados**: TanStack Table · **gráficas**: Recharts · **export**: SheetJS (`xlsx`)
- **Syntax highlighting**: shiki
- **LLM**: [Groq](https://console.groq.com) (`llama-3.3-70b-versatile`, free tier)
- **Validación**: Zod (request/response de la API y del propio SQL)
- **Tests**: Vitest (lógica pura + de seguridad) · **CI**: GitHub Actions

## Correr localmente

```bash
npm install
```

Crea `.env.local` con tu API key de [Groq](https://console.groq.com/keys):

```
GROQ_API_KEY=gsk_tu_key_aqui
```

Opcional — para que el rate limit y los caches se compartan entre instancias y
sobrevivan cold starts, agrega una instancia de [Upstash Redis](https://upstash.com)
(si no defines estas variables, se usa memoria por-instancia sin más):

```
UPSTASH_REDIS_REST_URL=https://tu-instancia.upstash.io
UPSTASH_REDIS_REST_TOKEN=tu_token
```

```bash
npm run dev      # http://localhost:3000
npm test         # tests unitarios (Vitest)
npm run typecheck
npm run lint
```

En la app puedes usar tu propio CSV/Excel o el botón "Usar datos de ejemplo" (un año de
ventas con 13 columnas; se regenera con `node scripts/gen-sample.mjs`). También puedes
cambiar la interfaz entre español e inglés con el switch ES/EN, y pegar tu propia API key
desde la UI (BYOK) para no depender del límite compartido.

## Decisiones y limitaciones conocidas

- **Rate limit y caches: en memoria por defecto, Redis opcional**: sin configurar son
  por-instancia y se reinician en cada cold start (simplificación intencional para un demo
  de bajo tráfico). Si defines `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, el rate
  limit y los caches (SQL, sugerencias, seguimientos, explicaciones) pasan a **Upstash
  Redis** — compartidos entre instancias serverless y persistentes entre cold starts. La
  detección es automática (`src/lib/redis.ts`); sin las variables, cae al camino en memoria
  sin cambios de comportamiento. (BYOK evita el límite por completo.)
- **Timeout de consultas (DuckDB) no cancela la ejecución en curso**: DuckDB-WASM no
  expone cancelación real para `query()`; el timeout solo deja de esperar. Aceptable para
  un usuario único sobre su propio archivo.
- **Modo Postgres = los datos salen del navegador**: se aplican `READ ONLY`, límite de
  filas y timeout del lado servidor, pero la seguridad real es usar un usuario de solo
  lectura. La cadena de conexión se envía por consulta y no se persiste.
- **Persistencia local**: usa `localStorage` (bytes del CSV en base64); archivos muy
  grandes pueden exceder la cuota, en cuyo caso la sesión simplemente no se restaura.
- **CSV con datos sucios**: `read_csv_auto` infiere `VARCHAR` cuando una columna mezcla
  formatos (`$100`, `N/A`). El modelo ve el tipo real y puede necesitar `TRY_CAST` — es
  una prueba real de qué tan bien maneja datos del mundo real, no un caso que se oculte.

## Roadmap

Ver [PLAN.md](PLAN.md) para el detalle. **v1–v4 están completas**: ingesta y ejecución
con validación, gráficas e historial, multi-archivo con JOINs, Postgres, BYOK, cache,
set de evaluación, tests + CI, persistencia de sesión y tablero. Extras posteriores:
**interfaz bilingüe ES/EN** (UI + salida del modelo) y **chips de seguimiento dinámicos**.
El trabajo condicional restante (infra compartida en Redis) solo aplica si el demo recibe
tráfico real.
