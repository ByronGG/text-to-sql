"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { TableSchema } from "@/lib/csv-table";
import { useT } from "@/lib/i18n";
import { fetchPgSchema } from "@/lib/pg-client";

interface PgConnectProps {
  onConnected: (tables: TableSchema[], connectionString: string) => void;
}

export function PgConnect({ onConnected }: PgConnectProps) {
  const [connectionString, setConnectionString] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  async function connect() {
    const cs = connectionString.trim();
    if (!cs) return;
    setIsConnecting(true);
    setError(null);
    try {
      const tables = await fetchPgSchema(cs);
      onConnected(tables, cs);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.pg.errorConnect);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <label htmlFor="pg-cs" className="block text-sm font-medium">
          {t.pg.connString}
        </label>
        <Input
          id="pg-cs"
          type="password"
          autoComplete="off"
          placeholder={t.pg.placeholder}
          value={connectionString}
          onChange={(e) => setConnectionString(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void connect();
          }}
          disabled={isConnecting}
        />
        <p className="text-xs text-muted-foreground">{t.pg.hint}</p>
        <Button type="button" onClick={() => void connect()} disabled={isConnecting || !connectionString.trim()}>
          {isConnecting ? t.pg.connecting : t.pg.connect}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
