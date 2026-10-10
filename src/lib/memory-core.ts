import type { Memory, Pillar } from "./types";

/**
 * Pure Memory Bank logic: story-depth scoring, keyword relevance, score blending,
 * filters and text helpers. Shared by the API (server) and the Memory Bank UI (client).
 */

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export const MEMORY_FILTERS = ["all", "ready", "needs-photo", "used", "archived"] as const;
export type MemoryFilter = (typeof MEMORY_FILTERS)[number];

export const MEMORY_FILTER_LABEL: Record<MemoryFilter, string> = {
  all: "All",
  ready: "Ready",
  "needs-photo": "Needs photo",
  used: "Used",
  archived: "Archived",
};

export function parseMemoryFilter(v: string | null | undefined): MemoryFilter | null {
  return v && (MEMORY_FILTERS as readonly string[]).includes(v) ? (v as MemoryFilter) : null;
}

export type MemoryCounts = Record<MemoryFilter, number>;

/** A story still waiting for its photo: not archived, not already used, and no photo linked. */
export function needsPhoto(m: Pick<Memory, "status" | "photoCount">): boolean {
  return (m.status === "ready" || m.status === "raw") && !m.photoCount;
}

export function memoryMatchesFilter(m: Pick<Memory, "status" | "photoCount">, filter: MemoryFilter): boolean {
  switch (filter) {
    case "all":
      return m.status !== "archived";
    case "ready":
      return m.status === "ready";
    case "needs-photo":
      return needsPhoto(m);
    case "used":
      return m.status === "used";
    case "archived":
      return m.status === "archived";
  }
}

export function countMemories(ms: Pick<Memory, "status" | "photoCount">[]): MemoryCounts {
  const counts: MemoryCounts = { all: 0, ready: 0, "needs-photo": 0, used: 0, archived: 0 };
  for (const m of ms) for (const f of MEMORY_FILTERS) if (memoryMatchesFilter(m, f)) counts[f]++;
  return counts;
}

/** Memories store the pillar id; older or hand-written data may hold the name. Accept both. */
export function pillarMatches(memoryPillar: string | null | undefined, pillar: Pick<Pillar, "id" | "name">): boolean {
  if (!memoryPillar) return false;
  return memoryPillar === pillar.id || memoryPillar.trim().toLowerCase() === pillar.name.trim().toLowerCase();
}

export function findPillar<P extends Pick<Pillar, "id" | "name">>(pillars: P[], memoryPillar: string | null | undefined): P | null {
  return pillars.find((p) => pillarMatches(memoryPillar, p)) ?? null;
}

/** A memory as listed in the bank: the row plus how many posts were made from it. */
export type MemoryListItem = Memory & { postCount: number; score?: number };

export const MEMORY_STATUS_LABEL: Record<Memory["status"], string> = {
  raw: "In progress",
  ready: "Ready",
  used: "Used",
  archived: "Archived",
};

/* ------------------------------------------------------------------ */
/* Story depth (completeness)                                          */
/* ------------------------------------------------------------------ */

/**
 * Story-card completeness from the ghostwriting research (section 3.6): a story is ready
 * to write from at >= 70/100. Elements that live in free text (stakes, turning point,
 * before/after) are detected heuristically; the rest come from structured fields.
 */
export type DepthKey = "when" | "place" | "stakes" | "turn" | "change" | "number" | "detail" | "quote" | "lesson" | "pillar" | "photo";

/** Where an answer to the probe goes when the person fills the gap. */
export type DepthTarget = "when" | "place" | "storyAppend" | "details" | "quotes" | "lesson" | "pillar" | "photo";

export type DepthItem = {
  key: DepthKey;
  label: string;
  points: number;
  present: boolean;
  /** The interview probe that fills this gap, phrased for the person. */
  probe: string;
  target: DepthTarget;
  placeholder: string;
};

export const READY_THRESHOLD = 70;

const STAKES_RE =
  /\b(risk\w*|lose|losing|lost|afraid|scared|terrified|worried|nervous|panic\w*|deadline|on the line|at stake|stakes|almost|nearly|could have|would have|desperate\w*|needed|had to|wanted|bet\b|bet everything|fired|quit|broke|runway|last chance|make or break)\b/i;
const TURN_RE =
  /\b(realis\w*|realiz\w*|suddenly|that's when|that was when|it clicked|clicked|turned out|the moment|at that point|that moment|finally|then i|until|it hit me|i understood|i saw|changed everything|decided)\b/i;
const CHANGE_RE =
  /\b(before|after that|afterwards|used to|no longer|anymore|since then|ever since|now i|now we|today i|today we|these days|changed|stopped|started|from then on|went from)\b/i;
const NUMBER_RE =
  /(\d|[$€£¥%]|\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|hundreds|thousand|thousands|million|millions|billion|dozen|half)\b)/i;

const PROBES: Record<DepthKey, { label: string; points: number; probe: string; target: DepthTarget; placeholder: string }> = {
  when: { label: "When it happened", points: 5, probe: "When was it? Month, year, time of day.", target: "when", placeholder: "Last March, a Tuesday morning" },
  place: { label: "Where it happened", points: 5, probe: "Where exactly were you?", target: "place", placeholder: "Our old office in Lisbon, the small meeting room" },
  stakes: { label: "What was at stake", points: 15, probe: "What did you want most in that moment, and what could you lose?", target: "storyAppend", placeholder: "We had two weeks of runway left and…" },
  turn: { label: "The turning point", points: 15, probe: "When exactly did it click or change? Describe those few seconds.", target: "storyAppend", placeholder: "She looked at the screen and said…" },
  change: { label: "Before and after", points: 10, probe: "Before this, what did you believe or do that's the opposite of now?", target: "storyAppend", placeholder: "I used to think… Now I…" },
  number: { label: "A number", points: 10, probe: "How much, how many, how long? Before vs after.", target: "details", placeholder: "3 weeks instead of 4 months" },
  detail: { label: "A concrete detail", points: 5, probe: "If we were filming it, what would the camera see or hear?", target: "details", placeholder: "The whiteboard still had last quarter's numbers on it" },
  quote: { label: "Exact words", points: 10, probe: "What exactly did someone say? Or what went through your head?", target: "quotes", placeholder: "\"Why are we still doing this by hand?\"" },
  lesson: { label: "The lesson, in your words", points: 10, probe: "If you had to teach a new hire the lesson in one sentence, what would it be?", target: "lesson", placeholder: "Ship the ugly version first." },
  pillar: { label: "Linked to a pillar", points: 5, probe: "Which of your content pillars does this story serve?", target: "pillar", placeholder: "" },
  photo: { label: "A real photo", points: 10, probe: "Do you have a photo from that moment? If not, what could you photograph this week that stands for it?", target: "photo", placeholder: "" },
};

export const DEPTH_ORDER: DepthKey[] = ["when", "place", "stakes", "turn", "change", "number", "detail", "quote", "lesson", "pillar", "photo"];

type DepthInput = Pick<Memory, "story" | "summary" | "when" | "place" | "details" | "quotes" | "lesson" | "pillar"> & { photoCount?: number };

export function memoryDepth(m: DepthInput): { score: number; ready: boolean; items: DepthItem[] } {
  const narrative = [m.story, m.summary].join("\n");
  const everything = [narrative, m.lesson, ...(m.details ?? []), ...(m.quotes ?? [])].join("\n");
  const present: Record<DepthKey, boolean> = {
    when: m.when.trim().length > 1,
    place: m.place.trim().length > 1,
    stakes: STAKES_RE.test(narrative),
    turn: TURN_RE.test(narrative),
    change: CHANGE_RE.test(narrative) || CHANGE_RE.test(m.lesson),
    number: NUMBER_RE.test(everything),
    detail: (m.details ?? []).some((d) => d.trim().length > 2),
    quote: (m.quotes ?? []).some((q) => q.trim().length > 2),
    lesson: m.lesson.trim().length >= 8,
    pillar: !!m.pillar,
    photo: (m.photoCount ?? 0) > 0,
  };
  const items = DEPTH_ORDER.map((key) => ({ key, ...PROBES[key], present: present[key] }));
  const score = items.reduce((s, i) => s + (i.present ? i.points : 0), 0);
  return { score, ready: score >= READY_THRESHOLD, items };
}

/** Map a 0-100 depth score to the 1-5 strength scale used across the app. */
export function strengthFromScore(score: number): number {
  if (score >= 85) return 5;
  if (score >= 70) return 4;
  if (score >= 50) return 3;
  if (score >= 30) return 2;
  return 1;
}

/* ------------------------------------------------------------------ */
/* Keyword relevance + blending with semantic similarity               */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its just me my of on or our out she so than that the their them then there these they this to too up us was we were what when where which who why will with would you your about after again all also am any because before being both each few further here him himself more most no nor not now off once only other over own same should some such through under until very while story stories time"
  ).split(" "),
);

function fold(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Light stemmer: enough to match "hiring" with "hire" and "clients" with "client". */
export function stem(w: string): string {
  if (w.length <= 4) return w;
  if (w.endsWith("ies") && w.length > 5) return w.slice(0, -3) + "y";
  if (/(ss|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("ing") && w.length >= 6) return w.slice(0, -3);
  if (w.endsWith("edly") && w.length >= 7) return w.slice(0, -4);
  if (w.endsWith("ed") && w.length >= 5) return w.slice(0, -2);
  if (w.endsWith("ly") && w.length >= 6) return w.slice(0, -2);
  if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Same word after stemming, or one is a near-prefix of the other ("hire" / "hir" from "hiring"). */
function termMatches(term: string, token: string): boolean {
  if (term === token) return true;
  if (term.length < 3 || token.length < 3) return false;
  if (token.startsWith(term)) return term.length >= 4 || token.length - term.length <= 2;
  return term.startsWith(token) && term.length - token.length <= 2;
}

export function tokenize(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

type Searchable = Pick<Memory, "title" | "summary" | "story" | "lesson" | "tags" | "people" | "place" | "details" | "quotes">;

const FIELD_WEIGHTS: [keyof Searchable, number][] = [
  ["title", 3],
  ["tags", 2.5],
  ["people", 2],
  ["place", 2],
  ["summary", 1.5],
  ["lesson", 1.5],
  ["details", 1],
  ["quotes", 1],
  ["story", 1],
];

/** 0..1: how well the memory's text matches the query words (field-weighted, stemmed). */
export function keywordScore(m: Searchable, query: string): number {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return 0;
  const fieldTokens = FIELD_WEIGHTS.map(([field, weight]) => {
    const v = m[field];
    const text = Array.isArray(v) ? v.join(" ") : String(v ?? "");
    return { weight, tokens: new Set(tokenize(text)) };
  });
  let total = 0;
  for (const t of terms) {
    let best = 0;
    for (const f of fieldTokens) {
      if (f.weight <= best) continue;
      if (f.tokens.has(t)) best = f.weight;
      else {
        for (const tok of f.tokens) {
          if (termMatches(t, tok)) {
            best = Math.max(best, f.weight * 0.8);
            break;
          }
        }
      }
    }
    total += best;
  }
  let score = total / (terms.length * 3);
  const phrase = fold(query).replace(/\s+/g, " ").trim();
  if (terms.length >= 2 && phrase.length >= 6) {
    const hay = fold([m.title, m.summary, m.story].join(" ")).replace(/\s+/g, " ");
    if (hay.includes(phrase)) score += 0.25;
  }
  return Math.min(1, score);
}

/**
 * Map a cosine similarity into 0..1. Typical local embedding models put unrelated text
 * around 0.3-0.45 and clearly related text above 0.6, so we stretch that band.
 */
export function semanticNorm(cos: number): number {
  return Math.max(0, Math.min(1, (cos - 0.3) / 0.45));
}

/** Blend semantic similarity (when available) with keyword relevance. */
export function blendScore(keyword: number, cos: number | null): number {
  if (cos === null) return keyword;
  return 0.65 * semanticNorm(cos) + 0.35 * keyword;
}

/**
 * Order search hits and drop the long tail: keep anything scoring at least half of the best
 * hit (and above a small floor), so a search shows real matches instead of the whole bank.
 */
export function rankHits<T extends { score: number }>(hits: T[], opts: { limit?: number; relative?: number; floor?: number } = {}): T[] {
  const { limit = 60, relative = 0.5, floor = 0.08 } = opts;
  const sorted = [...hits].sort((a, b) => b.score - a.score);
  const best = sorted[0]?.score ?? 0;
  if (best <= 0) return [];
  const cut = Math.max(floor, best * relative);
  return sorted.filter((h) => h.score >= cut).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** First sentence or two of the story, used when a hand-written memory has no summary. */
export function deriveSummary(story: string, max = 180): string {
  const flat = story.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const sentences = flat.match(/[^.!?]+[.!?]+["')\]]*/g) ?? [flat];
  let out = sentences[0].trim();
  if (out.length < 70 && sentences[1] && (out + " " + sentences[1].trim()).length <= max) out = out + " " + sentences[1].trim();
  if (out.length > max) {
    const cut = out.slice(0, max);
    const space = cut.lastIndexOf(" ");
    out = (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:\s]+$/, "") + "…";
  }
  return out;
}

/** A short title from the story's first words when nobody wrote one. */
export function deriveTitle(story: string, max = 60): string {
  const flat = story.replace(/\s+/g, " ").trim();
  const first = (flat.match(/^[^.!?]+/)?.[0] ?? flat).trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > 20 ? cut.slice(0, space) : cut) + "…";
}

/** Trim, drop empties and case-insensitive duplicates, cap the count. */
export function cleanList(list: readonly string[] | null | undefined, max = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const v = String(raw).replace(/\s+/g, " ").trim();
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function normQuote(s: string): string {
  return fold(s)
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”«»„]/g, '"')
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keep only quotes that really appear in the source text (punctuation, case and curly
 * quotes ignored). Models like to "improve" quotes; a ghostwriter must not.
 */
export function keepVerbatimQuotes(quotes: readonly string[], source: string): string[] {
  const hay = " " + normQuote(source) + " ";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of quotes) {
    const q = raw.replace(/\s+/g, " ").trim().replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "").trim();
    const n = normQuote(q);
    if (n.split(" ").length < 3 || seen.has(n) || !hay.includes(" " + n + " ")) continue;
    seen.add(n);
    out.push(q);
    if (out.length >= 6) break;
  }
  return out;
}

/** Append a new paragraph to a story without doubling blank lines. */
export function appendParagraph(story: string, addition: string): string {
  const a = addition.trim();
  if (!a) return story;
  const s = story.replace(/\s+$/, "");
  return s ? `${s}\n\n${a}` : a;
}

/** "First line" of a post body, for compact lists. */
export function firstLine(text: string, max = 120): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? line.slice(0, max - 1).trimEnd() + "…" : line;
}
