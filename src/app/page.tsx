"use client";

import { useState } from "react";
import { CsvUpload } from "@/components/csv-upload";
import { SchemaPreview } from "@/components/schema-preview";
import { SqlRunner } from "@/components/sql-runner";
import type { TableSchema } from "@/lib/csv-table";

export default function Home() {
  const [loaded, setLoaded] = useState<{ schema: TableSchema; fileName: string } | null>(
    null,
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-16">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Text-to-SQL</h1>
          <p className="text-muted-foreground">
            Sube un CSV y pregúntale a tus datos en lenguaje natural.
          </p>
        </div>

        <CsvUpload
          onLoaded={(schema, fileName) => setLoaded({ schema, fileName })}
        />

        {loaded && <SchemaPreview schema={loaded.schema} fileName={loaded.fileName} />}
        {loaded && <SqlRunner />}
      </main>
    </div>
  );
}
