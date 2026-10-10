/**
 * Calendar presentation logic shared by the API and the client. Pure.
 *
 * A post's *display state* adds time to its stored status: a scheduled post whose time has
 * passed is "due" (post it now by hand, or it is about to be published), a planned idea whose
 * day passed before anyone approved it is "stale", and the publish marker on posts.error shows
 * "publishing" or, when it got stuck, "verify".
 */

import type { PostStatus } from "@/lib/types";
import { MISSED_MESSAGE, PUBLISHING_MARKER, STALE_PUBLISH_MS, VERIFY_MESSAGE, publishingSince } from "./linkedin-format";
import { addDays, addMonths, startOfMonth, startOfWeek, type DayKey } from "./time";

export type DisplayState = "idea" | "draft" | "review" | "approved" | "scheduled" | "due" | "publishing" | "verify" | "published" | "stale";

export const STATE_META: Record<DisplayState, { label: string; tone: string; description: string }> = {
  idea: { label: "Planned", tone: "gray", description: "A story is planned for this day. Draft it in the Studio." },
  draft: { label: "Draft", tone: "blue", description: "Drafted, not reviewed yet." },
  review: { label: "In review", tone: "orange", description: "Waiting for your read and approval." },
  approved: { label: "Approved", tone: "green", description: "Approved. Schedule it to put it in the queue." },
  scheduled: { label: "Scheduled", tone: "indigo", description: "Queued. It goes out at this time." },
  due: { label: "Due", tone: "red", description: "Its time has come. Post it now." },
  publishing: { label: "Publishing", tone: "teal", description: "Sending to LinkedIn." },
  verify: { label: "Check LinkedIn", tone: "yellow", description: VERIFY_MESSAGE },
  published: { label: "Posted", tone: "purple", description: "Live on LinkedIn." },
  stale: { label: "Missed", tone: "orange", description: "This day passed and the post didn't go out. Move it to a new day." },
};

export type StatePost = { status: PostStatus; scheduledAt: string | null; publishedAt: string | null; error: string | null };

export function displayState(post: StatePost, now: Date = new Date()): DisplayState {
  if (post.status === "published") return "published";
  const since = publishingSince(post.error);
  if (since && (post.status === "scheduled" || post.status === "approved")) {
    return now.getTime() - since.getTime() > STALE_PUBLISH_MS ? "verify" : "publishing";
  }
  if (post.error === VERIFY_MESSAGE) return "verify";
  const at = post.scheduledAt ? Date.parse(post.scheduledAt) : NaN;
  const past = !Number.isNaN(at) && at <= now.getTime();
  if (post.status === "scheduled") return past ? "due" : "scheduled";
  if (post.status === "approved") return past ? "stale" : "approved";
  if (post.status === "idea" || post.status === "draft" || post.status === "review") {
    if (!Number.isNaN(at) && at < now.getTime() - 60 * 60_000) return "stale";
    return post.status;
  }
  return "idea";
}

/** The error to show on a post, hiding stale scheduler messages once the post has a future time. */
export function visibleError(post: StatePost, now: Date = new Date()): string | null {
  if (!post.error || post.error.startsWith(PUBLISHING_MARKER)) return null;
  const at = post.scheduledAt ? Date.parse(post.scheduledAt) : NaN;
  if (post.status === "scheduled" && !Number.isNaN(at) && at > now.getTime() && post.error === MISSED_MESSAGE) return null;
  if (post.status === "published") return null;
  return post.error;
}

/* ------------------------------------------------------------------ */
/* Grids and ranges                                                    */
/* ------------------------------------------------------------------ */

export type CalendarView = "month" | "week";

export const WEEK_STARTS_ON = 1;

/** Weeks (rows of 7 day keys) covering the month that contains `anchor`. */
export function monthGrid(anchor: DayKey, weekStartsOn = WEEK_STARTS_ON): DayKey[][] {
  const first = startOfMonth(anchor);
  const nextMonth = addMonths(anchor, 1);
  let cursor = startOfWeek(first, weekStartsOn);
  const weeks: DayKey[][] = [];
  while (cursor < nextMonth || weeks.length === 0) {
    const week: DayKey[] = [];
    for (let i = 0; i < 7; i++) week.push(addDays(cursor, i));
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

export function weekKeys(anchor: DayKey, weekStartsOn = WEEK_STARTS_ON): DayKey[] {
  const start = startOfWeek(anchor, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Visible range [from, to) as day keys for a view. */
export function viewRange(view: CalendarView, anchor: DayKey, weekStartsOn = WEEK_STARTS_ON): { from: DayKey; to: DayKey } {
  if (view === "week") {
    const from = startOfWeek(anchor, weekStartsOn);
    return { from, to: addDays(from, 7) };
  }
  const weeks = monthGrid(anchor, weekStartsOn);
  return { from: weeks[0][0], to: addDays(weeks[weeks.length - 1][6], 1) };
}

/** Anchor after moving one page in a view. */
export function shiftAnchor(view: CalendarView, anchor: DayKey, dir: -1 | 1): DayKey {
  return view === "week" ? addDays(anchor, 7 * dir) : addMonths(anchor, dir);
}

const keyDate = (key: DayKey) => new Date(`${key}T12:00:00Z`);

export function formatMonthTitle(anchor: DayKey, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(keyDate(anchor));
}

export function formatWeekTitle(anchor: DayKey, locale?: string, weekStartsOn = WEEK_STARTS_ON): string {
  const days = weekKeys(anchor, weekStartsOn);
  const a = keyDate(days[0]);
  const b = keyDate(days[6]);
  const sameMonth = days[0].slice(0, 7) === days[6].slice(0, 7);
  const f = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(d);
  return sameMonth
    ? `${f(a, { month: "long", day: "numeric" })} – ${f(b, { day: "numeric" })}, ${f(b, { year: "numeric" })}`
    : `${f(a, { month: "short", day: "numeric" })} – ${f(b, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function formatDayLong(key: DayKey, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(keyDate(key));
}

export function formatDayShort(key: DayKey, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(keyDate(key));
}

export function weekdayLabels(locale?: string, weekStartsOn = WEEK_STARTS_ON): string[] {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + ((i + weekStartsOn) % 7), 12))),
  );
}

export function dayOfMonth(key: DayKey): number {
  return Number(key.slice(8, 10));
}
