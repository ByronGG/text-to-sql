"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { TableSchema } from "@/lib/csv-table";
import { fetchPgSchema } from "@/lib/pg-client";

interface PgConnectProps {
  onConnected: (tables: TableSchema[], connectionString: string) => void;
}

export function PgConnect({ onConnected }: PgConnectProps) {
  const [connectionString, setConnectionString] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    const cs = connectionString.trim();
    if (!cs) return;
    setIsConnecting(true);
    setError(null);
    try {
      const tables = await fetchPgSchema(cs);
      onConnected(tables, cs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar.");
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <label htmlFor="pg-cs" className="block text-sm font-medium">
          Cadena de conexión
        </label>
        <Input
          id="pg-cs"
          type="password"
          autoComplete="off"
          placeholder="postgresql://usuario:contraseña@host:5432/basededatos"
          value={connectionString}
          onChange={(e) => setConnectionString(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void connect();
          }}
          disabled={isConnecting}
        />
        <p className="text-xs text-muted-foreground">
          Se introspecta el esquema <code className="font-mono">public</code>. Para bases
          gestionadas (Supabase, Neon, RDS) agrega <code className="font-mono">?sslmode=require</code>.
        </p>
        <Button type="button" onClick={() => void connect()} disabled={isConnecting || !connectionString.trim()}>
          {isConnecting ? "Conectando…" : "Conectar"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
