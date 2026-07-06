"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { QueryResults } from "@/components/query-results";
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
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [clarification, setClarification] = useState<Clarification | null>(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function runAttempts(
    forQuestion: string,
    failedSql: { sql: string; error: string } | undefined,
    attempt: number,
  ) {
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
    await runAttempts(combinedQuestion, undefined, 0);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pregúntale a tus datos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Ej. ¿Quiénes son mis mejores clientes de agosto?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAsk();
            }}
            disabled={status === "loading"}
          />
          <Button
            type="button"
            onClick={() => void handleAsk()}
            disabled={status === "loading" || !question.trim()}
          >
            {status === "loading" ? "Pensando…" : "Preguntar"}
          </Button>
        </div>

        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

        {answer && (
          <div className="space-y-3">
            <p className="text-sm">{answer.interpretation}</p>
            <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs">
              {answer.sql}
            </pre>
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
