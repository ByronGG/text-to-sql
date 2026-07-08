"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TableSchema } from "@/lib/csv-table";

interface SchemaPreviewProps {
  schema: TableSchema;
  fileName: string;
  onRemove: () => void;
}

export function SchemaPreview({ schema, fileName, onRemove }: SchemaPreviewProps) {
  const [showSample, setShowSample] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <span className="truncate">{fileName}</span>
            <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.7rem] text-secondary-foreground">
              {schema.tableName}
            </span>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {schema.rowCount.toLocaleString("es-MX")} filas · {schema.columns.length} columnas
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3" /> Quitar
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="mb-2 text-sm font-medium">Columnas detectadas</h3>
          <div className="flex flex-wrap gap-2">
            {schema.columns.map((column) => (
              <Badge key={column.name} variant="secondary" className="gap-1.5 font-normal">
                <span className="font-medium">{column.name}</span>
                <span className="font-mono text-[0.7rem] text-muted-foreground">{column.type}</span>
                {column.categoricalValues && (
                  <span className="text-muted-foreground">
                    · {column.categoricalValues.length} valores
                  </span>
                )}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowSample((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {showSample ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Muestra de datos
          </button>
          {showSample && (
            <div className="mt-2 overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {schema.columns.map((column) => (
                      <TableHead key={column.name}>{column.name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schema.sampleRows.map((row, i) => (
                    <TableRow key={i}>
                      {schema.columns.map((column) => (
                        <TableCell key={column.name} className="font-mono text-xs">
                          {String(row[column.name] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
