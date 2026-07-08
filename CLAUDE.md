# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start the dev server (Next.js, defaults to http://localhost:3000)
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint (flat config via `eslint.config.mjs`, extends `next/core-web-vitals` + `next/typescript`)

There is no test runner configured yet.

## Architecture

A browser-only text-to-SQL tool: the user uploads a CSV, it is queried locally with DuckDB-WASM, and the schema is extracted to give an LLM the context it needs to generate SQL. **No backend and no LLM/query-generation step exist yet** — the current app covers CSV ingestion and schema preview only. The UI is in Spanish.

Everything runs in the browser (`"use client"`); there are no server routes or server actions.

Data flow:
1. `src/components/csv-upload.tsx` — drag/drop or file-picker (or a bundled sample from `public/sample-data/`), hands the `File` to `loadCsvAsTable`.
2. `src/lib/csv-table.ts` — registers the file in DuckDB and derives a `TableSchema` (columns + SQL types, row count, sample rows, and distinct values for low-cardinality text columns). This is the object intended to become LLM context.
3. `src/components/schema-preview.tsx` — renders the schema and sample rows.
4. `src/app/page.tsx` — owns the list of loaded tables (add/remove) and wires the components together.

### Key invariants (don't break these)

- **DuckDB is a single shared async instance.** `src/lib/duckdb.ts` (`getDuckDB()`) memoizes one `AsyncDuckDB` behind a promise. Always go through it; never instantiate DuckDB directly.
- **DuckDB WASM assets are self-hosted** in `public/duckdb/` (copied from the `@duckdb/duckdb-wasm` dist) and referenced by absolute path in `MANUAL_BUNDLES`. There is no CDN fallback at runtime — if you bump the package, re-copy these files.
- **User input never touches SQL string interpolation.** Each uploaded file loads into its own table whose name comes from `deriveTableName` (sanitized to a safe SQL identifier and deduped), registered under a virtual filename derived from that same name — the user's real filename never reaches SQL. Table and column names are double-quoted at every use site. Multiple tables can coexist for cross-table JOINs; `validateSelectOnly(sql, allowedTables)` additionally rejects reads from any table that isn't loaded. Preserve these patterns when adding queries.
- **DATE/TIMESTAMP values arrive as epoch-ms numbers** (via Arrow), not `Date` objects. `serializeValue` in `csv-table.ts` formats them by keying off the column's SQL type, not the runtime type — follow that approach for any new value handling.

## Conventions

- TypeScript path alias `@/*` → `src/*`.
- UI is shadcn (style `base-nova`, see `components.json`) built on **`@base-ui/react`, not Radix**. Primitives live in `src/components/ui/`; icons from `lucide-react`; `cn()` from `src/lib/utils.ts` for class merging. Tailwind v4 (config-less, via `@tailwindcss/postcss`).
