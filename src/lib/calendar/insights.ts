/**
 * Insights: what's working, from the person's own published posts. Pure, unit-tested.
 *
 * Research 02 §1.3/§9: vendor benchmarks are directional at best, so compare each post against
 * the person's OWN median and group by pillar, opening style, structure, weekday and format.
 *
 *  - Engagement score = reactions + 3 × comments + 2 × reposts (comments and reposts say more
 *    than a tap). With impressions we use the rate score / impressions; without, the raw score.
 *  - Each post gets an index = value / median of posts measured the same way, so posts with and
 *    without impressions can be compared (1.0 = a typical post for this person).
 *  - Group indexes are Bayesian-smoothed toward 1.0 (prior worth 2 posts) so one lucky post
 *    can't steer the strategy.
 *  - Suggested pillar weights scale each pillar's share by its smoothed index, then cap every
 *    change at ±15 points (and keep a 5-point floor) so positioning doesn't drift.
 */

import { matchStructureId } from "@/lib/factory/structures";
import { dayKeyOf, safeTimezone, weekdayOf, zonedParts } from "./time";
import { WEEKDAY_LONG } from "./slots";

export type InsightPost = {
  id: string;
  body: string;
  pillar: string | null;
  format: string;
  angle: string;
  photoId: string | null;
  publishedAt: string | null;
  linkedinUrl: string | null;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
};

export type InsightPillar = { id: string; name: string; color: string; weight: number };

export type HookType = "number" | "question" | "scene" | "contrarian" | "credential" | "statement";

export const HOOK_TYPE_INFO: Record<HookType, { label: string; description: string }> = {
  scene: { label: "Scene", description: "Opens in a moment: a time, a place, something happening" },
  number: { label: "Number", description: "Opens on a figure, a result or a stat" },
  question: { label: "Question", description: "Opens by asking the reader something" },
  contrarian: { label: "Contrarian", description: "Opens against a common belief" },
  credential: { label: "Credential", description: "Opens on experience: years, hires, things built" },
  statement: { label: "Statement", description: "A plain claim or confession" },
};

const PRIOR_WEIGHT = 2;
const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

export function firstLine(body: string): string {
  return (body.split("\n").find((l) => l.trim()) ?? "").trim();
}

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const DAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";

const CONTRARIAN =
  /\b(unpopular opinion|hot take|controversial|nobody tells you|no one tells you|everyone (says|tells|thinks|believes)|most people (think|believe|get|are wrong)|is overrated|are overrated|is a myth|is dead|wrong about|stop (doing|saying|writing|chasing|hiring|asking|using)|you don'?t need|doesn'?t work|the truth is|forget (about )?(the|your)|i disagree|isn'?t the problem|is not the problem)\b/i;
const CREDENTIAL = [
  /\b(after|in|over|across)\s+(\d[\d,.]*\+?|a decade|two decades|ten|twenty|fifteen|hundreds of|thousands of)\s+(years?|hires|clients|companies|startups|projects|interviews|deals|founders|customers|launches|teams|posts|campaigns|calls)\b/i,
  /\bi(?:'ve| have)\s+(built|hired|founded|led|run|coached|trained|interviewed|sold|launched|managed|raised|written|shipped|grown|scaled|advised|mentored|worked with)\b[^.?!]*\d/i,
  /\b\d+\s+years\s+(as|of|in|at|building|running|leading)\b/i,
];
const INTERROGATIVE = /^(why|what|how|who|when|where|which|do|does|did|are|is|was|were|have|has|would|should|could|can|will|ever|quick question)\b/i;
const SCENE = new RegExp(
  [
    `\\b(yesterday|last (week|month|year|night|summer|winter|spring|fall|autumn|${DAYS})|this (morning|afternoon|evening|week)|on (a )?(${DAYS})|tonight|earlier today)\\b`,
    `\\b\\d{1,2}(:\\d{2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)?`,
    `\\b\\d{1,2}\\s*(am|pm|a\\.m\\.|p\\.m\\.)`,
    `\\b(in|back in) (19|20)\\d{2}\\b`,
    `\\b(${MONTHS}) \\d{1,2}\\b`,
    `\\b(${MONTHS}) (19|20)\\d{2}\\b`,
    `\\bi was (standing|sitting|walking|driving|waiting|on|in|at|halfway)\\b`,
    `\\b(when i was|the day i|the night i|the morning i|the first time i)\\b`,
  ].join("|"),
  "i",
);
const NUMBER = /(\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion)\b)/i;

/** Heuristic opening-style classifier for the first line of a post. */
export function classifyHook(line: string): HookType {
  const text = line.trim();
  if (!text) return "statement";
  if (CONTRARIAN.test(text)) return "contrarian";
  if (CREDENTIAL.some((r) => r.test(text))) return "credential";
  const endsWithQuestion = /\?["”'»)]*$/.test(text);
  if (endsWithQuestion && INTERROGATIVE.test(text)) return "question";
  if (SCENE.test(text)) return "scene";
  if (/[$€£¥]\s?\d|\d\s?(%|k\b|x\b)/i.test(text) || /\d/.test(text)) return "number";
  if (endsWithQuestion) return "question";
  if (NUMBER.test(text) && /\b(\d+|hundred|thousand|million|billion)\b/i.test(text)) return "number";
  return "statement";
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

type Metrics = Pick<InsightPost, "impressions" | "reactions" | "comments" | "reposts">;

export function hasMetrics(m: Metrics): boolean {
  return m.reactions !== null || m.comments !== null || m.reposts !== null || m.impressions !== null;
}

export function engagementScore(m: Metrics): number {
  return (m.reactions ?? 0) + 3 * (m.comments ?? 0) + 2 * (m.reposts ?? 0);
}

/** Weighted engagement per impression, or null without impressions. */
export function engagementRate(m: Metrics): number | null {
  return m.impressions && m.impressions > 0 ? engagementScore(m) / m.impressions : null;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Index of each measured post vs. the person's median (1 = typical). */
export function postIndexes(posts: (Metrics & { id: string })[]): Map<string, number> {
  const rated = posts.filter((p) => hasMetrics(p) && engagementRate(p) !== null);
  const raw = posts.filter((p) => hasMetrics(p) && engagementRate(p) === null);
  const out = new Map<string, number>();
  const assign = (group: typeof posts, value: (p: (typeof posts)[number]) => number) => {
    const med = median(group.map(value));
    for (const p of group) {
      const v = value(p);
      out.set(p.id, med > 0 ? v / med : v > 0 ? 2 : 1);
    }
  };
  assign(rated, (p) => engagementRate(p)!);
  assign(raw, (p) => engagementScore(p));
  return out;
}

/* ------------------------------------------------------------------ */
/* Grouping                                                            */
/* ------------------------------------------------------------------ */

export type GroupStat = {
  key: string;
  label: string;
  color?: string;
  count: number;
  avgReactions: number;
  avgComments: number;
  avgReposts: number;
  avgImpressions: number | null;
  avgRate: number | null;
  /** Mean index of the group (1 = typical). */
  index: number;
  /** Index pulled toward 1 by a prior worth two average posts. */
  smoothed: number;
};

export function smoothIndex(indexes: number[], prior = PRIOR_WEIGHT): number {
  return (indexes.reduce((s, x) => s + x, 0) + prior) / (indexes.length + prior);
}

type Measured = InsightPost & { idx: number };

function groupBy(posts: Measured[], keyOf: (p: Measured) => { key: string; label: string; color?: string } | null): GroupStat[] {
  const groups = new Map<string, { label: string; color?: string; posts: Measured[] }>();
  for (const p of posts) {
    const k = keyOf(p);
    if (!k) continue;
    if (!groups.has(k.key)) groups.set(k.key, { label: k.label, color: k.color, posts: [] });
    groups.get(k.key)!.posts.push(p);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return [...groups.entries()].map(([key, g]) => {
    const withImpr = g.posts.filter((p) => (p.impressions ?? 0) > 0);
    const rates = g.posts.map(engagementRate).filter((r): r is number => r !== null);
    const indexes = g.posts.map((p) => p.idx);
    return {
      key,
      label: g.label,
      color: g.color,
      count: g.posts.length,
      avgReactions: avg(g.posts.map((p) => p.reactions ?? 0)),
      avgComments: avg(g.posts.map((p) => p.comments ?? 0)),
      avgReposts: avg(g.posts.map((p) => p.reposts ?? 0)),
      avgImpressions: withImpr.length ? avg(withImpr.map((p) => p.impressions!)) : null,
      avgRate: rates.length ? avg(rates) : null,
      index: avg(indexes),
      smoothed: smoothIndex(indexes),
    };
  });
}

const bySmoothed = (a: GroupStat, b: GroupStat) => b.smoothed - a.smoothed || b.count - a.count || a.label.localeCompare(b.label);

/**
 * Structure id and opening type the Studio recorded in posts.angle (JSON, see factory/angles.ts),
 * when present. Structure ids are mapped to the library's canonical ids, like the Studio reads them.
 */
export function angleInfo(raw: string | null | undefined): { structureId: string | null; hookType: string | null } {
  const text = (raw ?? "").trim();
  if (!text.startsWith("{")) return { structureId: null, hookType: null };
  try {
    const j = JSON.parse(text) as { selected?: { structureId?: unknown; hookType?: unknown } | null };
    const s = j.selected;
    return {
      structureId: s && typeof s.structureId === "string" && s.structureId ? (matchStructureId(s.structureId) ?? s.structureId) : null,
      hookType: s && typeof s.hookType === "string" && s.hookType ? s.hookType : null,
    };
  } catch {
    return { structureId: null, hookType: null };
  }
}

export const LENGTH_BANDS: { key: string; label: string; max: number }[] = [
  { key: "short", label: "Under 600 chars", max: 600 },
  { key: "medium", label: "600–1,000", max: 1000 },
  { key: "long", label: "1,000–1,500", max: 1500 },
  { key: "longer", label: "1,500–2,000", max: 2000 },
  { key: "longest", label: "Over 2,000", max: Infinity },
];

export function lengthBand(chars: number) {
  return LENGTH_BANDS.find((b) => chars < b.max) ?? LENGTH_BANDS[LENGTH_BANDS.length - 1];
}

export function timeOfDayBucket(hour: number): { key: string; label: string } {
  if (hour < 11) return { key: "morning", label: "Morning (before 11)" };
  if (hour < 14) return { key: "midday", label: "Midday (11–14)" };
  if (hour < 18) return { key: "afternoon", label: "Afternoon (14–18)" };
  return { key: "evening", label: "Evening (after 18)" };
}

/* ------------------------------------------------------------------ */
/* Weights                                                             */
/* ------------------------------------------------------------------ */

export type WeightRow = { pillarId: string; name: string; color: string; current: number; suggested: number; delta: number; count: number; smoothed: number | null };
export type WeightsRecommendation = { ready: boolean; reason: string | null; rows: WeightRow[]; changed: boolean };

/** Integers summing to `total`, closest to the inputs (largest remainder). */
export function roundToTotal(values: number[], total = 100): number[] {
  const floors = values.map((v) => Math.floor(v));
  let rest = total - floors.reduce((s, x) => s + x, 0);
  const order = values.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length, rest--) floors[order[k].i]++;
  return floors;
}

export const MAX_WEIGHT_SHIFT = 15;
export const MIN_WEIGHT_FLOOR = 5;
export const MIN_POSTS_FOR_WEIGHTS = 5;

export function recommendWeights(pillars: InsightPillar[], byPillar: GroupStat[], measuredCount: number, maxShift = MAX_WEIGHT_SHIFT): WeightsRecommendation {
  if (pillars.length === 0) return { ready: false, reason: "Add content pillars in your strategy first.", rows: [], changed: false };
  const totalWeight = pillars.reduce((s, p) => s + Math.max(0, p.weight), 0);
  const current = roundToTotal(pillars.map((p) => (totalWeight > 0 ? (Math.max(0, p.weight) / totalWeight) * 100 : 100 / pillars.length)));
  const stats = new Map(byPillar.map((g) => [g.key, g]));

  const factor = pillars.map((p) => stats.get(p.id)?.smoothed ?? 1);
  const rawSum = current.reduce((s, c, i) => s + c * factor[i], 0);
  const target = current.map((c, i) => (rawSum > 0 ? (c * factor[i] * 100) / rawSum : c));
  const lo = current.map((c) => Math.max(0, c - maxShift, Math.min(c, MIN_WEIGHT_FLOOR)));
  const hi = current.map((c) => Math.min(100, c + maxShift));

  // Clamp, then hand the leftover to pillars that still have room, until it settles.
  let x = target.map((t, i) => Math.min(hi[i], Math.max(lo[i], t)));
  for (let iter = 0; iter < 50; iter++) {
    const residual = 100 - x.reduce((s, v) => s + v, 0);
    if (Math.abs(residual) < 1e-9) break;
    const free = x.map((v, i) => (residual > 0 ? v < hi[i] - 1e-9 : v > lo[i] + 1e-9));
    const base = x.reduce((s, v, i) => s + (free[i] ? Math.max(v, 1) : 0), 0);
    if (base === 0) break;
    x = x.map((v, i) => (free[i] ? Math.min(hi[i], Math.max(lo[i], v + (residual * Math.max(v, 1)) / base)) : v));
  }
  const suggested = roundToTotal(x);

  const rows: WeightRow[] = pillars.map((p, i) => ({
    pillarId: p.id,
    name: p.name,
    color: p.color,
    current: current[i],
    suggested: suggested[i],
    delta: suggested[i] - current[i],
    count: stats.get(p.id)?.count ?? 0,
    smoothed: stats.get(p.id)?.smoothed ?? null,
  }));

  let reason: string | null = null;
  if (pillars.length < 2) reason = "Weights only matter with two or more pillars.";
  else if (measuredCount < MIN_POSTS_FOR_WEIGHTS) reason = `Log results for ${MIN_POSTS_FOR_WEIGHTS - measuredCount} more ${MIN_POSTS_FOR_WEIGHTS - measuredCount === 1 ? "post" : "posts"} to get suggested weights.`;
  else if (!rows.some((r) => r.count >= 2)) reason = "No pillar has two measured posts yet.";
  return { ready: reason === null, reason, rows, changed: rows.some((r) => r.delta !== 0) };
}

/* ------------------------------------------------------------------ */
/* Everything                                                          */
/* ------------------------------------------------------------------ */

export type InsightRow = {
  id: string;
  hook: string;
  pillar: string | null;
  format: string;
  publishedAt: string | null;
  linkedinUrl: string | null;
  hookType: HookType;
  structureId: string | null;
  hasPhoto: boolean;
  chars: number;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  score: number | null;
  rate: number | null;
  index: number | null;
};

export type Insights = {
  totals: {
    published: number;
    measured: number;
    last30: number;
    avgReactions: number | null;
    avgComments: number | null;
    avgImpressions: number | null;
    avgRate: number | null;
    missingMetrics: number;
  };
  groups: {
    pillar: GroupStat[];
    hook: GroupStat[];
    structure: GroupStat[];
    weekday: GroupStat[];
    timeOfDay: GroupStat[];
    format: GroupStat[];
    photo: GroupStat[];
    length: GroupStat[];
  };
  bestPillar: GroupStat | null;
  rows: InsightRow[];
  top: string[];
  bottom: string[];
  recommendations: string[];
  weights: WeightsRecommendation;
};

const pct = (smoothed: number) => Math.round(Math.abs(smoothed - 1) * 100);
const posts = (n: number) => `${n} ${n === 1 ? "post" : "posts"}`;

export function computeInsights(
  all: InsightPost[],
  opts: { pillars: InsightPillar[]; timezone: string; structureNames?: Record<string, string>; formatNames?: Record<string, string>; now?: Date },
): Insights {
  const now = opts.now ?? new Date();
  const tz = safeTimezone(opts.timezone);
  const pillarById = new Map(opts.pillars.map((p) => [p.id, p]));
  const published = all.filter((p) => p.publishedAt);
  const idx = postIndexes(published);

  const rows: InsightRow[] = published
    .map((p) => {
      const hook = firstLine(p.body);
      const measured = hasMetrics(p);
      return {
        id: p.id,
        hook,
        pillar: p.pillar,
        format: p.format,
        publishedAt: p.publishedAt,
        linkedinUrl: p.linkedinUrl,
        hookType: classifyHook(hook),
        structureId: angleInfo(p.angle).structureId,
        hasPhoto: !!p.photoId,
        chars: p.body.trim().length,
        impressions: p.impressions,
        reactions: p.reactions,
        comments: p.comments,
        reposts: p.reposts,
        score: measured ? engagementScore(p) : null,
        rate: measured ? engagementRate(p) : null,
        index: idx.get(p.id) ?? null,
      };
    })
    .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));

  const measured: Measured[] = published.filter((p) => idx.has(p.id)).map((p) => ({ ...p, idx: idx.get(p.id)! }));
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const pillarGroups = groupBy(measured, (p) => {
    const pl = p.pillar ? pillarById.get(p.pillar) : undefined;
    return pl ? { key: pl.id, label: pl.name, color: pl.color } : { key: "_none", label: "No pillar" };
  }).sort(bySmoothed);
  const hookGroups = groupBy(measured, (p) => {
    const t = rowById.get(p.id)!.hookType;
    return { key: t, label: HOOK_TYPE_INFO[t].label };
  }).sort(bySmoothed);
  const structureGroups = groupBy(measured, (p) => {
    const id = rowById.get(p.id)!.structureId;
    return id ? { key: id, label: opts.structureNames?.[id] ?? id } : null;
  }).sort(bySmoothed);
  const weekdayGroups = groupBy(measured, (p) => {
    const d = weekdayOf(dayKeyOf(p.publishedAt!, tz));
    return { key: String(d), label: WEEKDAY_LONG[d] };
  }).sort((a, b) => ((Number(a.key) + 6) % 7) - ((Number(b.key) + 6) % 7));
  const timeGroups = groupBy(measured, (p) => timeOfDayBucket(zonedParts(new Date(p.publishedAt!), tz).hour)).sort(bySmoothed);
  const formatGroups = groupBy(measured, (p) => ({ key: p.format || "story", label: opts.formatNames?.[p.format] ?? (p.format || "story") })).sort(bySmoothed);
  const photoGroups = groupBy(measured, (p) => (p.photoId ? { key: "photo", label: "With your photo" } : { key: "text", label: "Text only" })).sort(bySmoothed);
  const lengthGroups = groupBy(measured, (p) => {
    const b = lengthBand(p.body.trim().length);
    return { key: b.key, label: b.label };
  }).sort((a, b) => LENGTH_BANDS.findIndex((x) => x.key === a.key) - LENGTH_BANDS.findIndex((x) => x.key === b.key));

  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const withImpr = measured.filter((p) => (p.impressions ?? 0) > 0);
  const rates = measured.map(engagementRate).filter((r): r is number => r !== null);

  const ranked = [...measured].sort((a, b) => b.idx - a.idx);
  const top = ranked.slice(0, Math.min(3, ranked.length)).map((p) => p.id);
  const bottom = ranked.length >= 6 ? ranked.slice(-3).reverse().map((p) => p.id) : [];

  const realPillars = pillarGroups.filter((g) => g.key !== "_none");
  const bestPillar = realPillars.length && realPillars[0].count >= 1 ? realPillars[0] : null;

  return {
    totals: {
      published: published.length,
      measured: measured.length,
      last30: published.filter((p) => now.getTime() - Date.parse(p.publishedAt!) <= 30 * DAY_MS).length,
      avgReactions: avg(measured.map((p) => p.reactions ?? 0)),
      avgComments: avg(measured.map((p) => p.comments ?? 0)),
      avgImpressions: avg(withImpr.map((p) => p.impressions!)),
      avgRate: avg(rates),
      missingMetrics: published.filter((p) => !hasMetrics(p) && now.getTime() - Date.parse(p.publishedAt!) > 2 * DAY_MS).length,
    },
    groups: { pillar: pillarGroups, hook: hookGroups, structure: structureGroups, weekday: weekdayGroups, timeOfDay: timeGroups, format: formatGroups, photo: photoGroups, length: lengthGroups },
    bestPillar,
    rows,
    top,
    bottom,
    recommendations: recommendations(measured.length, { pillar: realPillars, hook: hookGroups, structure: structureGroups, weekday: weekdayGroups, timeOfDay: timeGroups, photo: photoGroups, length: lengthGroups }),
    weights: recommendWeights(opts.pillars, realPillars, measured.length),
  };
}

type RecGroups = { pillar: GroupStat[]; hook: GroupStat[]; structure: GroupStat[]; weekday: GroupStat[]; timeOfDay: GroupStat[]; photo: GroupStat[]; length: GroupStat[] };

/** Deterministic, plain-language findings. Only groups with ≥ 2 posts and a ≥ 10% difference count. */
export function recommendations(measured: number, g: RecGroups): string[] {
  if (measured < 3) {
    const n = 3 - measured;
    return [`Log reactions and comments for ${n} more ${n === 1 ? "post" : "posts"} to see what's working.`];
  }
  const out: { text: string; weight: number }[] = [];
  const strong = (x: GroupStat | undefined) => !!x && x.count >= 2 && x.smoothed >= 1.1;
  const weak = (x: GroupStat | undefined) => !!x && x.count >= 2 && x.smoothed <= 0.9;

  const bestPillar = g.pillar[0];
  if (strong(bestPillar)) out.push({ text: `"${bestPillar.label}" beats your average by ${pct(bestPillar.smoothed)}% (${posts(bestPillar.count)}). Give it more of your slots.`, weight: bestPillar.smoothed });
  const worstPillar = g.pillar[g.pillar.length - 1];
  if (g.pillar.length > 1 && weak(worstPillar)) {
    out.push({ text: `"${worstPillar.label}" trails your average by ${pct(worstPillar.smoothed)}% (${posts(worstPillar.count)}). Try opening those posts with a scene or a number.`, weight: 2 - worstPillar.smoothed });
  }
  const bestHook = g.hook[0];
  if (strong(bestHook)) out.push({ text: `${bestHook.label} openings do best: ${pct(bestHook.smoothed)}% above your average (${posts(bestHook.count)}).`, weight: bestHook.smoothed });
  const bestStructure = g.structure[0];
  if (strong(bestStructure)) out.push({ text: `The "${bestStructure.label}" structure works for you: +${pct(bestStructure.smoothed)}% (${posts(bestStructure.count)}).`, weight: bestStructure.smoothed - 0.05 });
  const bestDay = [...g.weekday].sort(bySmoothed)[0];
  if (strong(bestDay)) out.push({ text: `${bestDay.label} posts get ${pct(bestDay.smoothed)}% more engagement than your average (${posts(bestDay.count)}).`, weight: bestDay.smoothed - 0.05 });
  const bestTime = g.timeOfDay[0];
  if (g.timeOfDay.length > 1 && strong(bestTime)) out.push({ text: `${bestTime.label.replace(/ \(.*\)$/, "")} posts outperform (+${pct(bestTime.smoothed)}%, ${posts(bestTime.count)}).`, weight: bestTime.smoothed - 0.1 });
  const photo = g.photo.find((x) => x.key === "photo");
  const text = g.photo.find((x) => x.key === "text");
  if (photo && text && photo.count >= 2 && text.count >= 2) {
    const ratio = photo.smoothed / text.smoothed;
    if (ratio >= 1.1) out.push({ text: `Posts with your own photo get ${Math.round((ratio - 1) * 100)}% more engagement than text-only posts. Keep asking for photos.`, weight: ratio });
    else if (ratio <= 0.9) out.push({ text: `Your text-only posts do ${Math.round((1 / ratio - 1) * 100)}% better than photo posts so far. Check that photos really show the moment in the story.`, weight: 1 / ratio });
  }
  const bestLength = [...g.length].sort(bySmoothed)[0];
  if (g.length.length > 1 && strong(bestLength)) out.push({ text: `Length sweet spot: ${bestLength.label.toLowerCase()} characters (+${pct(bestLength.smoothed)}%, ${posts(bestLength.count)}).`, weight: bestLength.smoothed - 0.1 });

  if (!out.length) return ["No clear winner yet: your posts perform about the same across pillars, openings and days. Keep logging results."];
  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)
    .map((x) => x.text);
}

/** Compact text summary of the numbers for the "What's working" narrative prompt. */
export function insightsDigest(ins: Insights): string {
  const fmt = (g: GroupStat) =>
    `- ${g.label}: ${posts(g.count)}, index ${Math.round(g.smoothed * 100)}, avg ${Math.round(g.avgReactions)} reactions, ${Math.round(g.avgComments)} comments${g.avgImpressions !== null ? `, ${Math.round(g.avgImpressions)} impressions` : ""}`;
  const section = (title: string, gs: GroupStat[]) => (gs.length ? [`${title}:`, ...gs.slice(0, 6).map(fmt)] : []);
  const t = ins.totals;
  return [
    `Posts published: ${t.published}. Posts with results logged: ${t.measured}.`,
    `Average per post: ${Math.round(t.avgReactions ?? 0)} reactions, ${Math.round(t.avgComments ?? 0)} comments${t.avgImpressions !== null ? `, ${Math.round(t.avgImpressions)} impressions` : ""}.`,
    "Index 100 = a typical post for this person. 130 = 30% better than typical.",
    ...section("By pillar", ins.groups.pillar),
    ...section("By opening style", ins.groups.hook),
    ...section("By post structure", ins.groups.structure),
    ...section("By weekday", ins.groups.weekday),
    ...section("By time of day", ins.groups.timeOfDay),
    ...section("Photo or text", ins.groups.photo),
    ...section("By length", ins.groups.length),
    ...(() => {
      const byId = new Map(ins.rows.map((r) => [r.id, r]));
      const line = (id: string) => {
        const r = byId.get(id);
        return r ? `- "${r.hook.slice(0, 110)}" (index ${Math.round((r.index ?? 1) * 100)})` : "";
      };
      return [...(ins.top.length ? ["Best posts:", ...ins.top.map(line)] : []), ...(ins.bottom.length ? ["Weakest posts:", ...ins.bottom.map(line)] : [])];
    })(),
  ].join("\n");
}
