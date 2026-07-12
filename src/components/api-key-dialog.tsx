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
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ApiKeyDialog() {
  const [open, setOpen] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [value, setValue] = useState("");
  const t = useT();

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
        <span>{t.apiKey.apiKey}</span>
        {hasKey && (
          <span
            className="inline-flex items-center gap-1 text-primary"
            title={t.apiKey.activeTitle}
          >
            <Check className="size-3" />
            <span>{t.apiKey.active}</span>
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
            <DialogTitle>{t.apiKey.dialogTitle}</DialogTitle>
            <DialogDescription>{t.apiKey.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              type="password"
              autoComplete="off"
              placeholder={hasKey ? t.apiKey.placeholderHasKey : t.apiKey.placeholderNew}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
            <p className="text-xs text-muted-foreground">{t.apiKey.hint}</p>
          </div>

          <DialogFooter className={cn(hasKey && "sm:justify-between")}>
            {hasKey && (
              <Button type="button" variant="ghost" onClick={remove}>
                {t.apiKey.removeKey}
              </Button>
            )}
            <Button type="button" onClick={save} disabled={!value.trim()}>
              {t.apiKey.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
