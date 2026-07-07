import { Lock } from "lucide-react";

export function Disclaimer() {
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
