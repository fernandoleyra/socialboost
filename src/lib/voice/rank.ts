/**
 * Ranking of the person's own posts: which ones the writer sees as examples, and which ones
 * the style analysis reads when they don't all fit the model's context. Pure.
 */
import { quantile } from "./stylometry";

export type RankCandidate = {
  id: string;
  text: string;
  postedAt: string | null;
  createdAt: string;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  embedding?: number[] | null;
};

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Interactions weighted like the rest of the app: a comment is worth 3 reactions, a repost 2. Null when unknown. */
export function engagement(c: Pick<RankCandidate, "reactions" | "comments" | "reposts">): number | null {
  if (c.reactions === null && c.comments === null && c.reposts === null) return null;
  return (c.reactions ?? 0) + 3 * (c.comments ?? 0) + 2 * (c.reposts ?? 0);
}

/** Percentile rank (0..1) of each value among the known values; unknown values get `fallback`. */
function percentiles(values: (number | null)[], fallback: number): number[] {
  const known = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (known.length < 2) return values.map((v) => (v === null || known.length === 0 ? fallback : 0.5));
  return values.map((v) => {
    if (v === null) return fallback;
    let below = 0;
    let equal = 0;
    for (const k of known) {
      if (k < v) below++;
      else if (k === v) equal++;
    }
    return (below + (equal - 1) / 2) / (known.length - 1);
  });
}

const timeOf = (c: RankCandidate) => {
  const t = Date.parse(c.postedAt ?? c.createdAt);
  return Number.isNaN(t) ? null : t;
};

/** 1 for a post of typical length, falling toward 0 for very short or very long ones. */
function lengthFit(len: number, median: number): number {
  if (len < 200) return 0;
  if (!median) return 1;
  return Math.max(0, 1 - Math.abs(Math.log(len / median)) / 1.5);
}

export type BaseScores = { engagement: number; recency: number; length: number; hasEngagement: boolean };

/** Scores independent of the query: how good, how recent, how typical each post is. */
export function baseScores(cands: RankCandidate[]): BaseScores[] {
  const eng = cands.map(engagement);
  const anyEng = eng.some((e) => e !== null);
  // Unknown engagement sits a bit below the middle: a post we know did well beats one we know nothing about.
  const engP = percentiles(eng, 0.4);
  const recP = percentiles(cands.map(timeOf), 0.5);
  const median = quantile(cands.map((c) => c.text.length), 0.5);
  return cands.map((c, i) => ({ engagement: anyEng ? engP[i] : 0.5, recency: recP[i], length: lengthFit(c.text.length, median), hasEngagement: anyEng }));
}

/**
 * Pick k examples for the writer. With a query embedding: similarity first, then engagement,
 * recency and typical length; near-duplicates only come in when nothing else is left. Without
 * embeddings: the best-performing, recent, typical posts.
 */
export function rankExamples(cands: RankCandidate[], query: number[] | null, k: number): RankCandidate[] {
  if (cands.length === 0 || k <= 0) return [];
  const base = baseScores(cands);
  const dims = query?.length ?? 0;
  const sims = cands.map((c) => (query && c.embedding && c.embedding.length === dims ? cosine(query, c.embedding) : null));
  const known = sims.filter((s): s is number => s !== null);
  const useSim = known.length > 0;
  const lo = useSim ? Math.min(...known) : 0;
  const hi = useSim ? Math.max(...known) : 0;
  const simNorm = sims.map((s) => (s === null ? 0 : hi > lo ? (s - lo) / (hi - lo) : 1));

  // Very short or very long posts teach the rhythm badly, so length scales the whole score.
  const score = cands.map((_, i) => {
    const b = base[i];
    const fit = 0.3 + 0.7 * b.length;
    return fit * (useSim ? 0.65 * simNorm[i] + 0.25 * b.engagement + 0.1 * b.recency : 0.65 * b.engagement + 0.35 * b.recency);
  });

  const chosen: number[] = [];
  const left = new Set(cands.map((_, i) => i));
  while (chosen.length < Math.min(k, cands.length)) {
    let best = -1;
    let bestScore = -Infinity;
    for (const i of left) {
      let penalty = 0;
      for (const j of chosen) {
        const a = cands[i].embedding;
        const b = cands[j].embedding;
        const near = a && b && a.length === b.length ? cosine(a, b) > 0.92 : cands[i].text.slice(0, 60).toLowerCase() === cands[j].text.slice(0, 60).toLowerCase();
        if (near) penalty = 1;
      }
      const s = score[i] - penalty;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    if (best < 0) break;
    chosen.push(best);
    left.delete(best);
  }
  return chosen.map((i) => cands[i]);
}

/**
 * Posts for the style analysis: best-performing and most recent first, clipped and packed
 * into a character budget (the local model's context window). Returned in date order so the
 * model reads them like a feed.
 */
export function selectForAnalysis(cands: RankCandidate[], opts: { maxPosts: number; budgetChars: number; maxCharsPerPost: number }): { id: string; text: string }[] {
  const base = baseScores(cands);
  const order = cands
    .map((c, i) => ({ c, s: base[i].hasEngagement ? 0.6 * base[i].engagement + 0.4 * base[i].recency : base[i].recency, len: base[i].length }))
    .sort((a, b) => b.s + 0.1 * b.len - (a.s + 0.1 * a.len));
  const picked: { c: RankCandidate; text: string }[] = [];
  let used = 0;
  for (const { c } of order) {
    if (picked.length >= opts.maxPosts) break;
    const text = c.text.length > opts.maxCharsPerPost ? c.text.slice(0, opts.maxCharsPerPost).replace(/\s+\S*$/, "") + " […]" : c.text;
    if (used + text.length > opts.budgetChars && picked.length >= 3) continue;
    picked.push({ c, text });
    used += text.length;
  }
  return picked.sort((a, b) => (timeOf(a.c) ?? 0) - (timeOf(b.c) ?? 0)).map(({ c, text }) => ({ id: c.id, text }));
}
