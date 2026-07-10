"use client";

import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, X } from "lucide-react";
import { QueryResults } from "@/components/query-results";
import { SqlCodeBlock } from "@/components/sql-code-block";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clearDashboard, reorder, unpin, useDashboard } from "@/lib/dashboard-store";

export default function DashboardPage() {
  const cards = useDashboard();

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pt-12 pb-24">
        <header>
          <div className="flex items-center justify-between gap-4">
            <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
              AskQL · TABLERO
            </span>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Volver
            </Link>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-4">
            <h1 className="text-3xl font-medium tracking-tight text-foreground">
              Tablero de resultados
            </h1>
            {cards.length > 0 && (
              <button
                type="button"
                onClick={() => clearDashboard()}
                className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Limpiar tablero
              </button>
            )}
          </div>
          <p className="mt-2 max-w-lg text-muted-foreground">
            Los resultados que fijas desde una consulta quedan aquí como tarjetas —
            reordénalas y expórtalas. Se guardan en tu navegador.
          </p>
          <div className="mt-8 h-px w-full bg-border" />
        </header>

        <div className="mt-8 flex flex-col gap-6">
          {cards.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Aún no has fijado resultados. En una consulta, usa{" "}
              <span className="font-medium text-foreground">Fijar al tablero</span> y
              aparecerán aquí.
            </p>
          ) : (
            cards.map((card, i) => (
              <Card key={card.id}>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base">{card.question}</CardTitle>
                    {card.interpretation && (
                      <p className="text-sm text-muted-foreground">{card.interpretation}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => reorder(card.id, -1)}
                      disabled={i === 0}
                      aria-label="Subir"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => reorder(card.id, 1)}
                      disabled={i === cards.length - 1}
                      aria-label="Bajar"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => unpin(card.id)}
                      aria-label="Quitar"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <QueryResults result={card.result} fileNameBase="resultado" />
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground">
                      SQL
                    </summary>
                    <div className="mt-2">
                      <SqlCodeBlock sql={card.sql} />
                    </div>
                  </details>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
