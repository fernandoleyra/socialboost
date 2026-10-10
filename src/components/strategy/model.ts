/**
 * Pure helpers for the Strategy editor and PUT /api/strategy.
 * No React, no server imports: shared by the client editor, the API route and unit tests.
 */
import { StrategySchema, type Pillar, type Strategy } from "@/lib/types";

/** Pillar colors, same order as TONE_NAMES in components/ui (kept local so server code can use it). */
export const PILLAR_COLORS = ["blue", "purple", "orange", "green", "pink", "teal", "indigo", "mint", "cyan", "yellow", "red"] as const;

export const MAX_PILLARS = 6;
export const MAX_PROMPTS = 12;
export const MAX_LIST = 25;

/** Display order Monday → Sunday; values follow the schema (0 = Sunday). */
export const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
] as const;

/**
 * Order in which days are added when someone raises posts/week: midweek mornings first
 * (Tue-Thu are the most active LinkedIn days), weekend last.
 */
export const DAY_PREFERENCE = [2, 3, 4, 1, 5, 6, 0];

/** Practical bounds: LinkedIn rewards ≥ 24 h between posts, so at most one a day. */
export const MIN_POSTS_PER_WEEK = 1;
export const MAX_POSTS_PER_WEEK = 7;

export const GOAL_SUGGESTIONS = [
  "Win clients",
  "Hire great people",
  "Raise funding",
  "Get speaking invitations",
  "Build authority in my field",
  "Find my next role",
  "Launch a product",
  "Grow a community",
];

export function emptyStrategy(language = "en"): Strategy {
  return StrategySchema.parse({ language });
}

/** True when nothing meaningful has been filled in yet (positioning, pillars, audience, goals). */
export function isStrategyEmpty(s: Strategy | null | undefined): boolean {
  if (!s) return true;
  return !s.positioning.trim() && s.pillars.length === 0 && !s.audience.who.trim() && s.goals.length === 0;
}

export function newPillarId(): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `pl_${rand.slice(0, 10)}`;
}

/**
 * The pillar id a memory belongs to. Memories store the pillar id, but older or hand-written
 * data may hold the pillar's name; both resolve to the id. Unknown pillars → null.
 */
export function pillarIdOf(pillars: Pick<Pillar, "id" | "name">[], memoryPillar: string | null | undefined): string | null {
  if (!memoryPillar) return null;
  const byId = pillars.find((p) => p.id === memoryPillar);
  if (byId) return byId.id;
  const name = memoryPillar.trim().toLowerCase();
  return pillars.find((p) => p.name.trim().toLowerCase() === name)?.id ?? null;
}

/** First color not used by another pillar (cycles when all are taken). */
export function nextPillarColor(pillars: Pick<Pillar, "color">[]): string {
  const used = new Set(pillars.map((p) => p.color));
  return PILLAR_COLORS.find((c) => !used.has(c)) ?? PILLAR_COLORS[pillars.length % PILLAR_COLORS.length];
}

export function createPillar(existing: Pillar[], name = ""): Pillar {
  const others = existing.reduce((a, p) => a + p.weight, 0);
  const weight = existing.length === 0 ? 100 : Math.max(10, Math.round(others / existing.length));
  return { id: newPillarId(), name, description: "", weight, storyPrompts: [], color: nextPillarColor(existing) };
}

/** Each pillar's share of posts (0-1). Equal split when every weight is 0. */
export function pillarShares(pillars: Pick<Pillar, "weight">[]): number[] {
  const total = pillars.reduce((a, p) => a + Math.max(0, p.weight), 0);
  if (pillars.length === 0) return [];
  return pillars.map((p) => (total > 0 ? Math.max(0, p.weight) / total : 1 / pillars.length));
}

/** Integer percentages that add up to exactly 100 (largest remainder). */
export function sharePercents(pillars: Pick<Pillar, "weight">[]): number[] {
  const shares = pillarShares(pillars).map((s) => s * 100);
  const floors = shares.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = shares.map((s, i) => ({ i, r: s - Math.floor(s) })).sort((a, b) => b.r - a.r);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i]++;
    rest--;
  }
  return pillars.length ? floors : [];
}

/** Equal weights that sum to 100. */
export function balanceWeights(pillars: Pillar[]): Pillar[] {
  if (pillars.length === 0) return pillars;
  const base = Math.floor(100 / pillars.length);
  let extra = 100 - base * pillars.length;
  return pillars.map((p) => ({ ...p, weight: base + (extra-- > 0 ? 1 : 0) }));
}

/* ------------------------------------------------------------------ */
/* Cadence                                                             */
/* ------------------------------------------------------------------ */

type Cadence = Strategy["cadence"];

function sortDays(days: number[]): number[] {
  return [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
}

/** Change posts/week and keep the posting days in sync (adds preferred days, drops least preferred). */
export function setPostsPerWeek(c: Cadence, n: number): Cadence {
  const target = Math.max(MIN_POSTS_PER_WEEK, Math.min(MAX_POSTS_PER_WEEK, Math.round(n)));
  let days = sortDays(c.days);
  if (days.length < target) {
    for (const d of DAY_PREFERENCE) {
      if (days.length >= target) break;
      if (!days.includes(d)) days.push(d);
    }
  } else if (days.length > target) {
    const rank = (d: number) => DAY_PREFERENCE.indexOf(d);
    days = [...days].sort((a, b) => rank(a) - rank(b)).slice(0, target);
  }
  return { ...c, postsPerWeek: target, days: sortDays(days) };
}

/** Toggle a weekday; posts/week follows the number of days. The last day can't be removed. */
export function toggleDay(c: Cadence, day: number): Cadence {
  const days = c.days.includes(day) ? c.days.filter((d) => d !== day) : [...c.days, day];
  if (days.length === 0) return c;
  const sorted = sortDays(days);
  return { ...c, days: sorted, postsPerWeek: Math.max(MIN_POSTS_PER_WEEK, Math.min(MAX_POSTS_PER_WEEK, sorted.length)) };
}

export function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

/** "3 posts a week · Tue, Wed, Thu at 08:30" */
export function cadenceSummary(c: Cadence): string {
  const names = WEEKDAYS.filter((w) => c.days.includes(w.value)).map((w) => w.short);
  return `${c.postsPerWeek} ${c.postsPerWeek === 1 ? "post" : "posts"} a week · ${names.join(", ") || "no days"} at ${c.time}`;
}

/* ------------------------------------------------------------------ */
/* Normalization (server side, before saving)                          */
/* ------------------------------------------------------------------ */

function cleanList(items: string[], max = MAX_LIST): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.replace(/\s+/g, " ").trim();
    const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

const clampNum = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : v);

/**
 * Prepare untrusted input for StrategySchema so near-misses don't fail validation:
 * pillars without an id get one, weights are clamped to 0-100, posts/week to 1-14 and
 * posting days to valid weekdays.
 */
export function prepareStrategyInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  if (Array.isArray(input.pillars)) {
    out.pillars = input.pillars.map((p) => {
      if (!p || typeof p !== "object") return p;
      const pillar = p as Record<string, unknown>;
      return { ...pillar, id: typeof pillar.id === "string" && pillar.id.trim() ? pillar.id : newPillarId(), weight: clampNum(pillar.weight, 0, 100) };
    });
  }
  if (input.cadence && typeof input.cadence === "object") {
    const c = input.cadence as Record<string, unknown>;
    out.cadence = {
      ...c,
      postsPerWeek: typeof c.postsPerWeek === "number" ? Math.round(clampNum(c.postsPerWeek, 1, 14) as number) : c.postsPerWeek,
      days: Array.isArray(c.days) ? c.days.filter((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6) : c.days,
    };
  }
  return out;
}

/**
 * Tidy a strategy before it is stored: trim and de-duplicate list items, drop empty rows
 * and unnamed pillars, keep pillar ids unique, give every pillar a known color, clamp
 * weights, and keep cadence days/posts-per-week consistent.
 */
export function normalizeStrategy(s: Strategy): Strategy {
  const ids = new Set<string>();
  const pillars: Pillar[] = [];
  for (const p of s.pillars) {
    const name = p.name.replace(/\s+/g, " ").trim();
    if (!name) continue;
    let id = p.id.trim() || newPillarId();
    while (ids.has(id)) id = newPillarId();
    ids.add(id);
    pillars.push({
      id,
      name: name.slice(0, 80),
      description: p.description.trim(),
      weight: Math.round(Math.max(0, Math.min(100, Number.isFinite(p.weight) ? p.weight : 0))),
      storyPrompts: cleanList(p.storyPrompts, MAX_PROMPTS),
      color: (PILLAR_COLORS as readonly string[]).includes(p.color) ? p.color : nextPillarColor(pillars),
    });
    if (pillars.length >= MAX_PILLARS) break;
  }

  const days = sortDays(s.cadence.days);
  const cadence: Cadence = {
    days: days.length ? days : [2, 3, 4],
    postsPerWeek: Math.max(MIN_POSTS_PER_WEEK, Math.min(14, Math.round(s.cadence.postsPerWeek) || 3)),
    time: isValidTime(s.cadence.time) ? s.cadence.time : "08:30",
  };

  return {
    positioning: s.positioning.trim(),
    goals: cleanList(s.goals),
    audience: { who: s.audience.who.trim(), pains: cleanList(s.audience.pains), desires: cleanList(s.audience.desires) },
    expertise: cleanList(s.expertise),
    offers: cleanList(s.offers),
    beliefs: cleanList(s.beliefs),
    contrarianTakes: cleanList(s.contrarianTakes),
    pillars,
    avoidTopics: cleanList(s.avoidTopics),
    cta: s.cta.trim(),
    cadence,
    language: s.language.trim() || "en",
    notes: s.notes.trim(),
  };
}
