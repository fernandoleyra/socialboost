"use client";

import type { DragEvent } from "react";
import { Camera } from "lucide-react";
import { cx } from "@/components/ui";
import type { CalendarPillar, CalendarPost } from "@/lib/calendar/types";
import { STATE_META } from "@/lib/calendar/view";
import { PillarDot, StateIcon, photoUrl, pillarById, toneOf } from "./helpers";

export const DRAG_TYPE = "application/x-socialboost-post";

export function isMovable(post: CalendarPost): boolean {
  return post.state !== "published" && post.state !== "publishing";
}

type PillProps = {
  post: CalendarPost;
  pillars: CalendarPillar[];
  onOpen: (post: CalendarPost) => void;
  onDragStart?: (post: CalendarPost) => void;
  onDragEnd?: () => void;
};

function dragHandlers(post: CalendarPost, onDragStart?: (p: CalendarPost) => void, onDragEnd?: () => void) {
  if (!isMovable(post) || !onDragStart) return {};
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, post.id);
      e.dataTransfer.setData("text/plain", post.hook || "Post");
      e.dataTransfer.effectAllowed = "move";
      onDragStart(post);
    },
    onDragEnd: () => onDragEnd?.(),
  };
}

const label = (post: CalendarPost) => `${STATE_META[post.state].label}${post.time ? ` at ${post.time}` : ""}: ${post.hook || "Untitled post"}`;

/** One line in a month cell: pillar bar, state icon, time, hook. */
export function CompactPill({ post, pillars, onOpen, onDragStart, onDragEnd }: PillProps) {
  const pillar = pillarById(pillars, post.pillar);
  const t = toneOf(pillar?.color ?? "gray");
  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      title={label(post)}
      aria-label={label(post)}
      className={cx(
        "group flex w-full min-w-0 items-center gap-1.5 rounded-[8px] border-l-[3px] py-[3px] pl-1.5 pr-1 text-left t-caption transition-[transform,background] hover:brightness-[1.03] active:scale-[0.98] focus-ring",
        isMovable(post) && onDragStart && "cursor-grab active:cursor-grabbing",
        post.state === "published" && "opacity-80",
      )}
      style={{ background: t.bg, borderLeftColor: t.fg }}
      {...dragHandlers(post, onDragStart, onDragEnd)}
    >
      <StateIcon state={post.state} className="size-3" />
      {post.time && <span className="shrink-0 font-semibold tabular-nums text-label-2">{post.time}</span>}
      <span className="min-w-0 flex-1 truncate font-medium text-label">{post.hook || "Untitled post"}</span>
      {!post.photoId && post.state !== "published" && <Camera className="size-3 shrink-0 text-sys-orange" aria-label="Needs a photo" />}
    </button>
  );
}

/** Bigger card for the week view and the unscheduled tray. */
export function CardPill({ post, pillars, onOpen, onDragStart, onDragEnd, showDate }: PillProps & { showDate?: string }) {
  const pillar = pillarById(pillars, post.pillar);
  const st = STATE_META[post.state];
  const t = toneOf(st.tone);
  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      aria-label={label(post)}
      className={cx(
        "group block w-full overflow-hidden rounded-inner bg-fill-4 text-left transition-transform hover:-translate-y-0.5 active:scale-[0.98] focus-ring",
        isMovable(post) && onDragStart && "cursor-grab active:cursor-grabbing",
      )}
      {...dragHandlers(post, onDragStart, onDragEnd)}
    >
      {post.photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl(post.photoId)} alt="" loading="lazy" draggable={false} className="h-24 w-full object-cover" />
      ) : (
        <div
          className="flex h-16 w-full items-center justify-center gap-1.5 t-caption-2 font-semibold"
          style={{ color: "var(--sys-orange)", background: "linear-gradient(135deg, color-mix(in srgb, var(--sys-orange) 16%, transparent), color-mix(in srgb, var(--sys-pink) 10%, transparent))" }}
        >
          <Camera className="size-3.5" aria-hidden />
          Needs a photo
        </div>
      )}
      <div className="space-y-1 p-2">
        <div className="flex items-center gap-1 t-caption-2 font-semibold" style={{ color: t.fg }}>
          <StateIcon state={post.state} className="size-3" />
          <span className="truncate">
            {st.label}
            {showDate ? ` · ${showDate}` : post.time ? ` · ${post.time}` : ""}
          </span>
        </div>
        <div className="t-caption line-clamp-3 text-label">{post.hook || "Untitled post"}</div>
        {pillar && (
          <div className="flex items-center gap-1 t-caption-2 text-label-2">
            <PillarDot color={pillar.color} className="size-1.5" />
            <span className="truncate">{pillar.name}</span>
          </div>
        )}
      </div>
    </button>
  );
}

/** A list row for the phone agenda. */
export function RowPill({ post, pillars, onOpen }: PillProps) {
  const pillar = pillarById(pillars, post.pillar);
  const st = STATE_META[post.state];
  return (
    <button type="button" onClick={() => onOpen(post)} className="list-row w-full text-left transition-colors hover:bg-fill-4 focus-ring" aria-label={label(post)}>
      {post.photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl(post.photoId)} alt="" loading="lazy" className="size-12 shrink-0 rounded-[10px] object-cover" />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-[10px] text-sys-orange" style={{ background: "color-mix(in srgb, var(--sys-orange) 14%, transparent)" }}>
          <Camera className="size-4" aria-label="Needs a photo" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block t-subhead font-medium line-clamp-2">{post.hook || "Untitled post"}</span>
        <span className="mt-0.5 flex items-center gap-1.5 t-caption text-label-2">
          <StateIcon state={post.state} className="size-3" />
          {st.label}
          {post.time && <span className="tabular-nums">· {post.time}</span>}
          {pillar && (
            <>
              <span>·</span>
              <PillarDot color={pillar.color} className="size-1.5" />
              <span className="truncate">{pillar.name}</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}
