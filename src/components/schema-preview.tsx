import { RotateCcw } from "lucide-react";
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
  onReset: () => void;
}

export function SchemaPreview({ schema, fileName, onReset }: SchemaPreviewProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>{fileName}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {schema.rowCount.toLocaleString("es-MX")} filas · {schema.columns.length} columnas
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className="size-3" /> Cambiar archivo
        </button>
      </CardHeader>
      <CardContent className="space-y-6">
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
          <h3 className="mb-2 text-sm font-medium">Muestra de datos</h3>
          <div className="overflow-x-auto rounded-md border">
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
        </div>
      </CardContent>
    </Card>
  );
}
