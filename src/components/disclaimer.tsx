import { Lock, ServerCog } from "lucide-react";

interface DisclaimerProps {
  mode?: "file" | "postgres";
}

export function Disclaimer({ mode = "file" }: DisclaimerProps) {
  if (mode === "postgres") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <ServerCog className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-0.5 text-sm">
          <p className="font-medium text-foreground">Modo Postgres: tus datos sí salen del navegador</p>
          <p className="text-muted-foreground">
            Las consultas se ejecutan en el servidor contra tu base de datos. Se aplican
            solo lectura (transacción <code className="font-mono text-xs">READ ONLY</code>),
            límite de filas y timeout, pero aun así conéctate con un usuario de{" "}
            <strong>solo lectura</strong>. La cadena de conexión se envía al servidor en
            cada consulta y no se guarda.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-accent/40 px-4 py-3">
      <Lock className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="space-y-0.5 text-sm">
        <p className="font-medium text-foreground">Tus datos no salen de tu navegador</p>
        <p className="text-muted-foreground">
          Tu archivo se procesa localmente con DuckDB. Solo el esquema (nombres y
          tipos de columnas) se envía al modelo para generar el SQL — nunca tus
          datos ni sus filas. No se sube ni se guarda nada en ningún servidor.
        </p>
      </div>
    </div>
  );
}
