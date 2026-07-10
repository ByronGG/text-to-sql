"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronRight, Lightbulb, Pencil, Pin, Share2, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryResults } from "@/components/query-results";
import { SqlCodeBlock } from "@/components/sql-code-block";
import { askQuestion } from "@/lib/ask-question";
import type { TableSchema } from "@/lib/csv-table";
import { pin, unpin, useDashboard } from "@/lib/dashboard-store";
import { fetchExplanation, fetchSuggestions } from "@/lib/llm-client";
import { runQuery, type QueryResult } from "@/lib/run-query";
import { loadTurns, saveTurns, tablesSignature } from "@/lib/session-store";
import { cn } from "@/lib/utils";

interface QueryConsoleProps {
  tables: TableSchema[];
  /** True when the loaded dataset is exactly the bundled sample, so shared
   * links can carry `sample=1` and auto-run on the recipient's side. */
  isSample: boolean;
  /** Prefills the input — used when arriving from a shared link. */
  initialQuestion?: string;
  /** Runs `initialQuestion` automatically on mount (only safe for the sample). */
  autoRun?: boolean;
  /** Executes the generated SQL. Defaults to the in-browser DuckDB engine;
   * Postgres mode injects a server-side executor instead. */
  runSql?: (sql: string, allowedTables: string[]) => Promise<QueryResult>;
  /** Persist the conversation to localStorage so it survives a refresh
   * (Archivo mode only — never for Postgres, whose creds we don't store). */
  persist?: boolean;
}

// Matches the API's history contract (only user/assistant turns).
type HistoryTurn = { role: "user" | "assistant"; content: string };

type Status = "idle" | "loading" | "clarification" | "error";

interface Turn {
  id: string;
  question: string;
  interpretation: string;
  sql: string;
  result: QueryResult;
}

interface Clarification {
  originalQuestion: string;
  question: string;
}

const MAX_RETRIES = 2;
// The API allows up to 20 history entries; 6 turns = 12 keeps us well under
// while giving the model enough context for follow-ups.
const HISTORY_TURNS = 6;

export function QueryConsole({
  tables,
  isSample,
  initialQuestion,
  autoRun,
  runSql = runQuery,
  persist = false,
}: QueryConsoleProps) {
  const allowedTableNames = tables.map((t) => t.tableName);
  const persistSig = tablesSignature(allowedTableNames);
  const dashboard = useDashboard();

  const [question, setQuestion] = useState(initialQuestion ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [clarification, setClarification] = useState<Clarification | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  // Suggested questions (LLM-generated from the schema, fetched once).
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Manual SQL editing on the active result.
  const [editingSql, setEditingSql] = useState(false);
  const [sqlDraft, setSqlDraft] = useState("");
  const [runningEdit, setRunningEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // Plain-language explanation of the active turn's SQL, keyed by turn.
  const [explanation, setExplanation] = useState<{ turnId: string; text: string } | null>(null);
  const [explaining, setExplaining] = useState(false);

  const active = turns.find((t) => t.id === activeId) ?? null;

  // Encodes prior turns as the same JSON shape the model must reply with, so
  // follow-up questions ("y ahora solo los de CDMX") can build on them.
  function buildHistory(): HistoryTurn[] {
    return turns.slice(-HISTORY_TURNS).flatMap((turn): HistoryTurn[] => [
      { role: "user", content: turn.question },
      {
        role: "assistant",
        content: JSON.stringify({
          tipo: "sql",
          consulta: turn.sql,
          interpretacion: turn.interpretation,
        }),
      },
    ]);
  }

  // Function declaration (not useCallback) so it can recurse by name for the
  // auto-correction retries without tripping the React Compiler linter.
  async function runAttempts(
    forQuestion: string,
    displayQuestion: string,
    history: HistoryTurn[],
    failedSql: { sql: string; error: string } | undefined,
    attempt: number,
  ) {
    setRetryAttempt(attempt);

    let response;
    try {
      response = await askQuestion({ question: forQuestion, tables, history, failedSql });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo contactar el servicio.");
      setStatus("error");
      return;
    }

    if (response.tipo === "aclaracion") {
      setClarification({ originalQuestion: forQuestion, question: response.pregunta_al_usuario });
      setStatus("clarification");
      return;
    }

    try {
      const result = await runSql(response.consulta, allowedTableNames);
      const turn: Turn = {
        id: crypto.randomUUID(),
        question: displayQuestion,
        interpretation: response.interpretacion,
        sql: response.consulta,
        result,
      };
      setTurns((prev) => [...prev, turn]);
      setActiveId(turn.id);
      setShowSql(false);
      setEditingSql(false);
      setQuestion("");
      setStatus("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido.";
      if (attempt < MAX_RETRIES) {
        await runAttempts(forQuestion, displayQuestion, history, { sql: response.consulta, error: message }, attempt + 1);
      } else {
        setErrorMessage(`No se pudo generar una consulta válida: ${message}`);
        setStatus("error");
      }
    }
  }

  async function handleAsk(preset?: string) {
    const text = (preset ?? question).trim();
    if (!text) return;
    if (preset) setQuestion(preset);
    setStatus("loading");
    setErrorMessage(null);
    await runAttempts(text, text, buildHistory(), undefined, 0);
  }

  // Runs the user's hand-edited SQL directly (skipping the model) through the
  // same guard + executor, adding it as a new turn.
  async function runEditedSql() {
    const sql = sqlDraft.trim();
    if (!sql || !active) return;
    setRunningEdit(true);
    setEditError(null);
    try {
      const result = await runSql(sql, allowedTableNames);
      const turn: Turn = {
        id: crypto.randomUUID(),
        question: `${active.question} · SQL editado`,
        interpretation: "Consulta editada manualmente.",
        sql,
        result,
      };
      setTurns((prev) => [...prev, turn]);
      setActiveId(turn.id);
      setEditingSql(false);
      setShowSql(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "El SQL no se pudo ejecutar.");
    } finally {
      setRunningEdit(false);
    }
  }

  async function handleExplain() {
    if (!active) return;
    setExplaining(true);
    try {
      const text = await fetchExplanation(active.sql, tables);
      setExplanation({ turnId: active.id, text });
    } catch (err) {
      setExplanation({
        turnId: active.id,
        text: err instanceof Error ? err.message : "No se pudo explicar la consulta.",
      });
    } finally {
      setExplaining(false);
    }
  }

  function togglePin() {
    if (!active) return;
    if (dashboard.some((c) => c.id === active.id)) {
      unpin(active.id);
    } else {
      pin({
        id: active.id,
        question: active.question,
        interpretation: active.interpretation,
        sql: active.sql,
        result: active.result,
      });
    }
  }

  function selectTurn(id: string) {
    setActiveId(id);
    setShowSql(false);
    setEditingSql(false);
  }

  // Auto-runs a shared question once on mount. Deferred to a timeout so the
  // state updates happen outside the effect body (not a synchronous setState).
  // The ref guard makes it fire exactly once even under StrictMode's
  // double-invoke; no cleanup, so that double-invoke can't cancel the timer.
  const didAutoRun = useRef(false);
  useEffect(() => {
    if (!autoRun || !initialQuestion || didAutoRun.current) return;
    didAutoRun.current = true;
    setTimeout(() => void handleAsk(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetches suggested questions once on mount (unless a shared question is
  // auto-running). The setState happens after an await, so it's not the
  // synchronous set-state-in-effect the lint warns about.
  const didFetchSuggestions = useRef(false);
  useEffect(() => {
    if (didFetchSuggestions.current || autoRun) return;
    didFetchSuggestions.current = true;
    fetchSuggestions(tables)
      .then(setSuggestions)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rehydrates a persisted conversation on mount, but only if it ran against the
  // same set of tables (signature match) — so loading a different dataset never
  // shows stale results. Declared before the persist effect so its read of
  // localStorage happens before the first save.
  const didHydrate = useRef(false);
  useEffect(() => {
    didHydrate.current = true;
    if (!persist) return;
    const saved = loadTurns();
    if (saved && saved.sig === persistSig && saved.turns.length > 0) {
      const restored = saved.turns as Turn[];
      // Deferred so the state updates land outside the effect body (same reason
      // as the auto-run effect): synchronous setState in an effect is flagged.
      setTimeout(() => {
        setTurns(restored);
        setActiveId(restored[restored.length - 1].id);
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persists the conversation on every change (after hydration, so we never
  // clobber saved turns with the initial empty state before restoring them).
  useEffect(() => {
    if (!persist || !didHydrate.current) return;
    saveTurns({ sig: persistSig, turns });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns]);

  async function handleShare() {
    if (!active) return;
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("q", active.question);
    if (isSample) url.searchParams.set("sample", "1");
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); silently ignore.
    }
  }

  async function handleClarificationSubmit() {
    if (!clarification || !clarificationAnswer.trim()) return;
    const answer = clarificationAnswer.trim();
    const combinedQuestion =
      `Pregunta original: "${clarification.originalQuestion}"\n` +
      `Aclaración pedida: "${clarification.question}"\n` +
      `Respuesta del usuario: "${answer}"`;

    setStatus("loading");
    setClarification(null);
    setClarificationAnswer("");
    await runAttempts(combinedQuestion, answer, buildHistory(), undefined, 0);
  }

  function clearThread() {
    setTurns([]);
    setActiveId(null);
    setQuestion("");
    setStatus("idle");
    setErrorMessage(null);
    setShowSql(false);
    setEditingSql(false);
    setExplanation(null);
  }

  const isLoading = status === "loading";

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder={
              turns.length > 0
                ? "Pregunta de seguimiento… (ej. y ahora solo los de Monterrey)"
                : "Ej. ¿Quiénes son mis mejores clientes de agosto?"
            }
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAsk();
            }}
            disabled={isLoading}
          />
          <Button type="button" onClick={() => void handleAsk()} disabled={isLoading || !question.trim()}>
            {isLoading ? "Pensando…" : "Preguntar"}
          </Button>
        </div>

        {turns.length === 0 && !isLoading && suggestions.length > 0 && (
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.15em] text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" /> PRUEBA CON
            </span>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void handleAsk(s)}
                  className="rounded-full border border-border px-3 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs tracking-[0.15em] text-muted-foreground">
                CONVERSACIÓN
              </span>
              <button
                type="button"
                onClick={clearThread}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Limpiar
              </button>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border border-border p-1">
              {turns.map((turn, i) => (
                <button
                  key={turn.id}
                  type="button"
                  onClick={() => selectTurn(turn.id)}
                  className={cn(
                    "flex items-baseline gap-2 truncate rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                    turn.id === activeId
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="font-mono text-xs text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate">{turn.question}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {retryAttempt === 0
                ? "Generando la consulta…"
                : `Corrigiendo la consulta (intento ${retryAttempt + 1} de ${MAX_RETRIES + 1})…`}
            </p>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {errorMessage && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>No se pudo completar la consulta</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {active && !isLoading && (
          <div key={active.id} className="space-y-3">
            <div className="reveal-rule h-px w-12 bg-primary" />
            <p className="text-sm">{active.interpretation}</p>

            <div>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => setShowSql((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showSql ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  {showSql ? "Ocultar SQL" : "Ver SQL generado"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExplain()}
                  disabled={explaining}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                >
                  <Lightbulb className="size-3.5" />
                  {explaining ? "Explicando…" : "Explicar"}
                </button>
                <button
                  type="button"
                  onClick={togglePin}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {dashboard.some((c) => c.id === active.id) ? (
                    <>
                      <Check className="size-3.5 text-primary" /> En el tablero
                    </>
                  ) : (
                    <>
                      <Pin className="size-3.5" /> Fijar al tablero
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {shareCopied ? (
                    <>
                      <Check className="size-3.5 text-primary" /> Enlace copiado
                    </>
                  ) : (
                    <>
                      <Share2 className="size-3.5" /> Compartir
                    </>
                  )}
                </button>
              </div>

              {explanation?.turnId === active.id && (
                <div className="mt-2 rounded-lg border border-primary/20 bg-accent/30 px-3 py-2 text-sm text-accent-foreground">
                  {explanation.text}
                </div>
              )}

              {showSql && (
                <div className="mt-2 space-y-2">
                  {editingSql ? (
                    <>
                      <textarea
                        value={sqlDraft}
                        onChange={(e) => setSqlDraft(e.target.value)}
                        spellCheck={false}
                        rows={Math.min(12, sqlDraft.split("\n").length + 1)}
                        className="w-full resize-y rounded-md border border-input bg-muted/40 p-3 font-mono text-xs text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      />
                      {editError && <p className="text-xs text-destructive">{editError}</p>}
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void runEditedSql()}
                          disabled={runningEdit || !sqlDraft.trim()}
                        >
                          {runningEdit ? "Ejecutando…" : "Ejecutar SQL"}
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSql(false);
                            setEditError(null);
                          }}
                          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <SqlCodeBlock sql={active.sql} />
                      <button
                        type="button"
                        onClick={() => {
                          setSqlDraft(active.sql);
                          setEditError(null);
                          setEditingSql(true);
                        }}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Pencil className="size-3.5" /> Editar y re-ejecutar
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <QueryResults result={active.result} fileNameBase="resultados" />
          </div>
        )}
      </CardContent>

      <Dialog
        open={status === "clarification"}
        onOpenChange={(open) => {
          if (!open) {
            setClarification(null);
            setStatus("idle");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Necesito más contexto</DialogTitle>
            <DialogDescription>{clarification?.question}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={clarificationAnswer}
            onChange={(e) => setClarificationAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleClarificationSubmit();
            }}
            placeholder="Tu respuesta…"
          />
          <DialogFooter>
            <Button
              type="button"
              onClick={() => void handleClarificationSubmit()}
              disabled={!clarificationAnswer.trim()}
            >
              Responder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
