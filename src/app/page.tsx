"use client";

import { useEffect, useState } from "react";
import { CsvUpload } from "@/components/csv-upload";
import { Disclaimer } from "@/components/disclaimer";
import { QueryConsole } from "@/components/query-console";
import { SchemaPreview } from "@/components/schema-preview";
import { Section } from "@/components/section";
import { loadSampleTable, SAMPLE_CSV_NAME, type TableSchema } from "@/lib/csv-table";

export default function Home() {
  const [loaded, setLoaded] = useState<{ schema: TableSchema; fileName: string } | null>(
    null,
  );
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
        .then(setLoaded)
        .catch(() => {}) // keep the prefill on failure
        .finally(() => setLoadingSample(false));
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const isSample = loaded?.fileName === SAMPLE_CSV_NAME;
  const showSharedNotice = !loaded && !loadingSample && sharedQuestion !== null;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pt-12 pb-24">
        <header>
          <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
            AskQL
          </span>
          <h1 className="mt-3 text-3xl font-medium tracking-tight text-foreground">
            Pregúntale a tus datos
          </h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            Sube un CSV o Excel y pregunta en lenguaje natural. AskQL traduce tu
            pregunta a SQL, la ejecuta sobre tus datos y te devuelve los resultados
            en una tabla lista para exportar a Excel.
          </p>
          <div className="mt-8 h-px w-full bg-border" />
        </header>

        <div className="mt-8 flex flex-col gap-10">
          <Disclaimer />

          <Section index="01" label="DATOS">
            {loaded ? (
              <SchemaPreview
                schema={loaded.schema}
                fileName={loaded.fileName}
                onReset={() => setLoaded(null)}
              />
            ) : loadingSample ? (
              <p className="text-sm text-muted-foreground">Cargando datos de ejemplo…</p>
            ) : (
              <div className="space-y-3">
                {showSharedNotice && (
                  <p className="rounded-lg border border-primary/25 bg-accent/40 px-4 py-3 text-sm text-accent-foreground">
                    Recibiste una consulta compartida: «{sharedQuestion}». Sube tu
                    archivo para ejecutarla.
                  </p>
                )}
                <CsvUpload onLoaded={(schema, fileName) => setLoaded({ schema, fileName })} />
              </div>
            )}
          </Section>

          {loaded && (
            <Section index="02" label="CONSULTA">
              <QueryConsole
                key={loaded.fileName}
                schema={loaded.schema}
                isSample={isSample}
                initialQuestion={sharedQuestion ?? undefined}
                autoRun={autoRunShared}
              />
            </Section>
          )}
        </div>
      </main>
    </div>
  );
}
