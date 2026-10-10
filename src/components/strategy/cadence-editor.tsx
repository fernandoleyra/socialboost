"use client";

import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import type { Strategy } from "@/lib/types";
import { IconButton, Input, cx } from "@/components/ui";
import { MAX_POSTS_PER_WEEK, MIN_POSTS_PER_WEEK, WEEKDAYS, setPostsPerWeek, toggleDay } from "./model";

type Cadence = Strategy["cadence"];

export function CadenceEditor({ cadence, timezone, onChange }: { cadence: Cadence; timezone: string; onChange: (c: Cadence) => void }) {
  const n = cadence.postsPerWeek;
  const tip =
    n <= 2
      ? "A gentle start. Two good posts a week beat four rushed ones."
      : n === 3
        ? "The sustainable baseline: about one story interview a week keeps it full."
        : n <= 5
          ? "The reach sweet spot. Make sure your Memory Bank holds 10+ ready stories."
          : "Daily posting needs a deep story bank and time to reply to comments every day.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="t-subhead font-semibold">Posts per week</div>
          <p className="t-footnote text-label-2 max-w-md">{tip}</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-fill-4 p-1">
          <IconButton label="Fewer posts" disabled={n <= MIN_POSTS_PER_WEEK} onClick={() => onChange(setPostsPerWeek(cadence, n - 1))} className="disabled:opacity-30">
            <Minus className="size-4" />
          </IconButton>
          <span className="w-10 text-center text-[22px] font-bold tabular-nums" aria-live="polite">
            {n}
          </span>
          <IconButton label="More posts" disabled={n >= MAX_POSTS_PER_WEEK} onClick={() => onChange(setPostsPerWeek(cadence, n + 1))} className="disabled:opacity-30">
            <Plus className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="space-y-2">
        <div className="t-subhead font-semibold">Posting days</div>
        <div className="grid grid-cols-7 gap-1.5 sm:flex sm:flex-wrap" role="group" aria-label="Posting days">
          {WEEKDAYS.map((d) => {
            const on = cadence.days.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                aria-pressed={on}
                aria-label={d.label}
                onClick={() => onChange(toggleDay(cadence, d.value))}
                className={cx(
                  "h-10 rounded-full t-footnote font-semibold transition-colors focus-ring sm:w-14",
                  on ? "bg-accent text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35)]" : "bg-fill-4 text-label-2 hover:bg-fill-3",
                )}
              >
                {d.short}
              </button>
            );
          })}
        </div>
        <p className="px-1 t-caption text-label-3">Tuesday to Thursday mornings are the busiest days on LinkedIn. Keep at least a day between posts.</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="block space-y-1.5">
          <span className="px-1 t-footnote font-semibold text-label-2">Time</span>
          <Input type="time" value={cadence.time} onChange={(e) => e.target.value && onChange({ ...cadence, time: e.target.value })} className="w-36!" step={300} />
        </label>
        <p className="pb-2 t-footnote text-label-2">
          In {timezone.replace(/_/g, " ")}.{" "}
          <Link href="/settings#profile" className="text-accent hover:underline">
            Change timezone
          </Link>
        </p>
      </div>
    </div>
  );
}
