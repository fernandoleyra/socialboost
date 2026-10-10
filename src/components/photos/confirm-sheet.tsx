"use client";

import { useState, type ReactNode } from "react";
import { Button, Sheet, toast } from "@/components/ui";

/** A small Apple-style confirmation sheet for destructive actions. */
export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="glass" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={run} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <div className="t-subhead text-label-2">{body}</div>}
    </Sheet>
  );
}
