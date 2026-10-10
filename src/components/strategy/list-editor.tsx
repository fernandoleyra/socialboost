"use client";

import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { Button, IconButton, cx } from "@/components/ui";
import { AutoTextarea } from "./auto-textarea";

/**
 * Editable list of short texts. Enter adds a row below, Backspace on an empty row removes
 * it, suggestions are one-tap additions. Empty rows are allowed while typing (the server
 * drops them on save).
 */
export function ListEditor({
  items,
  onChange,
  placeholder,
  addLabel = "Add",
  suggestions = [],
  max = 25,
  label,
  className,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  suggestions?: string[];
  max?: number;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusIndex = useRef<number | null>(null);

  useEffect(() => {
    if (focusIndex.current === null) return;
    const el = refs.current[focusIndex.current];
    if (el) {
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
    focusIndex.current = null;
  });

  const set = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  const insertAfter = (i: number) => {
    if (items.length >= max) return;
    focusIndex.current = i + 1;
    onChange([...items.slice(0, i + 1), "", ...items.slice(i + 1)]);
  };
  const remove = (i: number) => {
    focusIndex.current = i > 0 ? i - 1 : null;
    onChange(items.filter((_, j) => j !== i));
  };
  const lower = new Set(items.map((x) => x.trim().toLowerCase()));
  const openSuggestions = suggestions.filter((s) => !lower.has(s.toLowerCase()));

  return (
    <div className={cx("space-y-2", className)} role="group" aria-label={label}>
      {items.map((item, i) => (
        <div key={i} className="group flex items-start gap-2">
          <span aria-hidden className="mt-[18px] size-1.5 shrink-0 rounded-full bg-label-3" />
          <AutoTextarea
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={item}
            placeholder={placeholder}
            aria-label={`${label} ${i + 1}`}
            onChange={(e) => set(i, e.target.value.replace(/\n/g, " "))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                insertAfter(i);
              } else if (e.key === "Backspace" && item === "") {
                e.preventDefault();
                remove(i);
              }
            }}
          />
          <IconButton label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => remove(i)} className="mt-0.5 shrink-0 text-label-3! hover:text-sys-red!">
            <X className="size-4" />
          </IconButton>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="plain" size="sm" icon={<Plus className="size-4" />} disabled={items.length >= max} onClick={() => insertAfter(items.length - 1)}>
          {addLabel}
        </Button>
        {openSuggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => items.length < max && onChange([...items.filter((x) => x.trim()), s])}
            className="chip transition-colors hover:bg-fill-2! focus-ring"
          >
            <Plus className="size-3" />
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
