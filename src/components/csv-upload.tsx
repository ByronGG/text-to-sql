"use client";

import { useCallback, useRef, useState } from "react";
import type { WorkBook } from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadCsvAsTable, loadSampleTable, type TableSchema } from "@/lib/csv-table";
import { deriveTableName } from "@/lib/table-name";
import { isExcelFile, parseWorkbook, sheetToCsvFile, stripExtension } from "@/lib/xlsx-input";

interface CsvUploadProps {
  onLoaded: (schema: TableSchema, fileName: string) => void;
  /** Table names already loaded, so a new file gets a unique table name. */
  existingTableNames?: string[];
}

interface SheetChoice {
  workbook: WorkBook;
  sheetNames: string[];
  baseName: string;
  displayName: string;
}

export function CsvUpload({ onLoaded, existingTableNames = [] }: CsvUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetChoice, setSheetChoice] = useState<SheetChoice | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadCsvFile = useCallback(
    async (file: File, displayName: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const tableName = deriveTableName(displayName, existingTableNames);
        const schema = await loadCsvAsTable(file, tableName);
        onLoaded(schema, displayName);
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
    [onLoaded, existingTableNames],
  );

  const loadSheet = useCallback(
    async (choice: SheetChoice, sheetName: string) => {
      const csvFile = sheetToCsvFile(choice.workbook, sheetName, choice.baseName);
      setSheetChoice(null);
      // Only append the sheet name when the workbook had more than one — for a
      // single-sheet file the name is noise.
      const label =
        choice.sheetNames.length > 1
          ? `${choice.displayName} · ${sheetName}`
          : choice.displayName;
      await loadCsvFile(csvFile, label);
    },
    [loadCsvFile],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setSheetChoice(null);

      if (!isExcelFile(file)) {
        await loadCsvFile(file, file.name);
        return;
      }

      setIsLoading(true);
      try {
        const { workbook, sheetNames } = await parseWorkbook(file);
        if (sheetNames.length === 0) {
          setError("El archivo de Excel no tiene hojas.");
          setIsLoading(false);
          return;
        }
        const choice: SheetChoice = {
          workbook,
          sheetNames,
          baseName: stripExtension(file.name),
          displayName: file.name,
        };
        if (sheetNames.length === 1) {
          await loadSheet(choice, sheetNames[0]);
        } else {
          setSheetChoice(choice);
          setIsLoading(false);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? `No se pudo leer el Excel: ${err.message}`
            : "No se pudo leer el archivo de Excel.",
        );
        setIsLoading(false);
      }
    },
    [loadCsvFile, loadSheet],
  );

  const handleSample = useCallback(async () => {
    setError(null);
    setSheetChoice(null);
    setIsLoading(true);
    try {
      const { schema, fileName } = await loadSampleTable(existingTableNames);
      onLoaded(schema, fileName);
    } catch {
      setError("No se pudo cargar el ejemplo.");
    } finally {
      setIsLoading(false);
    }
  }, [onLoaded, existingTableNames]);

  return (
    <Card>
      <CardContent>
        {sheetChoice ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {sheetChoice.displayName} tiene varias hojas. ¿Cuál quieres analizar?
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {sheetChoice.sheetNames.map((name) => (
                <Button
                  key={name}
                  type="button"
                  variant="secondary"
                  disabled={isLoading}
                  onClick={() => void loadSheet(sheetChoice, name)}
                >
                  {name}
                </Button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSheetChoice(null)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div
            className={`flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center transition-colors ${
              isDragging ? "border-primary bg-accent/40" : "border-border"
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
              {isDragging ? "Suelta tu archivo aquí" : "Arrastra tu CSV o Excel aquí, o"}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" disabled={isLoading} onClick={() => inputRef.current?.click()}>
                {isLoading ? "Procesando…" : "Elegir archivo"}
              </Button>
              {existingTableNames.length === 0 && (
                <Button type="button" variant="secondary" disabled={isLoading} onClick={() => void handleSample()}>
                  Usar datos de ejemplo
                </Button>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm,.xlsb,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
          </div>
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
