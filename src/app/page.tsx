"use client";

import { useState } from "react";
import { CsvUpload } from "@/components/csv-upload";
import { Disclaimer } from "@/components/disclaimer";
import { QueryConsole } from "@/components/query-console";
import { SchemaPreview } from "@/components/schema-preview";
import { Section } from "@/components/section";
import type { TableSchema } from "@/lib/csv-table";

export default function Home() {
  const [loaded, setLoaded] = useState<{ schema: TableSchema; fileName: string } | null>(
    null,
  );

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
            ) : (
              <CsvUpload onLoaded={(schema, fileName) => setLoaded({ schema, fileName })} />
            )}
          </Section>

          {loaded && (
            <Section index="02" label="CONSULTA">
              <QueryConsole key={loaded.fileName} schema={loaded.schema} />
            </Section>
          )}
        </div>
      </main>
    </div>
  );
}
