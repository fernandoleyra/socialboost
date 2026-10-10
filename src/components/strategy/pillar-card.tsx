"use client";

import Link from "next/link";
import { Check, Mic, Trash2 } from "lucide-react";
import type { Pillar } from "@/lib/types";
import { IconButton, Input, TONES, cx } from "@/components/ui";
import { PILLAR_COLORS } from "@/lib/strategy";
import { AutoTextarea } from "./auto-textarea";
import { ListEditor } from "./list-editor";

export function PillarCard({
  pillar,
  share,
  stories,
  onChange,
  onRemove,
}: {
  pillar: Pillar;
  /** Whole-number percentage of posts this pillar gets. */
  share: number;
  /** Stories in the Memory Bank filed under this pillar. */
  stories: number;
  onChange: (p: Pillar) => void;
  onRemove: () => void;
}) {
  const tone = TONES[pillar.color] ?? TONES.blue;
  const set = <K extends keyof Pillar>(k: K, v: Pillar[K]) => onChange({ ...pillar, [k]: v });

  return (
    <div className="card relative overflow-hidden p-5 animate-in">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: tone.fg }} />
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full t-subhead font-bold" style={{ color: tone.fg, background: tone.bg }}>
          {share}%
        </span>
        <Input
          value={pillar.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Pillar name, e.g. Building with AI in finance"
          aria-label="Pillar name"
          className="bg-transparent! shadow-none! px-1! text-[17px]! font-semibold tracking-tight focus:bg-fill-4!"
          maxLength={80}
        />
        <IconButton label={`Remove pillar ${pillar.name || ""}`.trim()} onClick={onRemove} className="shrink-0 text-label-3! hover:text-sys-red!">
          <Trash2 className="size-4" />
        </IconButton>
      </div>

      <div className="mt-4 space-y-5">
        <label className="block space-y-1.5">
          <span className="px-1 t-footnote font-semibold text-label-2">What it covers</span>
          <AutoTextarea
            minRows={2}
            value={pillar.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="The angle you own here and who it's for."
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block space-y-2">
            <span className="flex items-baseline justify-between px-1">
              <span className="t-footnote font-semibold text-label-2">Share of posts</span>
              <span className="t-footnote tabular-nums text-label-2">weight {pillar.weight}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pillar.weight}
              onChange={(e) => set("weight", Number(e.target.value))}
              className="h-6 w-full cursor-pointer"
              style={{ accentColor: tone.fg }}
              aria-label={`Weight for ${pillar.name || "this pillar"}`}
            />
          </label>
          <div className="space-y-2">
            <span className="block px-1 t-footnote font-semibold text-label-2">Color</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pillar color">
              {PILLAR_COLORS.map((c) => {
                const t = TONES[c];
                const active = pillar.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={c}
                    onClick={() => set("color", c)}
                    className={cx("grid size-6 place-items-center rounded-full transition-transform hover:scale-110 focus-ring", active && "ring-2 ring-offset-2 ring-offset-[var(--bg-elevated)]")}
                    style={{ background: t.fg, ["--tw-ring-color" as string]: t.fg }}
                  >
                    {active && <Check className="size-3.5 text-white" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="px-1">
            <div className="t-footnote font-semibold text-label-2">Stories that belong here</div>
            <p className="t-caption text-label-3">Story interviews for this pillar start from these. Write them as moments to remember, not topics.</p>
          </div>
          <ListEditor
            label="Story prompt"
            items={pillar.storyPrompts}
            onChange={(v) => set("storyPrompts", v)}
            placeholder="The first time a client pushed back on…"
            addLabel="Add story prompt"
            max={12}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-separator pt-4">
        <span className="t-footnote text-label-2">
          {stories === 0 ? "No stories filed here yet" : `${stories} ${stories === 1 ? "story" : "stories"} in your Memory Bank`}
        </span>
        {pillar.name.trim() ? (
          <Link href={`/interviews/new?kind=story&pillar=${encodeURIComponent(pillar.id)}`} className={cx("btn btn-sm", stories === 0 ? "btn-tinted" : "btn-plain")}>
            <Mic className="size-3.5" />
            Find a story for this pillar
          </Link>
        ) : (
          <span className="t-footnote text-label-3">Name the pillar to save it</span>
        )}
      </div>
    </div>
  );
}
