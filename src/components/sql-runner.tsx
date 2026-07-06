"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runQuery, type QueryResult } from "@/lib/run-query";

const DEFAULT_SQL =
  "SELECT cliente, SUM(monto) AS total\nFROM datos\nGROUP BY cliente\nORDER BY total DESC";

export function SqlRunner() {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      setResult(await runQuery(sql));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Error al ejecutar la consulta.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consola SQL (temporal · paso 1)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          className="w-full rounded-md border bg-transparent p-3 font-mono text-sm"
          rows={4}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
        />
        <Button type="button" onClick={() => void handleRun()} disabled={isRunning}>
          {isRunning ? "Ejecutando…" : "Ejecutar"}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {result.columns.map((column) => (
                    <TableHead key={column.name}>{column.name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row, i) => (
                  <TableRow key={i}>
                    {result.columns.map((column) => (
                      <TableCell key={column.name}>
                        {String(row[column.name] ?? "")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {result?.truncated && (
          <p className="text-xs text-muted-foreground">
            Mostrando los primeros {result.rowCount} resultados.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
