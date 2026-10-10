"use client";

import { useState } from "react";
import { Check, ChevronRight, Minus } from "lucide-react";
import { Glass, Meter, Sheet, cx } from "@/components/ui";
import type { CoverageItem } from "@/lib/interview/types";

export function depthLabel(depth: number, kind: "story" | "positioning") {
  if (kind === "positioning") return depth >= 0.99 ? "All covered" : depth >= 0.6 ? "Almost there" : depth > 0 ? "In progress" : "Just started";
  if (depth >= 0.8) return "Ready to write";
  if (depth >= 0.5) return "Getting rich";
  if (depth >= 0.25) return "Taking shape";
  return "Just started";
}

const depthColor = (d: number) => (d >= 0.8 ? "var(--sys-green)" : d >= 0.5 ? "var(--sys-teal)" : d >= 0.25 ? "var(--sys-blue)" : "var(--sys-indigo)");

function Checklist({ items }: { items: CoverageItem[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.key} className="flex items-start gap-3">
          <span
            className={cx(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full transition-colors",
              i.status === "covered" && "bg-sys-green text-white",
              i.status === "skipped" && "bg-fill-2 text-label-2",
              i.status === "missing" && "ring-[1.5px] ring-inset ring-[color:var(--label-3)]",
            )}
            aria-hidden
          >
            {i.status === "covered" && <Check className="size-3" strokeWidth={3} />}
            {i.status === "skipped" && <Minus className="size-3" strokeWidth={3} />}
          </span>
          <span className="min-w-0">
            <span className={cx("block t-subhead font-medium", i.status === "missing" && "text-label-2")}>
              {i.label}
              <span className="sr-only"> — {i.status === "covered" ? "covered" : i.status === "skipped" ? "skipped" : "not yet"}</span>
            </span>
            <span className="block t-caption text-label-3">{i.hint}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DepthSummary({ items, depth, kind }: { items: CoverageItem[]; depth: number; kind: "story" | "positioning" }) {
  const covered = items.filter((i) => i.status === "covered").length;
  return (
    <div className="space-y-2">
      <div className="t-eyebrow">{kind === "story" ? "Story depth" : "Coverage"}</div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-title-3">{depthLabel(depth, kind)}</span>
        <span className="t-footnote tabular-nums text-label-2">
          {covered}/{items.length}
        </span>
      </div>
      <Meter value={depth} color={depthColor(depth)} />
    </div>
  );
}

/** Desktop side panel. */
export function DepthPanel({
  items,
  depth,
  kind,
  footer,
}: {
  items: CoverageItem[];
  depth: number;
  kind: "story" | "positioning";
  footer?: React.ReactNode;
}) {
  return (
    <Glass className="space-y-5 p-5">
      <DepthSummary items={items} depth={depth} kind={kind} />
      <Checklist items={items} />
      {footer}
    </Glass>
  );
}

/** Mobile: a compact capsule that opens the checklist in a sheet. */
export function DepthPill({ items, depth, kind, footer }: { items: CoverageItem[]; depth: number; kind: "story" | "positioning"; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const covered = items.filter((i) => i.status === "covered").length;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="glass flex w-full items-center gap-3 rounded-full py-2 pl-4 pr-3 text-left focus-ring" aria-label="Show story depth checklist">
        <span className="t-footnote font-semibold">{kind === "story" ? "Story depth" : "Coverage"}</span>
        <Meter value={depth} color={depthColor(depth)} className="flex-1" />
        <span className="t-footnote tabular-nums text-label-2">
          {covered}/{items.length}
        </span>
        <ChevronRight className="size-4 text-label-3" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={kind === "story" ? "Story depth" : "Coverage"} size="sm">
        <div className="space-y-5">
          <DepthSummary items={items} depth={depth} kind={kind} />
          <Checklist items={items} />
          {footer}
        </div>
      </Sheet>
    </>
  );
}
