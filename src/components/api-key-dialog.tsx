"use client";

import { useEffect, useState } from "react";
import { Check, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  clearStoredApiKey,
  getStoredApiKey,
  setStoredApiKey,
} from "@/lib/api-key";
import { cn } from "@/lib/utils";

export function ApiKeyDialog() {
  const [open, setOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [value, setValue] = useState("");

  // localStorage is client-only; read it after mount so the initial render
  // matches the server (no "active" indicator until hydrated).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setHasKey(getStoredApiKey() !== null);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function save() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setStoredApiKey(trimmed);
    setHasKey(true);
    setValue("");
    setOpen(false);
  }

  function remove() {
    clearStoredApiKey();
    setHasKey(false);
    setValue("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <KeyRound className="size-3.5" />
        <span>API key</span>
        {hasKey && (
          <span
            className="inline-flex items-center gap-1 text-primary"
            title="Estás usando tu propia API key"
          >
            <Check className="size-3" />
            <span>activa</span>
          </span>
        )}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setValue("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tu propia API key de Groq</DialogTitle>
            <DialogDescription>
              Opcional. Con tu propia key las consultas usan tu cuota de Groq y no el
              límite compartido de la demo. Se guarda solo en este navegador y se envía
              a nuestro proxy únicamente para llamar a Groq; no la almacenamos en el
              servidor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              type="password"
              autoComplete="off"
              placeholder={hasKey ? "•••••••• (hay una key guardada)" : "gsk_…"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Consíguela gratis en{" "}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                console.groq.com/keys
              </a>
              .
            </p>
          </div>

          <DialogFooter className={cn(hasKey && "sm:justify-between")}>
            {hasKey && (
              <Button type="button" variant="ghost" onClick={remove}>
                Quitar key
              </Button>
            )}
            <Button type="button" onClick={save} disabled={!value.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
