"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ApiKeyDialog } from "@/components/api-key-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SqlCodeBlock } from "@/components/sql-code-block";
import { loadFerreteriaSample, loadSampleTable, type TableSchema } from "@/lib/csv-table";
import { EVAL_CASES, JOIN_EVAL_CASES, type EvalCase } from "@/lib/eval-cases";
import { runEvalCase, type CaseOutcome, type CaseStatus } from "@/lib/run-eval";
import { cn } from "@/lib/utils";

interface Suite {
  id: string;
  label: string;
  description: string;
  cases: EvalCase[];
  load: () => Promise<TableSchema[]>;
}

const SUITES: Suite[] = [
  {
    id: "single",
    label: "Una tabla",
    description: "Preguntas sobre el CSV de ventas de ejemplo: agregación, group by, filtros, top-N y ambigüedad.",
    cases: EVAL_CASES,
    load: async () => [(await loadSampleTable()).schema],
  },
  {
    id: "join",
    label: "Multi-tabla (JOINs)",
    description: "Dataset relacional de una ferretería (proveedores · clientes · productos · ventas). Cada pregunta exige combinar 2 o 3 tablas.",
    cases: JOIN_EVAL_CASES,
    load: loadFerreteriaSample,
  },
];

const TOTAL_CASES = SUITES.reduce((n, s) => n + s.cases.length, 0);
const keyOf = (suiteId: string, caseId: string) => `${suiteId}:${caseId}`;

const STATUS_LABEL: Record<CaseStatus, string> = { pass: "OK", fail: "Falló", error: "Error" };

function StatusBadge({ status }: { status: CaseStatus }) {
  const className =
    status === "pass"
      ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400"
      : status === "fail"
        ? "bg-destructive/10 text-destructive"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return <Badge className={cn("font-mono", className)}>{STATUS_LABEL[status]}</Badge>;
}

function Accuracy({ passed, completed }: { passed: number; completed: number }) {
  const pct = completed ? Math.round((passed / completed) * 100) : 0;
  return (
    <div className="flex items-baseline gap-2 font-mono text-sm">
      <span className="text-xl font-medium text-foreground">{pct}%</span>
      <span className="text-muted-foreground">
        {passed}/{completed}
      </span>
    </div>
  );
}

export default function EvalPage() {
  const [outcomes, setOutcomes] = useState<Record<string, CaseOutcome>>({});
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [loadingSuiteId, setLoadingSuiteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const overall = useMemo(() => {
    const done = Object.values(outcomes);
    return { passed: done.filter((o) => o.status === "pass").length, completed: done.length };
  }, [outcomes]);

  function suiteStats(suite: Suite) {
    const done = suite.cases
      .map((c) => outcomes[keyOf(suite.id, c.id)])
      .filter((o): o is CaseOutcome => Boolean(o));
    return { passed: done.filter((o) => o.status === "pass").length, completed: done.length };
  }

  async function executeSuite(suite: Suite) {
    setLoadingSuiteId(suite.id);
    let tables: TableSchema[];
    try {
      tables = await suite.load();
    } catch (err) {
      setFatalError(
        `No se pudieron cargar las tablas de "${suite.label}": ${err instanceof Error ? err.message : "error desconocido"}`,
      );
      setLoadingSuiteId(null);
      throw err;
    }
    setLoadingSuiteId(null);

    // Sequential: one API request at a time so progress is visible and the
    // shared rate limit isn't hit in a burst.
    for (const evalCase of suite.cases) {
      const key = keyOf(suite.id, evalCase.id);
      setRunningKey(key);
      const outcome = await runEvalCase(evalCase, tables);
      setOutcomes((prev) => ({ ...prev, [key]: outcome }));
    }
    setRunningKey(null);
  }

  function clearSuite(suiteId: string) {
    setOutcomes((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${suiteId}:`))),
    );
  }

  async function runSuite(suite: Suite) {
    setBusy(true);
    setFatalError(null);
    clearSuite(suite.id);
    try {
      await executeSuite(suite);
    } catch {
      // fatalError already set
    } finally {
      setBusy(false);
      setRunningKey(null);
      setLoadingSuiteId(null);
    }
  }

  async function runAll() {
    setBusy(true);
    setFatalError(null);
    setOutcomes({});
    setExpanded(null);
    try {
      for (const suite of SUITES) await executeSuite(suite);
    } catch {
      // fatalError already set
    } finally {
      setBusy(false);
      setRunningKey(null);
      setLoadingSuiteId(null);
    }
  }

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
            Dos baterías, {TOTAL_CASES} preguntas: {EVAL_CASES.length} sobre una tabla y{" "}
            {JOIN_EVAL_CASES.length} multi-tabla que exigen JOINs. Cada una corre por el
            pipeline real (modelo → validación → DuckDB) y se compara el <em>resultado</em>{" "}
            con el esperado, no el texto del SQL. Un intento por caso, así que un full run
            son {TOTAL_CASES} solicitudes —conviene tu propia API key, y con el cache
            re-correr es gratis. También puedes correr cada batería por separado.
          </p>
          <div className="mt-8 h-px w-full bg-border" />
        </header>

        <div className="mt-8 flex flex-col gap-8">
          <div className="flex items-center gap-4">
            <Button type="button" onClick={() => void runAll()} disabled={busy}>
              {busy ? `Corriendo… (${overall.completed}/${TOTAL_CASES})` : "Correr todo"}
            </Button>
            {overall.completed > 0 && <Accuracy passed={overall.passed} completed={overall.completed} />}
          </div>

          {fatalError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {fatalError}
            </p>
          )}

          {SUITES.map((suite) => {
            const stats = suiteStats(suite);
            const isLoading = loadingSuiteId === suite.id;
            return (
              <section key={suite.id} className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-sm font-medium text-foreground">{suite.label}</h2>
                      <span className="font-mono text-xs text-muted-foreground">
                        {suite.cases.length} casos
                      </span>
                      {stats.completed > 0 && (
                        <Accuracy passed={stats.passed} completed={stats.completed} />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{suite.description}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void runSuite(suite)}
                    disabled={busy}
                    className="shrink-0"
                  >
                    {isLoading
                      ? "Cargando…"
                      : runningKey?.startsWith(`${suite.id}:`)
                        ? `Corriendo… (${stats.completed}/${suite.cases.length})`
                        : "Correr"}
                  </Button>
                </div>

                <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {suite.cases.map((evalCase) => {
                    const key = keyOf(suite.id, evalCase.id);
                    const outcome = outcomes[key];
                    const isCaseRunning = runningKey === key;
                    const isOpen = expanded === key;
                    return (
                      <div key={key} className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : key)}
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
                            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                              {evalCase.category}
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
                                  outcome.status === "pass" ? "text-muted-foreground" : "text-foreground",
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
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
