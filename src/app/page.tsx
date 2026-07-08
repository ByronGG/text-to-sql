"use client";

import { useEffect, useState } from "react";
import { ApiKeyDialog } from "@/components/api-key-dialog";
import { CsvUpload } from "@/components/csv-upload";
import { Disclaimer } from "@/components/disclaimer";
import { PgConnect } from "@/components/pg-connect";
import { QueryConsole } from "@/components/query-console";
import { SchemaPreview } from "@/components/schema-preview";
import { Section } from "@/components/section";
import {
  dropTable,
  loadSampleTable,
  SAMPLE_CSV_NAME,
  type TableSchema,
} from "@/lib/csv-table";
import { runPgQuery } from "@/lib/pg-client";
import { cn } from "@/lib/utils";

type Mode = "file" | "postgres";

interface LoadedTable {
  schema: TableSchema;
  fileName: string;
}

interface PgConnection {
  connectionString: string;
  tables: TableSchema[];
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("file");
  const [tables, setTables] = useState<LoadedTable[]>([]);
  const [pg, setPg] = useState<PgConnection | null>(null);
  // From a shared link (`?q=...`, optionally `?sample=1`).
  const [sharedQuestion, setSharedQuestion] = useState<string | null>(null);
  const [autoRunShared, setAutoRunShared] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);

  // Reading the URL must happen after mount: `window` doesn't exist during SSR,
  // and doing it in a state initializer would cause a hydration mismatch. The
  // setState-in-effect lint rule is a false positive for this one-shot read.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (!q) return;
    setSharedQuestion(q);

    // Sample links are fully reproducible, so auto-load the data and run.
    // Own-file links can't carry data — we only prefill the question and let
    // the user re-upload their file.
    if (params.get("sample") === "1") {
      setAutoRunShared(true);
      setLoadingSample(true);
      loadSampleTable()
        .then((loaded) => setTables([loaded]))
        .catch(() => {}) // keep the prefill on failure
        .finally(() => setLoadingSample(false));
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const existingTableNames = tables.map((t) => t.schema.tableName);
  const activeTables = mode === "file" ? tables.map((t) => t.schema) : pg?.tables ?? [];
  const hasData = activeTables.length > 0;
  const isSample = mode === "file" && tables.length === 1 && tables[0].fileName === SAMPLE_CSV_NAME;
  const showSharedNotice =
    mode === "file" && tables.length === 0 && !loadingSample && sharedQuestion !== null;

  function addTable(schema: TableSchema, fileName: string) {
    setTables((prev) => [...prev, { schema, fileName }]);
  }

  function removeTable(tableName: string) {
    // Drop from DuckDB in the background; update the UI immediately.
    void dropTable(tableName).catch(() => {});
    setTables((prev) => prev.filter((t) => t.schema.tableName !== tableName));
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pt-12 pb-24">
        <header>
          <div className="flex items-center justify-between gap-4">
            <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
              AskQL
            </span>
            <ApiKeyDialog />
          </div>
          <h1 className="mt-3 text-3xl font-medium tracking-tight text-foreground">
            Pregúntale a tus datos
          </h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            Sube uno o varios archivos (CSV o Excel) o conéctate a una base Postgres, y
            pregunta en lenguaje natural. AskQL traduce tu pregunta a SQL —incluyendo
            joins entre tablas—, la ejecuta y te devuelve los resultados en una tabla
            lista para exportar a Excel.
          </p>
          <div className="mt-8 h-px w-full bg-border" />
        </header>

        <div className="mt-8 flex flex-col gap-10">
          <Disclaimer mode={mode} />

          <Section index="01" label="DATOS">
            <div className="space-y-4">
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {(["file", "postgres"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm transition-colors",
                      mode === m
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "file" ? "Archivo" : "Postgres"}
                  </button>
                ))}
              </div>

              {mode === "file" ? (
                <div className="space-y-4">
                  {tables.map((table) => (
                    <SchemaPreview
                      key={table.schema.tableName}
                      schema={table.schema}
                      fileName={table.fileName}
                      onRemove={() => removeTable(table.schema.tableName)}
                    />
                  ))}

                  {loadingSample ? (
                    <p className="text-sm text-muted-foreground">Cargando datos de ejemplo…</p>
                  ) : (
                    <div className="space-y-3">
                      {showSharedNotice && (
                        <p className="rounded-lg border border-primary/25 bg-accent/40 px-4 py-3 text-sm text-accent-foreground">
                          Recibiste una consulta compartida: «{sharedQuestion}». Sube tu
                          archivo para ejecutarla.
                        </p>
                      )}
                      {tables.length > 0 && (
                        <span className="block font-mono text-xs tracking-[0.15em] text-muted-foreground">
                          AGREGAR OTRO ARCHIVO
                        </span>
                      )}
                      <CsvUpload existingTableNames={existingTableNames} onLoaded={addTable} />
                    </div>
                  )}
                </div>
              ) : pg ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs tracking-[0.15em] text-muted-foreground">
                      CONECTADO · {pg.tables.length} tabla{pg.tables.length === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPg(null)}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Desconectar
                    </button>
                  </div>
                  {pg.tables.map((table) => (
                    <SchemaPreview key={table.tableName} schema={table} fileName={table.tableName} />
                  ))}
                </div>
              ) : (
                <PgConnect
                  onConnected={(pgTables, connectionString) =>
                    setPg({ tables: pgTables, connectionString })
                  }
                />
              )}
            </div>
          </Section>

          {hasData && (
            <Section index="02" label="CONSULTA">
              <QueryConsole
                tables={activeTables}
                isSample={isSample}
                initialQuestion={mode === "file" ? sharedQuestion ?? undefined : undefined}
                autoRun={mode === "file" && autoRunShared}
                runSql={
                  mode === "postgres" && pg
                    ? (sql, allowed) => runPgQuery(pg.connectionString, sql, allowed)
                    : undefined
                }
              />
            </Section>
          )}
        </div>
      </main>
    </div>
  );
}
