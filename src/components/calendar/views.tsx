"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { cx } from "@/components/ui";
import type { Slot } from "@/lib/calendar/slots";
import type { CalendarData, CalendarPost } from "@/lib/calendar/types";
import { weekdayOf, type DayKey } from "@/lib/calendar/time";
import { dayOfMonth, formatDayLong, monthGrid, weekKeys, weekdayLabels } from "@/lib/calendar/view";
import { PillarDot, pillarById } from "./helpers";
import { CardPill, CompactPill, DRAG_TYPE, RowPill } from "./post-pill";

export const LOCALE = "en-GB";
const MAX_IN_CELL = 3;

export type ViewProps = {
  anchor: DayKey;
  data: CalendarData;
  dragging: CalendarPost | null;
  onOpenPost: (post: CalendarPost) => void;
  onOpenSlot: (slot: Slot) => void;
  onDragStart: (post: CalendarPost) => void;
  onDragEnd: () => void;
  onDropDay: (day: DayKey, postId: string) => void;
};

export function groupByDay(posts: CalendarPost[]): Map<DayKey, CalendarPost[]> {
  const map = new Map<DayKey, CalendarPost[]>();
  for (const p of posts) {
    if (!p.day) continue;
    if (!map.has(p.day)) map.set(p.day, []);
    map.get(p.day)!.push(p);
  }
  for (const list of map.values()) list.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  return map;
}

export function openSlotsByDay(slots: Slot[]): Map<DayKey, Slot> {
  return new Map(slots.filter((s) => !s.taken).map((s) => [s.day, s]));
}

/** Drop-target wiring for a day: highlights while a post hovers, refuses past days. */
function useDropTarget(day: DayKey, todayKey: DayKey, dragging: CalendarPost | null, onDropDay: ViewProps["onDropDay"]) {
  const [over, setOver] = useState(false);
  const allowed = !!dragging && day >= todayKey && dragging.day !== day;
  return {
    over: over && allowed,
    allowed,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!allowed) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_TYPE);
        if (!id || !allowed) return;
        e.preventDefault();
        onDropDay(day, id);
      },
    },
  };
}

function OpenSlotButton({ slot, onOpenSlot, compact }: { slot: Slot; onOpenSlot: (s: Slot) => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpenSlot(slot)}
      className={cx(
        "flex w-full items-center justify-center gap-1 rounded-[8px] border border-dashed border-separator text-label-2 transition-colors hover:border-accent hover:text-accent focus-ring",
        compact ? "py-[3px] t-caption" : "flex-col rounded-inner py-4 t-caption font-medium",
      )}
      aria-label={`Open slot at ${slot.time}. Fill it.`}
    >
      <Plus className={compact ? "size-3" : "size-4"} aria-hidden />
      {compact ? <span className="tabular-nums">Open · {slot.time}</span> : <span>Open slot · {slot.time}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Month                                                               */
/* ------------------------------------------------------------------ */

function MonthCell({
  day,
  inMonth,
  posts,
  slot,
  selected,
  onSelectDay,
  onShowDay,
  ...p
}: ViewProps & { day: DayKey; inMonth: boolean; posts: CalendarPost[]; slot: Slot | undefined; selected: boolean; onSelectDay: (d: DayKey) => void; onShowDay: (d: DayKey) => void }) {
  const { data } = p;
  const isToday = day === data.todayKey;
  const isPast = day < data.todayKey;
  const drop = useDropTarget(day, data.todayKey, p.dragging, p.onDropDay);
  const extra = posts.length - MAX_IN_CELL;
  return (
    <div
      {...drop.handlers}
      role="gridcell"
      aria-selected={selected}
      className={cx(
        "relative min-w-0 border-separator transition-colors",
        "h-[58px] sm:h-auto sm:min-h-[124px]",
        !inMonth && "bg-fill-4/60",
        drop.over && "bg-accent/10 outline-2 -outline-offset-2 outline-dashed outline-accent",
      )}
    >
      {/* Phone: the whole cell selects the day. */}
      <button type="button" className="absolute inset-0 sm:hidden focus-ring" aria-label={formatDayLong(day, LOCALE)} aria-pressed={selected} onClick={() => onSelectDay(day)} />
      <div className="pointer-events-none flex items-center justify-center pt-1.5 sm:pointer-events-auto sm:justify-end sm:px-1.5">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onShowDay(day)}
          title="Show this week"
          className={cx(
            "grid size-7 place-items-center rounded-full t-footnote font-semibold tabular-nums sm:hover:bg-fill-3",
            isToday ? "bg-[var(--accent-fill,var(--accent))] text-white sm:hover:bg-[var(--accent-fill,var(--accent))]" : selected ? "bg-fill-2 sm:bg-transparent" : "",
            !isToday && (!inMonth || isPast) && "text-label-3",
          )}
          aria-label={`${formatDayLong(day, LOCALE)}${isToday ? ", today" : ""}. Show this week.`}
        >
          {dayOfMonth(day)}
        </button>
      </div>
      {/* Phone: dots. */}
      <div className="pointer-events-none mt-1 flex justify-center gap-[3px] sm:hidden">
        {posts.slice(0, 4).map((post) => (
          <PillarDot key={post.id} color={pillarById(data.pillars, post.pillar)?.color ?? (post.state === "due" ? "red" : "gray")} className="size-[6px]" />
        ))}
        {slot && posts.length === 0 && <span className="size-[6px] rounded-full border border-label-3" aria-hidden />}
      </div>
      {/* Desktop: pills. */}
      <div className="hidden space-y-[3px] px-1.5 pb-1.5 pt-1 sm:block">
        {posts.slice(0, MAX_IN_CELL).map((post) => (
          <CompactPill key={post.id} post={post} pillars={data.pillars} onOpen={p.onOpenPost} onDragStart={p.onDragStart} onDragEnd={p.onDragEnd} />
        ))}
        {extra > 0 && (
          <button type="button" className="w-full rounded-[8px] px-1.5 py-[2px] text-left t-caption font-semibold text-label-2 hover:bg-fill-3 focus-ring" onClick={() => onShowDay(day)}>
            {extra} more
          </button>
        )}
        {slot && posts.length === 0 && <OpenSlotButton slot={slot} onOpenSlot={p.onOpenSlot} compact />}
      </div>
    </div>
  );
}

export function MonthView(props: ViewProps & { selectedDay: DayKey; onSelectDay: (d: DayKey) => void; onShowDay: (d: DayKey) => void }) {
  const { anchor, data } = props;
  const weeks = monthGrid(anchor);
  const byDay = groupByDay(data.posts);
  const slots = openSlotsByDay(data.slots);
  const month = anchor.slice(0, 7);
  return (
    <div className="card overflow-hidden" role="grid" aria-label="Month">
      <div className="grid grid-cols-7 border-b border-separator" role="row">
        {weekdayLabels(LOCALE).map((d) => (
          <div key={d} role="columnheader" className="py-2 text-center t-caption font-semibold uppercase tracking-wide text-label-2">
            <span className="sm:hidden">{d.slice(0, 1)}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} role="row" className="grid grid-cols-7 divide-x divide-separator border-b border-separator last:border-b-0">
          {week.map((day) => (
            <MonthCell
              key={day}
              {...props}
              day={day}
              inMonth={day.slice(0, 7) === month}
              posts={byDay.get(day) ?? []}
              slot={slots.get(day)}
              selected={day === props.selectedDay}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Phone-only agenda for the selected day under the month grid. */
export function DayAgenda({ day, data, onOpenPost, onOpenSlot }: { day: DayKey; data: CalendarData; onOpenPost: (p: CalendarPost) => void; onOpenSlot: (s: Slot) => void }) {
  const posts = groupByDay(data.posts).get(day) ?? [];
  const slot = openSlotsByDay(data.slots).get(day);
  return (
    <section className="space-y-2 sm:hidden" aria-label={formatDayLong(day, LOCALE)}>
      {/* Server and browser ICU can word dates slightly differently; the browser's version wins. */}
      <h3 className="px-1 t-footnote font-semibold uppercase tracking-wide text-label-2" suppressHydrationWarning>
        {formatDayLong(day, LOCALE)}
      </h3>
      {posts.length === 0 && !slot ? (
        <div className="card px-4 py-5 text-center t-subhead text-label-2">
          {day < data.todayKey ? "Nothing went out this day." : data.cadence.postingDays.includes(weekdayOf(day)) ? "Nothing planned." : "Nothing planned. Not one of your posting days."}
        </div>
      ) : (
        <div className="card list-group">
          {posts.map((post) => (
            <RowPill key={post.id} post={post} pillars={data.pillars} onOpen={onOpenPost} />
          ))}
          {slot && (
            <button type="button" className="list-row w-full text-left text-accent hover:bg-fill-4 focus-ring" onClick={() => onOpenSlot(slot)}>
              <span className="grid size-12 place-items-center rounded-[10px] border border-dashed border-separator">
                <Plus className="size-4" aria-hidden />
              </span>
              <span className="t-subhead font-medium">Open slot at {slot.time}. Fill it.</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Week                                                                */
/* ------------------------------------------------------------------ */

function WeekColumn({ day, posts, slot, ...p }: ViewProps & { day: DayKey; posts: CalendarPost[]; slot: Slot | undefined }) {
  const { data } = p;
  const isToday = day === data.todayKey;
  const isPast = day < data.todayKey;
  const drop = useDropTarget(day, data.todayKey, p.dragging, p.onDropDay);
  const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  let body: ReactNode;
  if (posts.length === 0 && !slot) body = <div className="flex flex-1 items-center px-1 t-caption text-label-3 md:justify-center md:py-6">{isPast ? "" : "Rest day"}</div>;
  else
    body = (
      <>
        {/* Phone: rows. Desktop: cards. */}
        <div className="card list-group md:hidden">
          {posts.map((post) => (
            <RowPill key={post.id} post={post} pillars={data.pillars} onOpen={p.onOpenPost} />
          ))}
          {slot && (
            <button type="button" className="list-row w-full text-left text-accent hover:bg-fill-4 focus-ring" onClick={() => p.onOpenSlot(slot)}>
              <Plus className="size-4" aria-hidden />
              <span className="t-subhead font-medium">Open slot at {slot.time}</span>
            </button>
          )}
        </div>
        <div className="hidden flex-col gap-2 md:flex">
          {posts.map((post) => (
            <CardPill key={post.id} post={post} pillars={data.pillars} onOpen={p.onOpenPost} onDragStart={p.onDragStart} onDragEnd={p.onDragEnd} />
          ))}
          {slot && <OpenSlotButton slot={slot} onOpenSlot={p.onOpenSlot} />}
        </div>
      </>
    );
  return (
    <div
      {...drop.handlers}
      className={cx(
        "flex min-w-0 flex-col gap-2 rounded-card p-1 md:min-h-[300px] md:border md:border-[color:var(--card-border)] md:bg-[var(--card)] md:p-2.5 md:shadow-[var(--glass-shadow-sm)] md:backdrop-blur-xl",
        drop.over && "bg-accent/10 outline-2 outline-dashed outline-accent",
      )}
    >
      <div className="flex items-center justify-between px-1">
        <span className={cx("t-caption font-semibold uppercase tracking-wide", isToday ? "text-accent" : "text-label-2")}>{weekday}</span>
        <span className={cx("grid size-7 place-items-center rounded-full t-subhead font-semibold tabular-nums", isToday && "bg-[var(--accent-fill,var(--accent))] text-white", !isToday && isPast && "text-label-3")}>
          {dayOfMonth(day)}
        </span>
      </div>
      {body}
    </div>
  );
}

export function WeekView(props: ViewProps) {
  const days = weekKeys(props.anchor);
  const byDay = groupByDay(props.data.posts);
  const slots = openSlotsByDay(props.data.slots);
  return (
    <div className="grid gap-3 md:grid-cols-7 md:gap-2" aria-label="Week">
      {days.map((day) => (
        <WeekColumn key={day} {...props} day={day} posts={byDay.get(day) ?? []} slot={slots.get(day)} />
      ))}
    </div>
  );
}
