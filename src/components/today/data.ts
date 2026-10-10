import "server-only";
import {
  buildWeek,
  computeNextActions,
  greetingFor,
  hookOf,
  localParts,
  nextScheduled,
  parseDbDate,
  pillarBalance,
  pipelineStats,
  safeTimezone,
  type DashboardSnapshot,
} from "@/lib/dashboard";
import { getStrategy, getVoiceProfile, listActivity, listInterviews, listMemories, listPosts, listVoiceSamples, type Profile } from "@/lib/repo";
import { isStrategyEmpty, pillarIdOf } from "@/lib/strategy";

export type ActivityItem = { id: number; kind: string; message: string; href: string | null; at: string };

/** Gather everything the Today page needs from SQLite and compute the view model. */
export function loadDashboard(profile: Profile, now = new Date()) {
  const tz = safeTimezone(profile.timezone);
  const strategy = getStrategy(profile.id);
  const interviews = listInterviews(profile.id);
  const activeOf = (kind: "positioning" | "story") => interviews.find((i) => i.kind === kind && i.status === "active" && (i.messageCount ?? 0) > 0)?.id ?? null;
  const voice = getVoiceProfile(profile.id);
  const pillars = strategy?.pillars ?? [];

  const snapshot: DashboardSnapshot = {
    now,
    timezone: tz,
    hasStrategy: !isStrategyEmpty(strategy),
    cadence: strategy?.cadence ?? { postsPerWeek: 3, days: [2, 3, 4], time: "08:30" },
    pillars: pillars.map((p) => ({ id: p.id, name: p.name, weight: p.weight, color: p.color })),
    activePositioningInterviewId: activeOf("positioning"),
    activeStoryInterviewId: activeOf("story"),
    voice: { ownSamples: listVoiceSamples(profile.id, "own").length, analyzed: !!voice.stats },
    memories: listMemories(profile.id, { status: "active" }).map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      pillar: pillarIdOf(pillars, m.pillar) ?? m.pillar,
      photoCount: m.photoCount ?? 0,
    })),
    posts: listPosts(profile.id).map((p) => ({
      id: p.id,
      status: p.status,
      memoryId: p.memoryId,
      pillar: p.pillar,
      photoId: p.photoId,
      body: p.body,
      angle: p.angle,
      scheduledAt: p.scheduledAt,
      publishedAt: p.publishedAt,
      metricsUpdatedAt: p.metricsUpdatedAt,
      reactions: p.reactions,
      impressions: p.impressions,
    })),
  };

  const local = localParts(now, tz);
  const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(now);

  const activity: ActivityItem[] = listActivity(profile.id, 8).map((a) => ({
    id: a.id,
    kind: a.kind,
    message: a.message,
    href: activityHref(a.kind, a.refId),
    at: (parseDbDate(a.createdAt) ?? now).toISOString(),
  }));

  const next = nextScheduled(snapshot);
  const nextPost = next
    ? {
        id: next.post.id,
        status: next.post.status,
        hook: hookOf(next.post, 80),
        when: new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(next.at),
      }
    : null;

  return {
    firstName: profile.name.trim().split(/\s+/)[0] || profile.name,
    greeting: greetingFor(local.hour),
    dateLabel,
    timezone: tz,
    hasStrategy: snapshot.hasStrategy,
    cadence: snapshot.cadence,
    pillars: snapshot.pillars,
    actions: computeNextActions(snapshot),
    stats: pipelineStats(snapshot),
    week: buildWeek(snapshot),
    balance: pillarBalance(snapshot),
    activity,
    nextPost,
  };
}

export type DashboardView = ReturnType<typeof loadDashboard>;

/** Where an activity entry should link. Only routes we know exist. */
function activityHref(kind: string, refId: string | null): string | null {
  const k = kind.toLowerCase();
  if (k.startsWith("memory")) return refId ? `/memories?open=${encodeURIComponent(refId)}` : "/memories";
  // Photo entries point at the story the photo was added to.
  if (k.startsWith("photo")) return refId ? `/memories?open=${encodeURIComponent(refId)}` : "/photos";
  if (k.startsWith("linkedin")) return "/settings/linkedin";
  if (k.startsWith("voice")) return "/voice";
  if (k.startsWith("strategy")) return "/strategy";
  if (k.startsWith("profile")) return "/settings";
  if (k.startsWith("insight") || k.startsWith("metric")) return "/insights";
  if (k.startsWith("calendar") || k.startsWith("plan")) return "/calendar";
  if (k.startsWith("interview")) return refId ? `/interviews/${encodeURIComponent(refId)}` : "/interviews";
  if (k.startsWith("post") || k.startsWith("publish") || k.startsWith("studio") || k.startsWith("draft")) return refId ? `/studio/${encodeURIComponent(refId)}` : "/studio";
  return null;
}
