"use client";

import { useState } from "react";
import { ChevronDown, MessageCircle, Repeat2, Scissors, ThumbsUp, TriangleAlert } from "lucide-react";
import { Button, Chip, api, cx, toast } from "@/components/ui";
import type { ParseResult } from "@/lib/voice/parse";
import { wordCount } from "@/lib/voice/text";
import type { ImportOrigin, ImportResult } from "@/lib/voice/types";
import { errorMessage, firstLine, fmtCount, fmtDay } from "./format";

export function importSummary(r: ImportResult, what = "posts"): string {
  const parts = [r.inserted === 1 ? `Imported 1 ${what.replace(/s$/, "")}` : `Imported ${r.inserted} ${what}`];
  if (r.updated) parts.push(`updated numbers on ${r.updated}`);
  if (r.skipped) parts.push(`${r.skipped} skipped`);
  return parts.join(", ");
}

/**
 * Shows what the parser found before anything is saved: the person can untick fragments,
 * comments or someone else's post that slipped into a paste.
 */
export function ImportPreview({
  parsed,
  kind,
  author,
  origin,
  onImported,
  onCancel,
}: {
  parsed: ParseResult;
  kind: "own" | "reference";
  author?: string;
  origin: ImportOrigin;
  onImported: (r: ImportResult) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(parsed.posts.map((_, i) => i)));
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const all = selected.size === parsed.posts.length;

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const submit = async () => {
    const posts = parsed.posts.filter((_, i) => selected.has(i));
    if (!posts.length) return;
    setBusy(true);
    try {
      const r = await api<ImportResult>("/api/voice/import", { method: "POST", json: { kind, author, origin, format: "json", content: JSON.stringify(posts) } });
      toast(importSummary(r));
      for (const w of r.warnings.filter((w) => !parsed.warnings.includes(w))) toast(w, "info");
      onImported(r);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="t-headline">
            Found {parsed.posts.length} {parsed.posts.length === 1 ? "post" : "posts"}
          </div>
          <p className="t-footnote text-label-2">
            Untick anything that isn&apos;t {kind === "own" ? "yours" : `by ${author || "this creator"}`}.
            {parsed.skipped > 0 && ` ${parsed.skipped} left out: ${kind === "own" ? "reposts without your words, " : ""}duplicates or fragments too short to learn from.`}
          </p>
        </div>
        <Button variant="plain" size="sm" onClick={() => setSelected(all ? new Set() : new Set(parsed.posts.map((_, i) => i)))}>
          {all ? "Select none" : "Select all"}
        </Button>
      </div>

      {parsed.warnings.map((w) => (
        <div key={w} className="flex gap-2.5 rounded-[14px] px-3.5 py-2.5 t-footnote" style={{ background: "color-mix(in srgb, var(--sys-orange) 12%, transparent)" }}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-sys-orange" />
          <span>{w}</span>
        </div>
      ))}

      <ul className="list-group max-h-[420px] overflow-y-auto bg-fill-4">
        {parsed.posts.map((p, i) => {
          const on = selected.has(i);
          const open = expanded === i;
          return (
            <li key={i} className={cx("list-row !items-start", !on && "opacity-55")}>
              <input type="checkbox" checked={on} onChange={() => toggle(i)} className="mt-1 size-4 shrink-0 accent-[var(--accent)]" aria-label={`Include post ${i + 1}`} />
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => setExpanded(open ? null : i)} className="flex w-full items-start gap-2 text-left focus-ring rounded-md" aria-expanded={open}>
                  <span className={cx("t-subhead min-w-0 flex-1 font-medium", !open && "truncate")}>{firstLine(p.text)}</span>
                  <ChevronDown className={cx("mt-0.5 size-4 shrink-0 text-label-3 transition-transform", open && "rotate-180")} />
                </button>
                {open && <p className="li-text mt-2 max-h-64 overflow-y-auto rounded-[12px] bg-fill-4 p-3">{p.text}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 t-caption text-label-2">
                  <span>{wordCount(p.text)} words</span>
                  {p.postedAt && <span>{fmtDay(p.postedAt)}</span>}
                  {p.reactions != null && (
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp className="size-3" />
                      {fmtCount(p.reactions)}
                    </span>
                  )}
                  {p.comments != null && (
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="size-3" />
                      {fmtCount(p.comments)}
                    </span>
                  )}
                  {p.reposts != null && (
                    <span className="inline-flex items-center gap-1">
                      <Repeat2 className="size-3" />
                      {fmtCount(p.reposts)}
                    </span>
                  )}
                  {p.truncated && (
                    <Chip tone="orange" className="!h-5">
                      <Scissors className="size-3" />
                      Cut off
                    </Chip>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="plain" onClick={onCancel} disabled={busy}>
          Back
        </Button>
        <Button variant="primary" onClick={submit} loading={busy} disabled={selected.size === 0}>
          Import {selected.size} {selected.size === 1 ? "post" : "posts"}
        </Button>
      </div>
    </div>
  );
}
