"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { foldIndex } from "@/lib/factory/fold";
import type { LintHit } from "@/lib/factory/lint";

export type FocusRange = { start: number; end: number; nonce: number };

const MARK_STYLE: Record<LintHit["severity"], CSSProperties> = {
  error: { background: "color-mix(in srgb, var(--sys-red) 18%, transparent)", boxShadow: "inset 0 -2px 0 var(--sys-red)" },
  warn: { background: "color-mix(in srgb, var(--sys-orange) 18%, transparent)", boxShadow: "inset 0 -2px 0 var(--sys-orange)" },
  info: { boxShadow: "inset 0 -1.5px 0 color-mix(in srgb, var(--sys-blue) 70%, transparent)" },
};

const RANK = { error: 3, warn: 2, info: 1 } as const;

/** Non-overlapping highlight ranges, most severe first. */
function pickMarks(issues: LintHit[], length: number) {
  const sorted = issues
    .filter((i) => i.start !== undefined && i.end !== undefined && i.end > i.start && i.end <= length)
    .sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.start! - b.start!);
  const kept: LintHit[] = [];
  for (const i of sorted) if (!kept.some((k) => k.start! < i.end! && i.start! < k.end!)) kept.push(i);
  return kept.sort((a, b) => a.start! - b.start!);
}

const TEXT_CLASS = "li-text !text-[15.5px] pointer-coarse:!text-[16px] !leading-[1.6] px-5 py-4 sm:px-6 sm:py-5 whitespace-pre-wrap [overflow-wrap:anywhere]";

export type EditorSurfaceHandle = { focus: () => void };

/**
 * A plain textarea over a mirrored backdrop: the backdrop paints lint highlights and the
 * "…see more" fold under the exact same glyphs, so the user edits normal text and still
 * sees where the AI tells are and where LinkedIn will cut the post.
 */
export const EditorSurface = forwardRef<
  EditorSurfaceHandle,
  { value: string; onChange: (v: string) => void; readOnly?: boolean; issues: LintHit[]; focus: FocusRange | null; placeholder?: string; label?: string }
>(function EditorSurface({ value, onChange, readOnly, issues, focus, placeholder, label = "Post text" }, ref) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [foldTop, setFoldTop] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }), []);

  const fold = useMemo(() => foldIndex(value, "desktop"), [value]);
  const marks = useMemo(() => pickMarks(issues, value.length), [issues, value.length]);

  // Autosize: the page scrolls, not the textarea, so highlights never drift.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 320)}px`;
  }, [value]);

  // Where to draw the fold line: just under the line that holds the cut.
  useLayoutEffect(() => {
    const back = backRef.current;
    const marker = back?.querySelector<HTMLElement>("[data-fold]");
    if (!back || !marker) {
      setFoldTop(null);
      return;
    }
    const lh = parseFloat(getComputedStyle(back).lineHeight) || 24;
    setFoldTop(marker.offsetTop + lh + 2);
  }, [value, fold]);

  // Jump to a lint finding: select it in the textarea and bring it into view.
  useEffect(() => {
    if (!focus || !taRef.current) return;
    const ta = taRef.current;
    ta.focus({ preventScroll: true });
    try {
      ta.setSelectionRange(focus.start, focus.end);
    } catch {
      /* range out of date */
    }
    const el = backRef.current?.querySelector<HTMLElement>("[data-focus]");
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);

  const backdrop = useMemo(() => {
    const out: ReactNode[] = [];
    const cuts = new Set<number>([0, value.length]);
    for (const m of marks) {
      cuts.add(m.start!);
      cuts.add(m.end!);
    }
    if (fold !== null) cuts.add(fold);
    const points = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a === fold) out.push(<span key={`fold-${a}`} data-fold="" />);
      const text = value.slice(a, b);
      const mark = marks.find((m) => m.start! <= a && m.end! >= b);
      if (mark) {
        const isFocus = !!focus && focus.start === mark.start && focus.end === mark.end;
        out.push(
          <mark
            key={`${a}-${b}`}
            data-focus={isFocus ? "" : undefined}
            className="rounded-[3px] bg-transparent text-transparent"
            style={{ ...MARK_STYLE[mark.severity], ...(isFocus ? { outline: "2px solid var(--accent)", outlineOffset: 1 } : {}) }}
          >
            {text}
          </mark>,
        );
      } else out.push(<span key={`${a}-${b}`}>{text}</span>);
    }
    if (fold !== null && fold === value.length) out.push(<span key="fold-end" data-fold="" />);
    out.push("​");
    return out;
  }, [value, marks, fold, focus]);

  return (
    <div className="relative">
      <div ref={backRef} aria-hidden className={`${TEXT_CLASS} pointer-events-none absolute inset-0 overflow-hidden text-transparent`}>
        {backdrop}
      </div>
      {foldTop !== null && value.trim() && (
        <div className="pointer-events-none absolute inset-x-4 sm:inset-x-5" style={{ top: foldTop }} aria-hidden>
          <div className="border-t border-dashed" style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, transparent)" }} />
          <span className="absolute right-0 -top-2.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold tracking-wide text-accent" style={{ background: "color-mix(in srgb, var(--accent) 12%, var(--bg-elevated))" }}>
            …see more
          </span>
        </div>
      )}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        aria-label={label}
        spellCheck
        className={`${TEXT_CLASS} relative block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-label-3 ${readOnly ? "cursor-progress" : ""}`}
        style={{ caretColor: "var(--accent)", minHeight: 320 }}
      />
    </div>
  );
});
