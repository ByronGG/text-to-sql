"use client";

import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Download, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResultChart } from "@/components/result-chart";
import { deriveChartSpec } from "@/lib/chart-spec";
import { exportQueryResult } from "@/lib/export-results";
import { useT } from "@/lib/i18n";
import type { QueryResult } from "@/lib/run-query";
import { cn } from "@/lib/utils";

interface QueryResultsProps {
  result: QueryResult;
  fileNameBase?: string;
}

const PAGE_SIZE = 10;

export function QueryResults({ result, fileNameBase }: QueryResultsProps) {
  const t = useT();
  const base = fileNameBase ?? t.console.resultsFileBase;
  const [sorting, setSorting] = useState<SortingState>([]);
  const chartSpec = useMemo(() => deriveChartSpec(result), [result]);
  const hasChart = chartSpec.kind !== "none";
  const [view, setView] = useState<"chart" | "table">(hasChart ? "chart" : "table");
  const chartLabel = chartSpec.kind === "metric" ? t.results.summaryLabel : t.results.chartLabel;

  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      result.columns.map((column) => ({
        accessorKey: column.name,
        header: column.name,
        cell: (info) => String(info.getValue() ?? ""),
      })),
    [result.columns],
  );

  const table = useReactTable({
    data: result.rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t.results.rows(result.rowCount.toLocaleString(t.locale), result.rowCount)}
          {result.truncated && t.results.truncated}
        </p>
        <div className="flex items-center gap-2">
          {hasChart && (
            <div className="inline-flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setView("chart")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                  view === "chart"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <BarChart3 className="size-3.5" /> {chartLabel}
              </button>
              <button
                type="button"
                onClick={() => setView("table")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                  view === "table"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Table2 className="size-3.5" /> {t.results.tableLabel}
              </button>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => exportQueryResult(result, "csv", base)}
          >
            <Download className="size-4" /> {t.results.csv}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => exportQueryResult(result, "xlsx", base)}
          >
            <Download className="size-4" /> {t.results.excel}
          </Button>
        </div>
      </div>

      {hasChart && view === "chart" ? (
        <ResultChart spec={chartSpec} result={result} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="cursor-pointer select-none"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span className="inline-flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === "asc" && (
                            <ArrowUp className="size-3.5" />
                          )}
                          {header.column.getIsSorted() === "desc" && (
                            <ArrowDown className="size-3.5" />
                          )}
                          {!header.column.getIsSorted() && (
                            <ArrowUpDown className="size-3.5 opacity-30" />
                          )}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="font-mono text-xs">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t.results.page(table.getState().pagination.pageIndex + 1, table.getPageCount() || 1)}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                {t.results.prev}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                {t.results.next}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
