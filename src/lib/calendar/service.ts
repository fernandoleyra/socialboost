import "server-only";
import { authEnabled, icsKey as gateIcsKey, safeEqual } from "@/lib/auth";
import { getDb, logActivity } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { getSetting, setSetting } from "@/lib/settings";
import { createPost, getPost, getStrategy, listMemories, listPosts, saveStrategy, updatePost, type Profile } from "@/lib/repo";
import { getLinkedInAccount } from "@/lib/linkedin";
import { STRUCTURES } from "@/lib/factory/structures";
import type { Post, Strategy } from "@/lib/types";
import { buildIcs, type IcsEvent } from "./ics";
import { computeInsights, type Insights, type InsightPillar } from "./insights";
import { LINKEDIN_MAX_CHARS, PUBLISHING_MARKER, publishingSince, STALE_PUBLISH_MS } from "./linkedin-format";
import { matchMetricsRows, parseMetricsCsv } from "./metrics-import";
import { planCalendar, planMessages } from "./plan";
import { DEFAULT_CADENCE, cadenceNote, cadenceSlots, cadenceTime, markTaken, postingDays, type Cadence } from "./slots";
import { addDays, dayKeyOf, isDayKey, parseDbDate, safeTimezone, startOfDayUtc, timeOf, type DayKey } from "./time";
import { STATE_META, displayState, visibleError } from "./view";
import type { CalendarData, CalendarPillar, CalendarPost, ImportPreview, LinkedInStatus, PlanPreview } from "./types";

export type { CalendarData, CalendarPillar, CalendarPost, ImportPreview, LinkedInStatus, PlanPreview, PlanPreviewItem } from "./types";

/**
 * Calendar, planning, feed and insights over the database. Server-only; the maths lives in the
 * pure modules next to this file.
 */

const DAY_MS = 86_400_000;

/* ================================================================== */
/* Shapes sent to the client                                          */
/* ================================================================== */

function hookOf(body: string): string {
  return (body.split("\n").find((l) => l.trim()) ?? "").trim();
}

function postInstant(p: Post): string | null {
  const raw = p.status === "published" ? (p.publishedAt ?? p.scheduledAt) : p.scheduledAt;
  const d = parseDbDate(raw);
  return d ? d.toISOString() : null;
}

export function toCalendarPost(p: Post, tz: string, memoryTitles: Map<string, string>, now: Date): CalendarPost {
  const at = postInstant(p);
  return {
    id: p.id,
    status: p.status,
    state: displayState(p, now),
    pillar: p.pillar,
    hook: hookOf(p.body),
    body: p.body,
    photoId: p.photoId,
    memoryId: p.memoryId,
    memoryTitle: p.memoryId ? (memoryTitles.get(p.memoryId) ?? null) : null,
    scheduledAt: p.scheduledAt,
    publishedAt: p.publishedAt,
    at,
    day: at ? dayKeyOf(at, tz) : null,
    time: at ? timeOf(at, tz) : null,
    linkedinUrl: p.linkedinUrl,
    error: visibleError(p, now),
    score: p.quality?.score ?? null,
    format: p.format,
    impressions: p.impressions,
    reactions: p.reactions,
    comments: p.comments,
    reposts: p.reposts,
  };
}

function strategyOf(profileId: string): Strategy | null {
  return getStrategy(profileId);
}

function cadenceOf(strategy: Strategy | null): Cadence {
  return strategy?.cadence ?? DEFAULT_CADENCE;
}

function pillarsOf(strategy: Strategy | null): CalendarPillar[] {
  return (strategy?.pillars ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color, weight: p.weight }));
}

export function linkedinStatus(profileId: string, posts: Post[] = []): LinkedInStatus {
  const a = getLinkedInAccount(profileId);
  if (!a) return { connected: false, name: "", picture: "", expired: false, expiringSoon: false, daysLeft: 0, expiresAt: null, scheduledAfterExpiry: 0 };
  const expires = Date.parse(a.expiresAt);
  const scheduledAfterExpiry = posts.filter((p) => p.status === "scheduled" && p.scheduledAt && Date.parse(p.scheduledAt) > expires).length;
  return { connected: true, name: a.name, picture: a.picture, expired: a.expired, expiringSoon: a.expiringSoon, daysLeft: a.daysLeft, expiresAt: a.expiresAt, scheduledAfterExpiry };
}

function memoryTitleMap(profileId: string): Map<string, string> {
  return new Map(listMemories(profileId).map((m) => [m.id, m.title]));
}

/** Range from query values: day keys (end exclusive) or ISO instants. Max 100 days. */
export function resolveRange(fromRaw: string | null, toRaw: string | null, tz: string, now: Date): { from: DayKey; to: DayKey } {
  const toKey = (raw: string | null): DayKey | null => {
    if (!raw) return null;
    if (isDayKey(raw)) return raw;
    const d = parseDbDate(raw);
    return d ? dayKeyOf(d, tz) : null;
  };
  const today = dayKeyOf(now, tz);
  const from = toKey(fromRaw) ?? addDays(today, -7);
  let to = toKey(toRaw) ?? addDays(from, 42);
  if (to <= from) to = addDays(from, 1);
  if (startOfDayUtc(to, tz).getTime() - startOfDayUtc(from, tz).getTime() > 100 * DAY_MS) throw new HttpError(400, "That range is too long. Ask for 100 days or fewer.");
  return { from, to };
}

export function getCalendarData(profile: Profile, range: { from: DayKey; to: DayKey }, now: Date = new Date()): CalendarData {
  const tz = safeTimezone(profile.timezone);
  const strategy = strategyOf(profile.id);
  const cadence = cadenceOf(strategy);
  const titles = memoryTitleMap(profile.id);
  const all = listPosts(profile.id).filter((p) => p.status !== "archived");
  const fromT = startOfDayUtc(range.from, tz).getTime();
  const toT = startOfDayUtc(range.to, tz).getTime();

  const inRange = all.filter((p) => {
    const at = postInstant(p);
    if (!at) return false;
    const t = Date.parse(at);
    return t >= fromT && t < toT;
  });
  const unscheduled = all.filter((p) => p.status === "approved" && !p.scheduledAt);

  // Open slots from now on; a slot is taken when its local day already has any post.
  const slotFrom = new Date(Math.max(fromT, now.getTime()));
  const slots = markTaken(
    cadenceSlots({ cadence, timezone: tz, from: slotFrom, to: new Date(toT) }),
    all.map((p) => ({ id: p.id, at: postInstant(p) })),
    tz,
  );

  return {
    timezone: tz,
    todayKey: dayKeyOf(now, tz),
    now: now.toISOString(),
    from: range.from,
    to: range.to,
    posts: inRange.map((p) => toCalendarPost(p, tz, titles, now)).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")),
    unscheduled: unscheduled.map((p) => toCalendarPost(p, tz, titles, now)),
    due: all
      .filter((p) => p.status === "scheduled" || p.status === "approved")
      .map((p) => toCalendarPost(p, tz, titles, now))
      .filter((p) => p.state === "due" || p.state === "verify")
      .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")),
    slots,
    cadence: { days: cadence.days, postingDays: postingDays(cadence), time: cadenceTime(cadence), postsPerWeek: cadence.postsPerWeek, note: cadenceNote(cadence) },
    pillars: pillarsOf(strategy),
    hasStrategy: !!strategy,
    linkedin: linkedinStatus(profile.id, all),
    icsPath: icsPath(profile.id),
  };
}

/* ================================================================== */
/* Moving posts                                                        */
/* ================================================================== */

/**
 * Put a post on a day/time (or take it off the calendar). Approved posts become scheduled;
 * ideas, drafts and posts in review keep their status and are only planned for that time.
 * A new time clears any old scheduler message.
 */
export function moveOnCalendar(profile: Profile, postId: string, scheduledAt: string | null, now: Date = new Date()): Post {
  const post = getPost(postId);
  if (!post || post.profileId !== profile.id) throw new HttpError(404, "Post not found");
  if (post.status === "published") throw new HttpError(409, "This post is already published.", "Published posts stay on the day they went out.");
  if (post.status === "archived") throw new HttpError(409, "This post is archived.");
  const since = publishingSince(post.error);
  if (since && now.getTime() - since.getTime() < STALE_PUBLISH_MS) throw new HttpError(409, "This post is being published right now.");
  const clearError = post.error && !post.error.startsWith(PUBLISHING_MARKER) ? null : post.error;

  if (scheduledAt === null) {
    return updatePost(post.id, { scheduledAt: null, status: post.status === "scheduled" ? "approved" : post.status, error: clearError });
  }
  const t = Date.parse(scheduledAt);
  if (Number.isNaN(t)) throw new HttpError(400, "That date doesn't look right.");
  if (t < now.getTime() - 5 * 60_000) throw new HttpError(400, "That time has already passed.", "Pick today or a later day.");
  const schedule = post.status === "approved" || post.status === "scheduled";
  if (schedule) {
    const body = post.body.trim();
    if (!body) throw new HttpError(400, "This post has no text yet.");
    if (body.length > LINKEDIN_MAX_CHARS) throw new HttpError(400, `The post is ${body.length.toLocaleString("en")} characters.`, "LinkedIn allows 3,000. Shorten it first.");
  }
  const updated = updatePost(post.id, { scheduledAt: new Date(t).toISOString(), status: schedule ? "scheduled" : post.status, error: clearError });
  if (schedule && post.status !== "scheduled") {
    const tz = safeTimezone(profile.timezone);
    logActivity("post", `Scheduled for ${dayKeyOf(updated.scheduledAt!, tz)} ${timeOf(updated.scheduledAt!, tz)}: ${hookOf(updated.body) || "Untitled post"}`, { profileId: profile.id, refId: post.id });
  }
  return updated;
}

/* ================================================================== */
/* Auto-plan                                                           */
/* ================================================================== */

export function planFor(profile: Profile, opts: { weeks: number; dryRun: boolean; useInsights?: boolean }, now: Date = new Date()): { preview: PlanPreview; created: CalendarPost[] } {
  const tz = safeTimezone(profile.timezone);
  const strategy = strategyOf(profile.id);
  const cadence = cadenceOf(strategy);
  let pillars = pillarsOf(strategy);
  let weightsFrom: PlanPreview["weightsFrom"] = "strategy";
  if (opts.useInsights && pillars.length > 1) {
    const rec = insightsFor(profile, now).insights.weights;
    if (rec.ready) {
      const suggested = new Map(rec.rows.map((r) => [r.pillarId, r.suggested]));
      pillars = pillars.map((p) => ({ ...p, weight: suggested.get(p.id) ?? p.weight }));
      weightsFrom = "insights";
    }
  }

  const from = new Date(now.getTime() + 60 * 60_000);
  const to = new Date(now.getTime() + opts.weeks * 7 * DAY_MS);
  const all = listPosts(profile.id).filter((p) => p.status !== "archived");
  const slots = markTaken(
    cadenceSlots({ cadence, timezone: tz, from, to }),
    all.map((p) => ({ id: p.id, at: postInstant(p) })),
    tz,
  );
  const open = slots.filter((s) => !s.taken);

  const windowStart = now.getTime() - 28 * DAY_MS;
  const existing = all
    .map((p) => ({ at: postInstant(p), pillar: p.pillar }))
    .filter((e): e is { at: string; pillar: string | null } => !!e.at && Date.parse(e.at) >= windowStart && Date.parse(e.at) < to.getTime());

  const usedMemories = new Set(all.map((p) => p.memoryId).filter(Boolean) as string[]);
  const memories = listMemories(profile.id, { status: "ready" })
    .filter((m) => !usedMemories.has(m.id))
    .map((m) => ({ id: m.id, title: m.title, pillar: m.pillar, strength: m.strength, coverPhotoId: m.coverPhotoId ?? null, photoCount: m.photoCount ?? 0, createdAt: m.createdAt }));

  const result = planCalendar({ slots: open, memories, pillars, existing, now });
  const preview: PlanPreview = {
    weeks: opts.weeks,
    from: from.toISOString(),
    to: to.toISOString(),
    openSlots: open.length,
    items: result.assignments.map((a) => ({ ...a, time: timeOf(a.at, tz) })),
    gaps: result.gaps,
    unfilled: result.unfilled.map((u) => ({ ...u, time: timeOf(u.at, tz) })),
    needsPhoto: result.needsPhoto,
    messages: planMessages(result, open.length),
    readyStories: memories.length,
    weightsFrom,
  };
  if (opts.dryRun || result.assignments.length === 0) return { preview, created: [] };

  const created: Post[] = [];
  const tx = getDb().transaction(() => {
    for (const a of result.assignments) {
      created.push(createPost({ profileId: profile.id, memoryId: a.memoryId, pillar: a.pillar, photoId: a.photoId, scheduledAt: a.at, status: "idea" }));
    }
  });
  tx();
  logActivity("calendar", `Planned ${created.length} ${created.length === 1 ? "post" : "posts"} for the next ${opts.weeks} weeks`, { profileId: profile.id });
  const titles = memoryTitleMap(profile.id);
  return { preview, created: created.map((p) => toCalendarPost(p, tz, titles, now)) };
}

/* ================================================================== */
/* iCalendar feed                                                      */
/* ================================================================== */

const icsSettingKey = (profileId: string) => `calendar:ics:${profileId}`;

/** The profile's own feed secret (rotatable from the Subscribe sheet). */
export function icsToken(profileId: string, rotate = false): string {
  const cur = getSetting<string | null>(icsSettingKey(profileId), null);
  if (cur && !rotate) return cur;
  const token = crypto.randomUUID().replace(/-/g, "");
  setSetting(icsSettingKey(profileId), token);
  return token;
}

export function verifyIcsToken(profileId: string, token: string | null): boolean {
  const cur = getSetting<string | null>(icsSettingKey(profileId), null);
  return !!cur && !!token && safeEqual(token, cur);
}

/**
 * Feed path for calendar apps, which can't send the session cookie. `token` is the profile's own
 * secret. With the password gate on (SOCIALBOOST_PASSWORD), `key` carries the gate's read-only
 * feed key so src/proxy.ts lets the request through to this route.
 */
export function icsPath(profileId: string, rotate = false): string {
  const q = new URLSearchParams({ profile: profileId, token: icsToken(profileId, rotate) });
  if (authEnabled()) q.set("key", gateIcsKey());
  return `/api/calendar/ics?${q.toString()}`;
}

export function icsFeed(profile: Profile, origin: string, now: Date = new Date()): string {
  const tz = safeTimezone(profile.timezone);
  const strategy = strategyOf(profile.id);
  const pillarNames = new Map(pillarsOf(strategy).map((p) => [p.id, p.name]));
  const lo = now.getTime() - 60 * DAY_MS;
  const hi = now.getTime() + 180 * DAY_MS;
  const events: IcsEvent[] = [];
  for (const p of listPosts(profile.id)) {
    if (p.status === "archived") continue;
    const at = postInstant(p);
    if (!at) continue;
    const t = Date.parse(at);
    if (t < lo || t > hi) continue;
    const state = displayState(p, now);
    const hook = hookOf(p.body);
    const label = state === "published" ? "Posted" : state === "scheduled" ? "LinkedIn post" : STATE_META[state].label;
    const link = `${origin}/studio/${p.id}`;
    const footer = [`${STATE_META[state].label} · ${timeOf(at, tz)} ${tz}`, ...(p.linkedinUrl ? [`On LinkedIn: ${p.linkedinUrl}`] : []), `Open in SocialBoost: ${link}`];
    const description = [p.body.trim() || "No text yet. Open the post in SocialBoost to draft it.", "", ...footer].join("\n");
    events.push({
      uid: `${p.id}@socialboost`,
      start: new Date(t),
      durationMinutes: 15,
      summary: `${label}: ${hook || "Untitled post"}`.slice(0, 160),
      description,
      url: link,
      status: ["approved", "scheduled", "published"].includes(p.status) ? "CONFIRMED" : "TENTATIVE",
      categories: p.pillar && pillarNames.has(p.pillar) ? [pillarNames.get(p.pillar)!] : undefined,
      lastModified: parseDbDate(p.updatedAt),
    });
  }
  return buildIcs({ name: `${profile.name} · LinkedIn posts`, description: "Planned and scheduled LinkedIn posts from SocialBoost", events, now });
}

/* ================================================================== */
/* Insights                                                            */
/* ================================================================== */

export const FORMAT_NAMES: Record<string, string> = {
  story: "Story",
  lesson: "Lesson",
  contrarian: "Contrarian",
  "behind-the-scenes": "Behind the scenes",
  list: "List",
  question: "Question",
};

export function insightsFor(profile: Profile, now: Date = new Date()): { insights: Insights; pillars: InsightPillar[]; timezone: string } {
  const tz = safeTimezone(profile.timezone);
  const pillars = pillarsOf(strategyOf(profile.id));
  const posts = listPosts(profile.id, { status: "published" }).map((p) => ({
    id: p.id,
    body: p.body,
    pillar: p.pillar,
    format: p.format,
    angle: p.angle,
    photoId: p.photoId,
    publishedAt: parseDbDate(p.publishedAt)?.toISOString() ?? null,
    linkedinUrl: p.linkedinUrl,
    impressions: p.impressions,
    reactions: p.reactions,
    comments: p.comments,
    reposts: p.reposts,
  }));
  const structureNames = Object.fromEntries(STRUCTURES.map((s) => [s.id, s.name]));
  return { insights: computeInsights(posts, { pillars, timezone: tz, structureNames, formatNames: FORMAT_NAMES, now }), pillars, timezone: tz };
}

export type MetricsInput = { impressions?: number | null; reactions?: number | null; comments?: number | null; reposts?: number | null };

export function saveMetrics(profile: Profile, postId: string, m: MetricsInput): Post {
  const post = getPost(postId);
  if (!post || post.profileId !== profile.id) throw new HttpError(404, "Post not found");
  if (post.status !== "published") throw new HttpError(409, "Log results once the post is published.");
  const patch: Partial<Post> = { metricsUpdatedAt: new Date().toISOString() };
  if (m.impressions !== undefined) patch.impressions = m.impressions;
  if (m.reactions !== undefined) patch.reactions = m.reactions;
  if (m.comments !== undefined) patch.comments = m.comments;
  if (m.reposts !== undefined) patch.reposts = m.reposts;
  return updatePost(post.id, patch);
}

export function importMetrics(profile: Profile, csv: string, dryRun: boolean): ImportPreview {
  const parsed = parseMetricsCsv(csv);
  if (parsed.errors.length && !parsed.rows.length) return { matches: [], unmatched: [], errors: parsed.errors, applied: 0 };
  const posts = listPosts(profile.id, { status: "published" });
  const byId = new Map(posts.map((p) => [p.id, p]));
  const { matches, unmatched } = matchMetricsRows(
    parsed.rows,
    posts.map((p) => ({ id: p.id, linkedinUrl: p.linkedinUrl, linkedinUrn: p.linkedinUrn, publishedAt: parseDbDate(p.publishedAt)?.toISOString() ?? null })),
    profile.timezone,
  );
  let applied = 0;
  if (!dryRun && matches.length) {
    const tx = getDb().transaction(() => {
      for (const m of matches) {
        const patch: MetricsInput = {};
        if (m.row.impressions !== null) patch.impressions = m.row.impressions;
        if (m.row.reactions !== null) patch.reactions = m.row.reactions;
        if (m.row.comments !== null) patch.comments = m.row.comments;
        if (m.row.reposts !== null) patch.reposts = m.row.reposts;
        saveMetrics(profile, m.postId, patch);
        applied++;
      }
    });
    tx();
    logActivity("insights", `Imported results for ${applied} ${applied === 1 ? "post" : "posts"}`, { profileId: profile.id });
  }
  return {
    matches: matches.map((m) => {
      const p = byId.get(m.postId)!;
      return { postId: m.postId, hook: hookOf(p.body), publishedAt: p.publishedAt, by: m.by, line: m.row.line, impressions: m.row.impressions, reactions: m.row.reactions, comments: m.row.comments, reposts: m.row.reposts };
    }),
    unmatched,
    errors: parsed.errors,
    applied,
  };
}

/** Write pillar weights into the strategy: the given ones, or the current suggestion. */
export function applyWeights(profile: Profile, weights?: Record<string, number>): Strategy {
  const strategy = strategyOf(profile.id);
  if (!strategy || strategy.pillars.length === 0) throw new HttpError(409, "Add content pillars to your strategy first.");
  let next: Record<string, number>;
  if (weights) {
    const ids = new Set(strategy.pillars.map((p) => p.id));
    for (const [id, w] of Object.entries(weights)) {
      if (!ids.has(id)) throw new HttpError(400, "One of those pillars isn't in your strategy anymore. Refresh and try again.");
      if (!Number.isFinite(w) || w < 0 || w > 100) throw new HttpError(400, "Weights must be between 0 and 100.");
    }
    next = weights;
  } else {
    const rec = insightsFor(profile).insights.weights;
    if (!rec.ready) throw new HttpError(409, rec.reason ?? "Not enough results yet.");
    next = Object.fromEntries(rec.rows.map((r) => [r.pillarId, r.suggested]));
  }
  const updated: Strategy = { ...strategy, pillars: strategy.pillars.map((p) => (next[p.id] !== undefined ? { ...p, weight: Math.round(next[p.id]) } : p)) };
  saveStrategy(profile.id, updated);
  logActivity("strategy", `Updated pillar weights from Insights: ${updated.pillars.map((p) => `${p.name} ${p.weight}%`).join(", ")}`, { profileId: profile.id });
  return updated;
}
