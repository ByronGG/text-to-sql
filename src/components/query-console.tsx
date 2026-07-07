"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
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
import { runQuery, type QueryResult } from "@/lib/run-query";
import { cn } from "@/lib/utils";

interface QueryConsoleProps {
  schema: TableSchema;
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

export function QueryConsole({ schema }: QueryConsoleProps) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [clarification, setClarification] = useState<Clarification | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      response = await askQuestion({ question: forQuestion, schema, history, failedSql });
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
      const result = await runQuery(response.consulta);
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

  async function handleAsk() {
    const text = question.trim();
    if (!text) return;
    setStatus("loading");
    setErrorMessage(null);
    await runAttempts(text, text, buildHistory(), undefined, 0);
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
                  onClick={() => {
                    setActiveId(turn.id);
                    setShowSql(false);
                  }}
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
              <button
                type="button"
                onClick={() => setShowSql((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {showSql ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                {showSql ? "Ocultar SQL" : "Ver SQL generado"}
              </button>
              {showSql && <div className="mt-2"><SqlCodeBlock sql={active.sql} /></div>}
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
