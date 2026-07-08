"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ApiKeyDialog } from "@/components/api-key-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SqlCodeBlock } from "@/components/sql-code-block";
import { loadSampleTable } from "@/lib/csv-table";
import { EVAL_CASES } from "@/lib/eval-cases";
import { runEvalCase, type CaseOutcome, type CaseStatus } from "@/lib/run-eval";
import { cn } from "@/lib/utils";

type Phase = "idle" | "loading-data" | "running" | "done";

const STATUS_LABEL: Record<CaseStatus, string> = {
  pass: "OK",
  fail: "Falló",
  error: "Error",
};

function StatusBadge({ status }: { status: CaseStatus }) {
  const className =
    status === "pass"
      ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400"
      : status === "fail"
        ? "bg-destructive/10 text-destructive"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return <Badge className={cn("font-mono", className)}>{STATUS_LABEL[status]}</Badge>;
}

export default function EvalPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcomes, setOutcomes] = useState<Record<string, CaseOutcome>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const done = Object.values(outcomes);
    const passed = done.filter((o) => o.status === "pass").length;
    return {
      passed,
      total: EVAL_CASES.length,
      completed: done.length,
      accuracy: done.length ? Math.round((passed / done.length) * 100) : 0,
    };
  }, [outcomes]);

  async function runAll() {
    setPhase("loading-data");
    setOutcomes({});
    setFatalError(null);
    setExpanded(null);

    let schema;
    try {
      const loaded = await loadSampleTable();
      schema = loaded.schema;
    } catch (err) {
      setFatalError(
        `No se pudo cargar el dataset de ejemplo: ${err instanceof Error ? err.message : "error desconocido"}`,
      );
      setPhase("idle");
      return;
    }

    setPhase("running");
    // Sequential so progress is visible and we send exactly one API request at
    // a time (the /api/sql rate limit is 20 requests per 10-minute window).
    for (const evalCase of EVAL_CASES) {
      setRunningId(evalCase.id);
      const outcome = await runEvalCase(evalCase, schema);
      setOutcomes((prev) => ({ ...prev, [evalCase.id]: outcome }));
    }
    setRunningId(null);
    setPhase("done");
  }

  const isRunning = phase === "loading-data" || phase === "running";

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pt-12 pb-24">
        <header>
          <div className="flex items-center justify-between gap-4">
            <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
              AskQL · EVAL
            </span>
            <ApiKeyDialog />
          </div>
          <h1 className="mt-3 text-3xl font-medium tracking-tight text-foreground">
            Precisión de ejecución
          </h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            Batería fija de {EVAL_CASES.length} preguntas sobre el CSV de ejemplo. Cada
            una corre por el pipeline real (modelo → validación → DuckDB) y se compara el{" "}
            <em>resultado</em> con el esperado, no el texto del SQL. Un intento por caso
            (sin auto-corrección), así que consume {EVAL_CASES.length} de las 20
            solicitudes del límite compartido por ventana —o ninguna si configuras tu
            propia API key.
          </p>
          <div className="mt-8 h-px w-full bg-border" />
        </header>

        <div className="mt-8 flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Button type="button" onClick={() => void runAll()} disabled={isRunning}>
              {phase === "loading-data"
                ? "Cargando datos…"
                : phase === "running"
                  ? `Corriendo… (${summary.completed}/${summary.total})`
                  : phase === "done"
                    ? "Volver a correr"
                    : "Correr evaluación"}
            </Button>
            {(phase === "running" || phase === "done") && (
              <div className="flex items-baseline gap-3 font-mono text-sm">
                <span className="text-2xl font-medium text-foreground">
                  {summary.accuracy}%
                </span>
                <span className="text-muted-foreground">
                  {summary.passed}/{summary.completed} correctas
                </span>
              </div>
            )}
          </div>

          {fatalError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {fatalError}
            </p>
          )}

          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {EVAL_CASES.map((evalCase) => {
              const outcome = outcomes[evalCase.id];
              const isCaseRunning = runningId === evalCase.id;
              const isOpen = expanded === evalCase.id;
              return (
                <div key={evalCase.id} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : evalCase.id)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <span className="mt-0.5 shrink-0">
                      {isOpen ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {evalCase.category}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-foreground">
                        {evalCase.question}
                      </span>
                    </span>
                    <span className="shrink-0">
                      {outcome ? (
                        <StatusBadge status={outcome.status} />
                      ) : isCaseRunning ? (
                        <Badge variant="secondary" className="animate-pulse font-mono">
                          …
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="font-mono text-muted-foreground">
                          —
                        </Badge>
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mt-3 space-y-3 pl-7 text-sm">
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">Esperado:</span>{" "}
                        {evalCase.note}
                      </p>
                      {outcome && (
                        <p
                          className={cn(
                            outcome.status === "pass"
                              ? "text-muted-foreground"
                              : "text-foreground",
                          )}
                        >
                          <span className="font-medium">Resultado:</span> {outcome.detail}
                        </p>
                      )}
                      {outcome?.clarification && (
                        <Card className="bg-muted/40">
                          <CardContent className="py-3 text-sm text-muted-foreground">
                            “{outcome.clarification}”
                          </CardContent>
                        </Card>
                      )}
                      {outcome?.sql && <SqlCodeBlock sql={outcome.sql} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
