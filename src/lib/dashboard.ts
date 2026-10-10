/**
 * Today dashboard: pure computation over a snapshot of the database.
 *
 * Kept free of `server-only` / DB imports so it can be unit tested; the snapshot is
 * gathered in `components/today/data.ts`. Everything date-related is computed in the
 * profile's timezone because "today" and "Tuesday" mean the person's local day.
 */
import type { Memory, PostStatus } from "./types";
import { parseAngleField } from "./factory/angles";

/* ------------------------------------------------------------------ */
/* Snapshot types                                                      */
/* ------------------------------------------------------------------ */

export type Cadence = { postsPerWeek: number; days: number[]; time: string };

export type SnapshotPillar = { id: string; name: string; weight: number; color: string };

export type SnapshotMemory = {
  id: string;
  title: string;
  status: Memory["status"];
  pillar: string | null;
  photoCount: number;
};

export type SnapshotPost = {
  id: string;
  status: PostStatus;
  memoryId: string | null;
  pillar: string | null;
  photoId: string | null;
  body: string;
  angle: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  metricsUpdatedAt: string | null;
  reactions: number | null;
  impressions: number | null;
};

export type DashboardSnapshot = {
  now: Date;
  timezone: string;
  hasStrategy: boolean;
  cadence: Cadence;
  pillars: SnapshotPillar[];
  activePositioningInterviewId: string | null;
  activeStoryInterviewId: string | null;
  voice: { ownSamples: number; analyzed: boolean };
  memories: SnapshotMemory[];
  posts: SnapshotPost[];
};

/* ------------------------------------------------------------------ */
/* Time helpers (timezone aware, no external tz library)               */
/* ------------------------------------------------------------------ */

export const DAY_MS = 86_400_000;

/** Validate an IANA timezone; fall back to UTC so a typo never breaks the dashboard. */
export function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/**
 * Parse timestamps written by SQLite (`2026-10-10 08:30:00`, UTC without a zone) or by
 * JS (`2026-10-10T08:30:00.000Z`). Returns null for empty/invalid values.
 */
export function parseDbDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const v = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(value) ? value.replace(" ", "T") + "Z" : value;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of `date` in `tz`. */
export function localParts(date: Date, tz: string): LocalParts {
  const parts = partsFormatter(safeTimezone(tz)).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    year,
    month,
    day,
    hour: get("hour") % 24,
    minute: get("minute"),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` of the local calendar day that `date` falls on in `tz`. */
export function localDayKey(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Add whole days to a `YYYY-MM-DD` key (pure calendar math, DST-proof). */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday for a `YYYY-MM-DD` key. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "08:30" → minutes since midnight (invalid → 8:30). */
export function timeToMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return 8 * 60 + 30;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

export function greetingFor(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/* ------------------------------------------------------------------ */
/* Cadence                                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_DAYS = [2, 3, 4];
/** Tie-break order when choosing posting days: Tue, Wed, Thu first, then Mon, Fri, weekend. */
const DAY_PREFERENCE = [2, 3, 4, 1, 5, 6, 0];

function combinations(items: number[], k: number): number[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)];
}

/** Smallest gap in days between consecutive posting days, wrapping around the week. */
function minCircularGap(days: number[]): number {
  if (days.length < 2) return 7;
  let min = 7;
  for (let i = 0; i < days.length; i++) {
    const next = i === days.length - 1 ? days[0] + 7 : days[i + 1];
    min = Math.min(min, next - days[i]);
  }
  return min;
}

/**
 * Weekdays that carry a posting slot: every chosen day when posts/week covers them, otherwise
 * the best-spaced subset (ties go to Tue/Wed/Thu). No days → Tue-Thu. Same rule as the
 * Calendar's planner (lib/calendar/slots.ts `postingDays`), so Today and Calendar agree on
 * which days are open.
 */
export function slotWeekdays(cadence: Cadence): Set<number> {
  const chosen = [...new Set(cadence.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  const days = chosen.length ? chosen : DEFAULT_DAYS;
  const want = Math.max(1, Math.min(Math.round(cadence.postsPerWeek) || 1, 7));
  if (want >= days.length) return new Set(days);
  let best: number[] = [];
  let bestGap = -1;
  let bestPref = Infinity;
  for (const combo of combinations(days, want)) {
    const gap = minCircularGap(combo);
    const pref = combo.reduce((s, d) => s + DAY_PREFERENCE.indexOf(d), 0);
    if (gap > bestGap || (gap === bestGap && pref < bestPref)) {
      best = combo;
      bestGap = gap;
      bestPref = pref;
    }
  }
  return new Set(best);
}

/* ------------------------------------------------------------------ */
/* Derived sets                                                        */
/* ------------------------------------------------------------------ */

const ACTIVE_POST = (p: SnapshotPost) => p.status !== "archived";

/** Memories that are ready and not yet claimed by any (non-archived) post. */
export function readyUnusedMemories(s: Pick<DashboardSnapshot, "memories" | "posts">): SnapshotMemory[] {
  const claimed = new Set(s.posts.filter(ACTIVE_POST).map((p) => p.memoryId).filter(Boolean));
  return s.memories.filter((m) => m.status === "ready" && !claimed.has(m.id));
}

/** Stories still in play (not used/archived) that have no photo yet. */
export function memoriesNeedingPhoto(memories: SnapshotMemory[]): SnapshotMemory[] {
  return memories.filter((m) => (m.status === "ready" || m.status === "raw") && m.photoCount === 0);
}

/** How many ready stories the next two weeks of cadence consume. */
export function storyBufferTarget(cadence: Cadence): number {
  return slotWeekdays(cadence).size * 2;
}

/** First line of a post (or its angle) for previews. */
export function hookOf(post: Pick<SnapshotPost, "body" | "angle">, max = 90): string {
  // posts.angle is a JSON document (see factory/angles.ts); fall back to the chosen angle's hook.
  const angle = parseAngleField(post.angle);
  const line = (post.body.split("\n").find((l) => l.trim()) || angle.selected?.hook || angle.selected?.takeaway || angle.note).trim();
  if (!line) return "";
  return line.length > max ? line.slice(0, max - 1).trimEnd() + "…" : line;
}

/** The local day a post occupies on the calendar (scheduled date, else publish date). */
function postDayKey(p: SnapshotPost, tz: string): string | null {
  const d = parseDbDate(p.status === "published" ? (p.publishedAt ?? p.scheduledAt) : p.scheduledAt);
  return d ? localDayKey(d, tz) : null;
}

/* ------------------------------------------------------------------ */
/* Open slots                                                          */
/* ------------------------------------------------------------------ */

/** Cadence days in the next `days` days (today included if its posting time hasn't passed) with no post on them. */
export function openSlots(s: DashboardSnapshot, days = 14): string[] {
  const tz = safeTimezone(s.timezone);
  const slotDays = slotWeekdays(s.cadence);
  const taken = new Set(s.posts.filter(ACTIVE_POST).map((p) => postDayKey(p, tz)).filter(Boolean) as string[]);
  const nowParts = localParts(s.now, tz);
  const todayKey = localDayKey(s.now, tz);
  const timePassed = nowParts.hour * 60 + nowParts.minute >= timeToMinutes(s.cadence.time);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDaysToKey(todayKey, i);
    if (!slotDays.has(weekdayOfKey(key))) continue;
    if (i === 0 && timePassed) continue;
    if (!taken.has(key)) out.push(key);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Pillar balance                                                      */
/* ------------------------------------------------------------------ */

export type PillarBalanceRow = {
  id: string;
  name: string;
  color: string;
  /** Target share of posts (0-1) from the pillar weights. */
  targetShare: number;
  /** Share of the ready stories that sit in this pillar (0-1). */
  storyShare: number;
  ready: number;
  /** Ready stories this pillar should have for the next two weeks, minus what it has. */
  gap: number;
  state: "ok" | "low" | "empty";
};

export function pillarBalance(s: Pick<DashboardSnapshot, "pillars" | "memories" | "posts" | "cadence">): PillarBalanceRow[] {
  if (s.pillars.length === 0) return [];
  const totalWeight = s.pillars.reduce((a, p) => a + Math.max(0, p.weight), 0);
  const ready = readyUnusedMemories(s);
  const known = new Set(s.pillars.map((p) => p.id));
  const readyInPillars = ready.filter((m) => m.pillar && known.has(m.pillar)).length;
  const need = storyBufferTarget(s.cadence);
  return s.pillars.map((p) => {
    const targetShare = totalWeight > 0 ? Math.max(0, p.weight) / totalWeight : 1 / s.pillars.length;
    const count = ready.filter((m) => m.pillar === p.id).length;
    const storyShare = readyInPillars > 0 ? count / readyInPillars : 0;
    const gap = Math.round((targetShare * need - count) * 10) / 10;
    const state: PillarBalanceRow["state"] = count === 0 && targetShare > 0 ? "empty" : gap >= 1 ? "low" : "ok";
    return { id: p.id, name: p.name, color: p.color, targetShare, storyShare, ready: count, gap, state };
  });
}

/** The pillar that most needs new stories (largest gap, ties → heavier weight). */
export function neediestPillar(rows: PillarBalanceRow[]): PillarBalanceRow | null {
  const candidates = rows.filter((r) => r.targetShare > 0);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.gap - a.gap || b.targetShare - a.targetShare)[0];
}

/* ------------------------------------------------------------------ */
/* Next best actions                                                   */
/* ------------------------------------------------------------------ */

export type NextActionKind =
  | "due"
  | "positioning"
  | "voice-import"
  | "voice-analyze"
  | "photos"
  | "resume-story"
  | "story"
  | "review"
  | "schedule"
  | "plan"
  | "metrics";

export type NextAction = {
  id: string;
  kind: NextActionKind;
  title: string;
  detail: string;
  href: string;
  cta: string;
  tone: string;
  /** Time-sensitive: sorted to the top. */
  urgent?: boolean;
};

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function formatLocalTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(date);
}

function formatLocalDay(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(date);
}

/** Posts that need attention today: due/overdue scheduled posts and today's posts that aren't ready. */
function dueActions(s: DashboardSnapshot): NextAction[] {
  const tz = safeTimezone(s.timezone);
  const todayKey = localDayKey(s.now, tz);
  const out: NextAction[] = [];
  const sorted = [...s.posts].sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
  for (const p of sorted) {
    const at = parseDbDate(p.scheduledAt);
    if (!at) continue;
    const key = localDayKey(at, tz);
    const hook = hookOf(p) || "Untitled post";
    if (p.status === "scheduled" || p.status === "approved") {
      if (at.getTime() <= s.now.getTime()) {
        out.push({
          id: `due-${p.id}`,
          kind: "due",
          title: key === todayKey ? `Post due at ${formatLocalTime(at, tz)}` : `Overdue since ${formatLocalDay(at, tz)}`,
          detail: `"${hook}" Copy it to LinkedIn, or publish from the Studio.`,
          href: `/studio/${p.id}`,
          cta: "Post it",
          tone: "red",
          urgent: true,
        });
      } else if (key === todayKey) {
        out.push({
          id: `today-${p.id}`,
          kind: "due",
          title: `Going out today at ${formatLocalTime(at, tz)}`,
          detail: `"${hook}" One last read before it goes live.`,
          href: `/studio/${p.id}`,
          cta: "Open",
          tone: "blue",
          urgent: true,
        });
      }
    } else if ((p.status === "idea" || p.status === "draft" || p.status === "review") && key === todayKey) {
      out.push({
        id: `unready-${p.id}`,
        kind: "due",
        title: `Today's post isn't approved yet`,
        detail: `Planned for ${formatLocalTime(at, tz)} and still ${p.status === "idea" ? "an idea" : `in ${p.status}`}. ${hook ? `"${hook}"` : ""}`.trim(),
        href: `/studio/${p.id}`,
        cta: p.status === "idea" ? "Write it" : "Finish it",
        tone: "orange",
        urgent: true,
      });
    }
  }
  return out;
}

/**
 * Ranked list of what the person should do next. Time-sensitive items (posts due today)
 * come first; the rest follow the setup funnel: strategy → voice → photos → stories →
 * review → calendar → metrics.
 */
export function computeNextActions(s: DashboardSnapshot): NextAction[] {
  const actions: NextAction[] = [...dueActions(s)];

  // 1. Positioning
  if (!s.hasStrategy) {
    actions.push(
      s.activePositioningInterviewId
        ? {
            id: "positioning",
            kind: "positioning",
            title: "Finish your positioning interview",
            detail: "You started it already. A few more answers and we can draft your strategy: audience, pillars and posting rhythm.",
            href: `/interviews/${s.activePositioningInterviewId}`,
            cta: "Continue",
            tone: "indigo",
          }
        : {
            id: "positioning",
            kind: "positioning",
            title: "Find your angle",
            detail: "A 10-15 minute positioning interview. We turn your answers into a strategy: who you write for, 3-4 content pillars and a posting rhythm.",
            href: "/interviews/new?kind=positioning&auto=1",
            cta: "Start",
            tone: "indigo",
          },
    );
  }

  // 2. Voice
  if (s.voice.ownSamples === 0) {
    actions.push({
      id: "voice-import",
      kind: "voice-import",
      title: "Teach us how you write",
      detail: "Paste a few of your LinkedIn posts so drafts match your tone and rhythm. Ten or more works best.",
      href: "/voice",
      cta: "Import posts",
      tone: "purple",
    });
  } else if (s.voice.ownSamples >= 3 && !s.voice.analyzed) {
    actions.push({
      id: "voice-analyze",
      kind: "voice-analyze",
      title: "Analyze your voice",
      detail: `You've imported ${plural(s.voice.ownSamples, "post")}. One click turns them into a style guide the writer follows.`,
      href: "/voice",
      cta: "Analyze",
      tone: "purple",
    });
  }

  // 3. Photos
  const noPhoto = memoriesNeedingPhoto(s.memories);
  if (noPhoto.length > 0) {
    actions.push({
      id: "photos",
      kind: "photos",
      title: noPhoto.length === 1 ? `"${noPhoto[0].title}" needs a photo` : `${noPhoto.length} stories need a photo`,
      detail: "A real, candid photo from the moment makes the post. A phone snapshot of the place, the people or the screen is perfect.",
      href: "/memories?filter=needs-photo",
      cta: "Add photos",
      tone: "orange",
    });
  }

  // 4. Story buffer
  const need = storyBufferTarget(s.cadence);
  const ready = readyUnusedMemories(s).length;
  if (s.activeStoryInterviewId) {
    actions.push({
      id: "resume-story",
      kind: "resume-story",
      title: "Pick up your story interview",
      detail: "You left a story half-told. Finish it and it lands in your Memory Bank.",
      href: `/interviews/${s.activeStoryInterviewId}`,
      cta: "Continue",
      tone: "blue",
    });
  } else if (ready < need) {
    const pillar = neediestPillar(pillarBalance(s));
    const missing = need - ready;
    actions.push({
      id: "story",
      kind: "story",
      title: `Find ${plural(missing, "more story", "more stories")}`,
      detail:
        `You have ${ready} ready for the next two weeks and post ${plural(slotWeekdays(s.cadence).size, "time")} a week. ` +
        (pillar ? `Start with ${pillar.name}: it's the thinnest pillar. ` : "") +
        "A 15-minute interview usually gives 1-3 stories.",
      href: pillar ? `/interviews/new?kind=story&pillar=${encodeURIComponent(pillar.id)}` : "/interviews/new?kind=story",
      cta: "Start interview",
      tone: "blue",
    });
  }

  // 5. Review
  const inReview = s.posts.filter((p) => p.status === "review");
  if (inReview.length > 0) {
    actions.push({
      id: "review",
      kind: "review",
      title: inReview.length === 1 ? "A draft is waiting for you" : `${inReview.length} drafts are waiting for you`,
      detail: "Read it out loud, change what doesn't sound like you, approve. About 3 minutes each.",
      href: inReview.length === 1 ? `/studio/${inReview[0].id}` : "/studio",
      cta: "Review",
      tone: "teal",
    });
  }

  // 6. Calendar
  const unscheduled = s.posts.filter((p) => p.status === "approved" && !p.scheduledAt);
  if (unscheduled.length > 0) {
    actions.push({
      id: "schedule",
      kind: "schedule",
      title: `${plural(unscheduled.length, "approved post")} without a date`,
      detail: "Drag them onto the calendar so they go out on your posting days.",
      href: "/calendar",
      cta: "Schedule",
      tone: "green",
    });
  }
  // Open slots only mean something once the person has chosen a posting rhythm.
  const open = s.hasStrategy ? openSlots(s) : [];
  if (open.length > 0) {
    actions.push({
      id: "plan",
      kind: "plan",
      title: `${plural(open.length, "open slot")} in the next two weeks`,
      detail:
        ready > 0
          ? "Auto-plan matches your posting days with ready stories, balanced across pillars."
          : "Nothing to plan yet. Run a story interview first, then auto-plan fills the gaps.",
      href: "/calendar",
      cta: "Plan",
      tone: "green",
    });
  }

  // 7. Metrics
  const cutoff = s.now.getTime() - 2 * DAY_MS;
  const missingMetrics = s.posts.filter((p) => {
    if (p.status !== "published" || p.metricsUpdatedAt || p.reactions !== null || p.impressions !== null) return false;
    const at = parseDbDate(p.publishedAt);
    return !!at && at.getTime() < cutoff;
  });
  if (missingMetrics.length > 0) {
    actions.push({
      id: "metrics",
      kind: "metrics",
      title: `Add numbers for ${plural(missingMetrics.length, "post")}`,
      detail: "Reactions and comments from posts older than two days show which stories land, and shape next month's plan.",
      href: "/insights",
      cta: "Add metrics",
      tone: "pink",
    });
  }

  // Stable sort: urgent first, everything else keeps funnel order.
  return actions.map((a, i) => ({ a, i })).sort((x, y) => Number(!!y.a.urgent) - Number(!!x.a.urgent) || x.i - y.i).map((x) => x.a);
}

/* ------------------------------------------------------------------ */
/* Pipeline stats                                                      */
/* ------------------------------------------------------------------ */

export type PipelineStats = {
  ready: number;
  readyUnused: number;
  needPhoto: number;
  drafts: number;
  inReview: number;
  scheduledNext14: number;
  approvedNext14: number;
  storyTarget: number;
};

export function pipelineStats(s: DashboardSnapshot): PipelineStats {
  const horizon = s.now.getTime() + 14 * DAY_MS;
  const upcoming = s.posts.filter((p) => {
    if (p.status === "archived" || p.status === "published") return false;
    const at = parseDbDate(p.scheduledAt);
    return !!at && at.getTime() >= s.now.getTime() && at.getTime() < horizon;
  });
  return {
    ready: s.memories.filter((m) => m.status === "ready").length,
    readyUnused: readyUnusedMemories(s).length,
    needPhoto: memoriesNeedingPhoto(s.memories).length,
    drafts: s.posts.filter((p) => p.status === "draft" || p.status === "review").length,
    inReview: s.posts.filter((p) => p.status === "review").length,
    scheduledNext14: upcoming.length,
    approvedNext14: upcoming.filter((p) => p.status === "approved" || p.status === "scheduled").length,
    storyTarget: storyBufferTarget(s.cadence),
  };
}

/** The next post on the calendar (scheduled time in the future, not yet published). */
export function nextScheduled(s: Pick<DashboardSnapshot, "now" | "posts">): { post: SnapshotPost; at: Date } | null {
  let best: { post: SnapshotPost; at: Date } | null = null;
  for (const p of s.posts) {
    if (p.status === "archived" || p.status === "published") continue;
    const at = parseDbDate(p.scheduledAt);
    if (!at || at.getTime() < s.now.getTime()) continue;
    if (!best || at.getTime() < best.at.getTime()) best = { post: p, at };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* This week strip                                                     */
/* ------------------------------------------------------------------ */

export type WeekPost = { id: string; status: PostStatus; pillar: string | null; photoId: string | null; hook: string; time: string };

export type WeekDay = {
  key: string;
  weekday: string;
  dayNumber: number;
  isToday: boolean;
  isSlot: boolean;
  /** A posting day with nothing planned (only for today and later). */
  open: boolean;
  posts: WeekPost[];
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Seven days starting today, in the profile's timezone. */
export function buildWeek(s: Pick<DashboardSnapshot, "now" | "timezone" | "cadence" | "posts">): WeekDay[] {
  const tz = safeTimezone(s.timezone);
  const todayKey = localDayKey(s.now, tz);
  const slots = slotWeekdays(s.cadence);
  const byDay = new Map<string, (WeekPost & { ts: number })[]>();
  for (const p of s.posts) {
    if (p.status === "archived") continue;
    const at = parseDbDate(p.status === "published" ? (p.publishedAt ?? p.scheduledAt) : p.scheduledAt);
    if (!at) continue;
    const key = localDayKey(at, tz);
    const list = byDay.get(key) ?? [];
    list.push({ id: p.id, status: p.status, pillar: p.pillar, photoId: p.photoId, hook: hookOf(p, 70), time: formatLocalTime(at, tz), ts: at.getTime() });
    byDay.set(key, list);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDaysToKey(todayKey, i);
    const wd = weekdayOfKey(key);
    // Earliest first within a day; the timestamp is only for sorting.
    const posts: WeekPost[] = (byDay.get(key) ?? []).sort((a, b) => a.ts - b.ts).map(({ ts: _ts, ...post }) => post);
    const isSlot = slots.has(wd);
    return {
      key,
      weekday: WEEKDAY_SHORT[wd],
      dayNumber: Number(key.slice(8, 10)),
      isToday: i === 0,
      isSlot,
      open: isSlot && posts.length === 0,
      posts,
    };
  });
}
