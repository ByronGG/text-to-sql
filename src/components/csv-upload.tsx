"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadCsvAsTable, type TableSchema } from "@/lib/csv-table";

const SAMPLE_CSV_URL = "/sample-data/ventas.csv";
const SAMPLE_CSV_NAME = "ventas-ejemplo.csv";

interface CsvUploadProps {
  onLoaded: (schema: TableSchema, fileName: string) => void;
}

export function CsvUpload({ onLoaded }: CsvUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setError(null);
      try {
        const schema = await loadCsvAsTable(file);
        onLoaded(schema, file.name);
      } catch (err) {
        setError(
          err instanceof Error
            ? `No se pudo procesar el archivo: ${err.message}`
            : "No se pudo procesar el archivo.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [onLoaded],
  );

  const handleSample = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(SAMPLE_CSV_URL);
      const blob = await response.blob();
      const file = new File([blob], SAMPLE_CSV_NAME, { type: "text/csv" });
      const schema = await loadCsvAsTable(file);
      onLoaded(schema, file.name);
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo cargar el ejemplo: ${err.message}`
          : "No se pudo cargar el ejemplo.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [onLoaded]);

  return (
    <Card>
      <CardContent className="pt-6">
        <div
          className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
            isDragging ? "border-primary bg-muted/50" : "border-muted-foreground/25"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
        >
          <p className="text-sm text-muted-foreground">
            Arrastra tu archivo CSV aquí, o
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              disabled={isLoading}
              onClick={() => inputRef.current?.click()}
            >
              {isLoading ? "Procesando…" : "Elegir archivo"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isLoading}
              onClick={() => void handleSample()}
            >
              Usar datos de ejemplo
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
