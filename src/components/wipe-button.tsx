"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

interface WipeButtonProps {
  /** Clears all local data (tables, conversation, dashboard) — never the API
   * key or language preference. Called after the user confirms. */
  onWipe: () => void;
}

// A destructive "start over" that purges everything the app persisted in this
// browser. Gated behind a confirmation dialog since it can't be undone (the
// uploaded CSV bytes are deleted).
export function WipeButton({ onWipe }: WipeButtonProps) {
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
        <span>{t.wipe.button}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.wipe.dialogTitle}</DialogTitle>
            <DialogDescription>{t.wipe.dialogBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.wipe.cancel}
            </button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onWipe();
                setOpen(false);
              }}
            >
              {t.wipe.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
