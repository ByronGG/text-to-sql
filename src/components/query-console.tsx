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

interface QueryConsoleProps {
  schema: TableSchema;
}

type Status = "idle" | "loading" | "clarification" | "result" | "error";

interface Answer {
  interpretation: string;
  sql: string;
  result: QueryResult;
}

interface Clarification {
  originalQuestion: string;
  question: string;
}

const MAX_RETRIES = 2;

export function QueryConsole({ schema }: QueryConsoleProps) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [clarification, setClarification] = useState<Clarification | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Function declaration (not useCallback) so it can recurse by name for the
  // auto-correction retries without tripping the React Compiler linter.
  async function runAttempts(
    forQuestion: string,
    failedSql: { sql: string; error: string } | undefined,
    attempt: number,
  ) {
    setRetryAttempt(attempt);

    let response;
    try {
      response = await askQuestion({ question: forQuestion, schema, failedSql });
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
      setAnswer({ interpretation: response.interpretacion, sql: response.consulta, result });
      setShowSql(false);
      setStatus("result");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido.";
      if (attempt < MAX_RETRIES) {
        await runAttempts(forQuestion, { sql: response.consulta, error: message }, attempt + 1);
      } else {
        setErrorMessage(`No se pudo generar una consulta válida: ${message}`);
        setStatus("error");
      }
    }
  }

  async function handleAsk() {
    if (!question.trim()) return;
    setStatus("loading");
    setErrorMessage(null);
    setAnswer(null);
    await runAttempts(question, undefined, 0);
  }

  async function handleClarificationSubmit() {
    if (!clarification || !clarificationAnswer.trim()) return;
    const combinedQuestion =
      `Pregunta original: "${clarification.originalQuestion}"\n` +
      `Aclaración pedida: "${clarification.question}"\n` +
      `Respuesta del usuario: "${clarificationAnswer}"`;

    setStatus("loading");
    setClarification(null);
    setClarificationAnswer("");
    // Reflect the resolved question back in the input, so it doesn't stay
    // stuck showing the original (possibly vague) text the user first typed.
    setQuestion(clarificationAnswer);
    await runAttempts(combinedQuestion, undefined, 0);
  }

  const isLoading = status === "loading";

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Ej. ¿Quiénes son mis mejores clientes de agosto?"
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

        {answer && (
          <div key={answer.sql} className="space-y-3">
            <div className="reveal-rule h-px w-12 bg-primary" />
            <p className="text-sm">{answer.interpretation}</p>

            <div>
              <button
                type="button"
                onClick={() => setShowSql((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {showSql ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                {showSql ? "Ocultar SQL" : "Ver SQL generado"}
              </button>
              {showSql && <div className="mt-2"><SqlCodeBlock sql={answer.sql} /></div>}
            </div>

            <QueryResults result={answer.result} fileNameBase="resultados" />
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
