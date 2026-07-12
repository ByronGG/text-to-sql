"use client";

import { Lock, ServerCog } from "lucide-react";
import { useT } from "@/lib/i18n";

interface DisclaimerProps {
  mode?: "file" | "postgres";
}

export function Disclaimer({ mode = "file" }: DisclaimerProps) {
  const t = useT();

  if (mode === "postgres") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <ServerCog className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-0.5 text-sm">
          <p className="font-medium text-foreground">{t.disclaimer.pgTitle}</p>
          <p className="text-muted-foreground">{t.disclaimer.pgBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-accent/40 px-4 py-3">
      <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="space-y-0.5 text-sm">
        <p className="font-medium text-foreground">{t.disclaimer.fileTitle}</p>
        <p className="text-muted-foreground">{t.disclaimer.fileBody}</p>
      </div>
    </div>
  );
}
