"use client";

import { useState } from "react";
import { Camera, Check, ChevronDown, Plus } from "lucide-react";
import { Button, Input, Meter, Select, cx } from "@/components/ui";
import { memoryDepth, READY_THRESHOLD, type DepthItem, type DepthTarget } from "@/lib/memory-core";
import type { Memory } from "@/lib/types";
import { AutoTextarea } from "./fields";

export type PillarLite = { id: string; name: string; color: string };

type DepthDraft = Pick<Memory, "story" | "summary" | "when" | "place" | "details" | "quotes" | "lesson" | "pillar">;

function GapRow({ item, pillars, onApply, onAddPhoto }: { item: DepthItem; pillars: PillarLite[]; onApply: (t: DepthTarget, v: string) => void; onAddPhoto: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const long = item.target === "storyAppend" || item.target === "lesson";
  const submit = () => {
    if (!value.trim()) return;
    onApply(item.target, value.trim());
    setValue("");
    setOpen(false);
  };
  return (
    <li className="rounded-inner bg-fill-4">
      <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-label-3 text-label-3">
          <Plus className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 t-subhead font-medium">{item.label}</span>
        <span className="t-caption font-semibold text-label-2 tabular-nums">+{item.points}</span>
        <ChevronDown className={cx("size-4 text-label-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2.5 px-3 pb-3 animate-in">
          <p className="t-footnote text-label-2">{item.probe}</p>
          {item.target === "photo" ? (
            <Button size="sm" variant="tinted" icon={<Camera className="size-4" />} onClick={onAddPhoto}>
              Add a photo
            </Button>
          ) : item.target === "pillar" ? (
            pillars.length ? (
              <Select aria-label="Pillar" defaultValue="" onChange={(e) => e.target.value && onApply("pillar", e.target.value)}>
                <option value="" disabled>
                  Choose a pillar
                </option>
                {pillars.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="t-footnote text-label-3">Set up your pillars on the Strategy page first.</p>
            )
          ) : (
            <div className="flex items-end gap-2">
              {long ? (
                <AutoTextarea
                  minRows={2}
                  maxRows={8}
                  value={value}
                  placeholder={item.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                  }}
                  aria-label={item.probe}
                />
              ) : (
                <Input
                  value={value}
                  placeholder={item.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  aria-label={item.probe}
                />
              )}
              <Button size="sm" variant="primary" onClick={submit} disabled={!value.trim()} className="mb-1.5">
                Add
              </Button>
            </div>
          )}
          {item.target === "storyAppend" && <p className="t-caption text-label-3">Added to the end of the story, in your words.</p>}
        </div>
      )}
    </li>
  );
}

/**
 * Live completeness of a story card (research: ready at 70/100) with the interview probe
 * for every missing element, answerable right here.
 */
export function StoryDepth({
  draft,
  photoCount,
  pillars,
  onApply,
  onAddPhoto,
}: {
  draft: DepthDraft;
  photoCount: number;
  pillars: PillarLite[];
  onApply: (target: DepthTarget, value: string) => void;
  onAddPhoto: () => void;
}) {
  const depth = memoryDepth({ ...draft, photoCount });
  const missing = depth.items.filter((i) => !i.present);
  const present = depth.items.filter((i) => i.present);
  const color = depth.ready ? "var(--sys-green)" : depth.score >= 45 ? "var(--sys-orange)" : "var(--sys-red)";
  return (
    <section className="card space-y-3 p-4" aria-label="Story depth">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="t-headline">Story depth</div>
          <p className="t-footnote text-label-2">
            {depth.ready
              ? "Enough real detail to write a post that sounds like you."
              : `A few more specifics will make the post feel real. Ready at ${READY_THRESHOLD}.`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="text-[28px] font-bold leading-8 tabular-nums" style={{ color }}>
            {depth.score}
          </span>
          <span className="t-footnote text-label-3">/100</span>
        </div>
      </div>
      <Meter value={depth.score / 100} color={color} />
      {present.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {present.map((i) => (
            <span key={i.key} className="chip" style={{ ["--chip-fg" as string]: "var(--sys-green)", ["--chip-bg" as string]: "color-mix(in srgb, var(--sys-green) 13%, transparent)" }}>
              <Check className="size-3" strokeWidth={3} />
              {i.label}
            </span>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="t-eyebrow">What would make it stronger</div>
          <ul className="space-y-1.5">
            {missing.map((i) => (
              <GapRow key={i.key} item={i} pillars={pillars} onApply={onApply} onAddPhoto={onAddPhoto} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
