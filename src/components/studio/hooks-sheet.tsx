"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, Chip, Sheet, Typing } from "@/components/ui";
import { HOOK_TYPE_LABELS, hookOf, type HookOption } from "@/lib/factory/angles";

export function HooksSheet({
  open,
  onClose,
  loading,
  error,
  hooks,
  body,
  onUse,
  onRetry,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  hooks: HookOption[];
  body: string;
  onUse: (hook: string) => void;
  onRetry: () => void;
}) {
  const current = hookOf(body);
  return (
    <Sheet open={open} onClose={onClose} title="Try other hooks">
      <div className="space-y-4">
        <p className="t-subhead text-label-2">The first line decides whether anyone taps “see more”. Pick one to replace your current first line; the rest of the post stays as it is.</p>
        {current && (
          <div className="rounded-[14px] bg-fill-4 p-3">
            <div className="t-caption font-semibold text-label-2">Current first line</div>
            <p className="li-text mt-0.5">{current}</p>
          </div>
        )}
        {loading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 t-subhead text-label-2">
              <Typing /> Writing five openings from your story…
            </div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-14 w-full" />
            ))}
          </div>
        )}
        {!loading && error && (
          <div className="flex gap-2 rounded-card p-4 t-subhead" style={{ background: "color-mix(in srgb, var(--sys-red) 10%, transparent)" }}>
            <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-sys-red" />
            <div className="space-y-2">
              <p>{error}</p>
              <Button size="sm" variant="glass" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
                Try again
              </Button>
            </div>
          </div>
        )}
        {!loading && !error && hooks.length > 0 && (
          <>
            <ul className="space-y-2">
              {hooks.map((h) => (
                <li key={h.text}>
                  <button type="button" onClick={() => onUse(h.text)} className="card card-interactive w-full space-y-1.5 p-3.5 text-left focus-ring">
                    <div className="flex items-center justify-between gap-2">
                      <Chip tone="blue">{HOOK_TYPE_LABELS[h.type]?.label ?? h.type}</Chip>
                      <span className="t-caption text-label-3 tabular-nums">{h.text.length} chars</span>
                    </div>
                    <p className="li-text !text-[15px] font-medium">{h.text}</p>
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="plain" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
              Five more
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
