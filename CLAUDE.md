# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start the dev server (Next.js, defaults to http://localhost:3000)
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint (flat config via `eslint.config.mjs`, extends `next/core-web-vitals` + `next/typescript`)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` / `npm run test:watch` — Vitest

## Tests

Vitest (`vitest.config.ts`, node environment, `src/**/*.test.ts`). The suite covers the
**pure** logic only — no DuckDB, no network, no DOM: `sql-guard` (the security
boundary), `table-name`, `sql-cache`, `chart-spec`, and `eval-compare`. Anything that
touches DuckDB or the model is exercised end-to-end by the `/eval` page instead.

Two modules exist specifically to keep that logic testable in isolation, and new pure
logic should follow the pattern rather than be inlined into an I/O module:
`src/lib/table-name.ts` (split out of `csv-table.ts`, which imports DuckDB) and
`src/lib/eval-compare.ts` (split out of `run-eval.ts`, which fetches and queries).

CI (`.github/workflows/ci.yml`) runs lint + typecheck + tests on every push and PR;
Vercel covers the production build.

## Architecture

A text-to-SQL tool: the user provides data, asks a question in natural language, an LLM turns the schema (never the data) into SQL, and a real engine runs it. The UI is in Spanish. There are two data modes:

- **Archivo (default, browser-local):** CSV/Excel is queried in the browser with DuckDB-WASM; data never leaves the browser. Only the schema is sent to the model.
- **Postgres (server):** the user connects a database; introspection and query execution run server-side against it (data does leave the browser — a read-only user is recommended).

SQL generation is a thin server proxy to Groq (`/api/sql`) so the API key stays server-side; everything data-related in Archivo mode is client (`"use client"`). Two sibling routes reuse the same Groq plumbing (`src/lib/api-groq.ts`): `/api/suggest` (schema → suggested questions) and `/api/explain` (SQL → plain-language explanation).

Data flow (Archivo mode):
1. `src/components/csv-upload.tsx` — drag/drop or file-picker (or a bundled sample from `public/sample-data/`), derives a unique table name and hands the `File` to `loadCsvAsTable`.
2. `src/lib/csv-table.ts` — registers the file in DuckDB and derives a `TableSchema` (columns + SQL types, row count, sample rows, and distinct values for low-cardinality text columns). This is the LLM context.
3. `src/components/schema-preview.tsx` — renders the schema and sample rows.
4. `src/app/page.tsx` — owns the mode, the list of loaded tables (add/remove), and the Postgres connection; wires the components together.

Postgres mode mirrors this shape: `src/lib/pg-server.ts` introspects into the same `TableSchema` and executes via `/api/pg/query` (read-only txn + timeout + row cap), so the prompt (`sql-prompt.ts`), guard (`sql-guard.ts`), and `QueryConsole` are reused unchanged — only the executor injected into `QueryConsole` (`runSql`) differs.

### Key invariants (don't break these)

- **DuckDB is a single shared async instance.** `src/lib/duckdb.ts` (`getDuckDB()`) memoizes one `AsyncDuckDB` behind a promise. Always go through it; never instantiate DuckDB directly.
- **DuckDB WASM assets are self-hosted** in `public/duckdb/` (copied from the `@duckdb/duckdb-wasm` dist) and referenced by absolute path in `MANUAL_BUNDLES`. There is no CDN fallback at runtime — if you bump the package, re-copy these files.
- **User input never touches SQL string interpolation.** Each uploaded file loads into its own table whose name comes from `deriveTableName` (sanitized to a safe SQL identifier and deduped), registered under a virtual filename derived from that same name — the user's real filename never reaches SQL. Table and column names are double-quoted at every use site. Multiple tables can coexist for cross-table JOINs; `validateSelectOnly(sql, allowedTables)` additionally rejects reads from any table that isn't loaded. Preserve these patterns when adding queries.
- **DATE/TIMESTAMP values arrive as epoch-ms numbers** (via Arrow), not `Date` objects. `serializeValue` in `csv-table.ts` formats them by keying off the column's SQL type, not the runtime type — follow that approach for any new value handling.

## Conventions

- TypeScript path alias `@/*` → `src/*`.
- UI is shadcn (style `base-nova`, see `components.json`) built on **`@base-ui/react`, not Radix**. Primitives live in `src/components/ui/`; icons from `lucide-react`; `cn()` from `src/lib/utils.ts` for class merging. Tailwind v4 (config-less, via `@tailwindcss/postcss`).
