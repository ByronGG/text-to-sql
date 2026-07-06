"use client";

import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import { formatSqlForDisplay } from "@/lib/format-sql";

interface SqlCodeBlockProps {
  sql: string;
}

export function SqlCodeBlock({ sql }: SqlCodeBlockProps) {
  // Rendered HTML is stored together with the SQL it was generated from, so
  // staleness is derived instead of reset via setState inside the effect.
  const [rendered, setRendered] = useState<{ sql: string; html: string } | null>(null);
  const displaySql = formatSqlForDisplay(sql);
  const html = rendered?.sql === displaySql ? rendered.html : null;

  useEffect(() => {
    let cancelled = false;
    codeToHtml(displaySql, { lang: "sql", theme: "github-dark" }).then((result) => {
      if (!cancelled) setRendered({ sql: displaySql, html: result });
    });
    return () => {
      cancelled = true;
    };
  }, [displaySql]);

  if (!html) {
    return (
      <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap break-words">
        {displaySql}
      </pre>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-md border [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
      // Shiki returns pre-rendered, sanitized-by-construction HTML (it only
      // escapes and wraps tokenized source text, never user-supplied markup).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
