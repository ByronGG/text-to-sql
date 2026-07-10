"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { ApiKeyDialog } from "@/components/api-key-dialog";
import { CsvUpload } from "@/components/csv-upload";
import { Disclaimer } from "@/components/disclaimer";
import { PgConnect } from "@/components/pg-connect";
import { QueryConsole } from "@/components/query-console";
import { SchemaPreview } from "@/components/schema-preview";
import { Section } from "@/components/section";
import {
  dropTable,
  loadCsvAsTable,
  loadSampleTable,
  SAMPLE_CSV_NAME,
  type TableSchema,
} from "@/lib/csv-table";
import { useDashboard } from "@/lib/dashboard-store";
import { runPgQuery } from "@/lib/pg-client";
import {
  clearTables,
  clearTurns,
  decodeBase64,
  fileToBase64,
  loadTables,
  saveTables,
} from "@/lib/session-store";
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
  // True until the mount effect finishes deciding shared-link vs restore, so we
  // never persist over a saved session before it's had a chance to load.
  const [restoring, setRestoring] = useState(true);
  // Cached base64 of each loaded table's CSV, so re-persisting on every change
  // doesn't re-encode the files.
  const fileB64Ref = useRef<Map<string, string>>(new Map());
  const pinnedCount = useDashboard().length;

  // On mount: a shared link takes precedence (auto-load, don't restore);
  // otherwise re-register any persisted tables into DuckDB. `window` is unavailable
  // during SSR, so this must run in an effect. setState-in-effect is intended here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");

    if (q) {
      setSharedQuestion(q);
      // Sample links are fully reproducible, so auto-load the data and run.
      // Own-file links can't carry data — we only prefill the question.
      if (params.get("sample") === "1") {
        setAutoRunShared(true);
        setLoadingSample(true);
        loadSampleTable()
          .then((loaded) => setTables([{ schema: loaded.schema, fileName: loaded.fileName }]))
          .catch(() => {})
          .finally(() => setLoadingSample(false));
      }
      setRestoring(false);
      return;
    }

    const saved = loadTables();
    if (!saved) {
      setRestoring(false);
      return;
    }
    (async () => {
      try {
        const restored: LoadedTable[] = [];
        for (const t of saved) {
          // Uint8Array is a valid BlobPart at runtime; the cast placates a
          // recent lib.dom narrowing (ArrayBufferLike vs ArrayBuffer).
          const bytes = decodeBase64(t.csvBase64) as unknown as BlobPart;
          const file = new File([bytes], `${t.tableName}.csv`, { type: "text/csv" });
          const schema = await loadCsvAsTable(file, t.tableName);
          fileB64Ref.current.set(t.tableName, t.csvBase64);
          restored.push({ schema, fileName: t.fileName });
        }
        if (restored.length > 0) setTables(restored);
        else clearTables();
      } catch {
        clearTables(); // corrupt payload — start clean
      } finally {
        setRestoring(false);
      }
    })();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist the loaded tables (with their bytes) whenever they change — Archivo
  // mode only, and never during restore or a shared-link visit.
  useEffect(() => {
    if (restoring || mode !== "file" || sharedQuestion !== null) return;
    if (tables.length === 0) {
      clearTables();
      clearTurns();
      return;
    }
    saveTables(
      tables.map((t) => ({
        tableName: t.schema.tableName,
        fileName: t.fileName,
        csvBase64: fileB64Ref.current.get(t.schema.tableName) ?? "",
      })),
    );
  }, [tables, restoring, mode, sharedQuestion]);

  const existingTableNames = tables.map((t) => t.schema.tableName);
  const activeTables = mode === "file" ? tables.map((t) => t.schema) : pg?.tables ?? [];
  const hasData = activeTables.length > 0;
  const isSample = mode === "file" && tables.length === 1 && tables[0].fileName === SAMPLE_CSV_NAME;
  const showSharedNotice =
    mode === "file" && tables.length === 0 && !loadingSample && sharedQuestion !== null;
  const canPersist = mode === "file" && sharedQuestion === null && !restoring;

  async function addTable(schema: TableSchema, fileName: string, file: File) {
    try {
      fileB64Ref.current.set(schema.tableName, await fileToBase64(file));
    } catch {
      // If we can't encode it, the table still works this session; it just
      // won't be restorable after a refresh.
    }
    setTables((prev) => [...prev, { schema, fileName }]);
  }

  function removeTable(tableName: string) {
    // Drop from DuckDB in the background; update the UI immediately.
    void dropTable(tableName).catch(() => {});
    fileB64Ref.current.delete(tableName);
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
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <LayoutGrid className="size-3.5" />
                <span>Tablero{pinnedCount > 0 ? ` (${pinnedCount})` : ""}</span>
              </Link>
              <ApiKeyDialog />
            </div>
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
                key={mode}
                tables={activeTables}
                isSample={isSample}
                initialQuestion={mode === "file" ? sharedQuestion ?? undefined : undefined}
                autoRun={mode === "file" && autoRunShared}
                persist={canPersist}
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
