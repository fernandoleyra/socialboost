"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Plus, X } from "lucide-react";
import { IconButton, Input, cx } from "@/components/ui";

/** Textarea that grows with its content (up to maxRows). */
export function AutoTextarea({ minRows = 2, maxRows = 24, className, value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 22;
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    el.style.height = "auto";
    const min = minRows * line + padding + border;
    const max = maxRows * line + padding + border;
    const want = el.scrollHeight + border;
    el.style.height = `${Math.min(Math.max(want, min), max)}px`;
    el.style.overflowY = want > max ? "auto" : "hidden";
  }, [value, minRows, maxRows]);
  return <textarea ref={ref} rows={minRows} value={value} className={cx("field resize-none", className)} {...rest} />;
}

/** Short values as removable chips (people, feelings, tags). Enter or comma adds. */
export function TokenInput({ value, onChange, placeholder, label, max = 30 }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; label: string; max?: number }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const lower = new Set(value.map((v) => v.toLowerCase()));
    onChange([...value, ...parts.filter((p) => !lower.has(p.toLowerCase()))].slice(0, max));
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="field flex min-h-[44px] flex-wrap items-center gap-1.5 py-1.5! pl-2!" onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus()}>
      {value.map((v, i) => (
        <span key={`${v}-${i}`} className="chip gap-1 pr-1!">
          {v}
          <button type="button" aria-label={`Remove ${v}`} className="grid size-4 place-items-center rounded-full hover:bg-fill-2" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => add(draft)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 t-subhead outline-none placeholder:text-label-3"
      />
    </div>
  );
}

/** A list of sentences (details, angles): edit in place, add, remove. */
export function ListEditor({
  value,
  onChange,
  placeholder,
  addLabel,
  renderItem,
  max = 40,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  addLabel: string;
  renderItem?: (v: string) => ReactNode;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...value, v].slice(0, max));
    setDraft("");
  };
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((v, i) => (
            <li key={i} className="group flex items-start gap-2">
              {renderItem ? (
                <div className="min-w-0 flex-1">{renderItem(v)}</div>
              ) : (
                <AutoTextarea
                  minRows={1}
                  maxRows={8}
                  value={v}
                  aria-label={`${addLabel} ${i + 1}`}
                  onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
                  onBlur={(e) => !e.target.value.trim() && onChange(value.filter((_, j) => j !== i))}
                  className="flex-1"
                />
              )}
              <IconButton
                label={`Remove ${addLabel.replace(/^Add\s+/i, "")} ${i + 1}`}
                className="mt-0.5 shrink-0 text-label-2 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          aria-label={addLabel}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <IconButton label={addLabel} onClick={add} className="shrink-0 bg-fill-4" disabled={!draft.trim()}>
          <Plus className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

/** 1-5 dots; read-only unless onChange is given. */
export function StrengthDots({ value, onChange, size = "sm" }: { value: number; onChange?: (v: number) => void; size?: "sm" | "md" }) {
  const dot = size === "md" ? "size-3" : "size-1.5";
  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-1" role="img" aria-label={`Story strength ${value} of 5`} title={`Story strength ${value} of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cx(dot, "rounded-full", i <= value ? "bg-accent" : "bg-fill")} />
        ))}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5" role="radiogroup" aria-label="Story strength">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={i === value} aria-label={`${i} of 5`} onClick={() => onChange(i)} className="focus-ring grid size-6 place-items-center rounded-full hover:bg-fill-4">
          <span className={cx(dot, "rounded-full transition-colors", i <= value ? "bg-accent" : "bg-fill")} />
        </button>
      ))}
    </span>
  );
}
