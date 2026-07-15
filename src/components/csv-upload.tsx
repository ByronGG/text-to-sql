"use client";

import { useCallback, useRef, useState } from "react";
import type { WorkBook } from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadCsvAsTable, loadSampleTable, type TableSchema } from "@/lib/csv-table";
import { useT } from "@/lib/i18n";
import { deriveTableName } from "@/lib/table-name";
import { isExcelFile, parseWorkbook, sheetToCsv, sheetToCsvFile, stripExtension } from "@/lib/xlsx-input";

interface CsvUploadProps {
  /** `file` is the exact CSV registered in DuckDB — the caller persists its
   * bytes so the table can be restored after a refresh. */
  onLoaded: (schema: TableSchema, fileName: string, file: File) => void;
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
  const t = useT();

  const loadCsvFile = useCallback(
    async (file: File, displayName: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const tableName = deriveTableName(displayName, existingTableNames);
        const schema = await loadCsvAsTable(file, tableName);
        onLoaded(schema, displayName, file);
      } catch (err) {
        setError(
          err instanceof Error
            ? t.upload.errorProcess(err.message)
            : t.upload.errorProcessGeneric,
        );
      } finally {
        setIsLoading(false);
      }
    },
    [onLoaded, existingTableNames, t],
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

  // Loads every sheet of the workbook at once, each as its own table (so they
  // can be joined). Empty sheets are skipped. Names are deduped within the batch
  // because `existingTableNames` (a prop) doesn't reflect the tables we add
  // mid-loop.
  const loadAllSheets = useCallback(
    async (choice: SheetChoice) => {
      setSheetChoice(null);
      setIsLoading(true);
      setError(null);
      try {
        const usedNames = [...existingTableNames];
        let loaded = 0;
        for (const sheetName of choice.sheetNames) {
          const csv = sheetToCsv(choice.workbook, sheetName);
          if (!csv.trim()) continue; // skip empty sheets
          const label = `${choice.displayName} · ${sheetName}`;
          const file = new File([csv], `${choice.baseName}-${sheetName}.csv`, { type: "text/csv" });
          const tableName = deriveTableName(label, usedNames);
          usedNames.push(tableName);
          const schema = await loadCsvAsTable(file, tableName);
          onLoaded(schema, label, file);
          loaded++;
        }
        if (loaded === 0) setError(t.upload.errorAllEmpty);
      } catch (err) {
        setError(
          err instanceof Error ? t.upload.errorProcess(err.message) : t.upload.errorProcessGeneric,
        );
      } finally {
        setIsLoading(false);
      }
    },
    [existingTableNames, onLoaded, t],
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
          setError(t.upload.errorNoSheets);
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
            ? t.upload.errorReadExcel(err.message)
            : t.upload.errorReadExcelGeneric,
        );
        setIsLoading(false);
      }
    },
    [loadCsvFile, loadSheet, t],
  );

  const handleSample = useCallback(async () => {
    setError(null);
    setSheetChoice(null);
    setIsLoading(true);
    try {
      const { schema, fileName, file } = await loadSampleTable(existingTableNames);
      onLoaded(schema, fileName, file);
    } catch {
      setError(t.upload.errorSample);
    } finally {
      setIsLoading(false);
    }
  }, [onLoaded, existingTableNames, t]);

  return (
    <Card>
      <CardContent>
        {sheetChoice ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {t.upload.sheetPrompt(sheetChoice.displayName)}
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
            <Button
              type="button"
              disabled={isLoading}
              onClick={() => void loadAllSheets(sheetChoice)}
            >
              {t.upload.loadAllSheets(sheetChoice.sheetNames.length)}
            </Button>
            <button
              type="button"
              onClick={() => setSheetChoice(null)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.upload.cancel}
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
              {isDragging ? t.upload.dropHere : t.upload.dragPrompt}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" disabled={isLoading} onClick={() => inputRef.current?.click()}>
                {isLoading ? t.upload.processing : t.upload.chooseFile}
              </Button>
              {existingTableNames.length === 0 && (
                <Button type="button" variant="secondary" disabled={isLoading} onClick={() => void handleSample()}>
                  {t.upload.useSample}
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
