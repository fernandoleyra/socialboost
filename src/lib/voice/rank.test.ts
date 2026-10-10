import { describe, expect, it } from "vitest";
import { cosine, engagement, rankExamples, selectForAnalysis, type RankCandidate } from "./rank";

const body = (label: string, len = 600) => `${label} ${"words and more words ".repeat(Math.ceil(len / 21))}`.slice(0, len);
const cand = (id: string, over: Partial<RankCandidate> = {}): RankCandidate => ({
  id,
  text: body(id),
  postedAt: "2026-01-01T08:00:00.000Z",
  createdAt: "2026-02-01T08:00:00.000Z",
  impressions: null,
  reactions: null,
  comments: null,
  reposts: null,
  embedding: null,
  ...over,
});

describe("engagement", () => {
  it("weights comments and reposts, and knows when it knows nothing", () => {
    expect(engagement({ reactions: 10, comments: 2, reposts: 1 })).toBe(18);
    expect(engagement({ reactions: null, comments: 4, reposts: null })).toBe(12);
    expect(engagement({ reactions: null, comments: null, reposts: null })).toBeNull();
  });
});

describe("cosine", () => {
  it("is 1 for identical and 0 for orthogonal vectors", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("rankExamples", () => {
  it("prefers the posts closest to the query", () => {
    const cands = [
      cand("hiring", { embedding: [1, 0, 0], reactions: 5 }),
      cand("warehouse", { embedding: [0, 1, 0], reactions: 5 }),
      cand("pricing", { embedding: [0, 0, 1], reactions: 5 }),
    ];
    expect(rankExamples(cands, [0.1, 0.9, 0.1], 1).map((c) => c.id)).toEqual(["warehouse"]);
  });

  it("skips near-duplicates in favour of variety", () => {
    const cands = [cand("a", { embedding: [1, 0, 0] }), cand("a-copy", { embedding: [0.99, 0.01, 0] }), cand("b", { embedding: [0.6, 0.8, 0] })];
    expect(rankExamples(cands, [1, 0, 0], 2).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("ignores vectors from a different embedding model", () => {
    const cands = [cand("old", { embedding: [1, 0], reactions: 1 }), cand("best", { embedding: null, reactions: 200 })];
    expect(rankExamples(cands, [1, 0, 0], 1).map((c) => c.id)).toEqual(["best"]);
  });

  it("falls back to engagement and recency without embeddings", () => {
    const cands = [
      cand("old-hit", { reactions: 300, comments: 40, postedAt: "2024-01-01T00:00:00Z" }),
      cand("recent-flop", { reactions: 2, postedAt: "2026-09-01T00:00:00Z" }),
      cand("recent-good", { reactions: 120, comments: 12, postedAt: "2026-08-01T00:00:00Z" }),
      cand("tiny", { text: "Short.", reactions: 500 }),
    ];
    const ids = rankExamples(cands, null, 2).map((c) => c.id);
    expect(ids).toContain("recent-good");
    expect(ids).toContain("old-hit");
  });

  it("never returns more than it has", () => {
    expect(rankExamples([cand("x")], null, 3)).toHaveLength(1);
    expect(rankExamples([], [1], 3)).toEqual([]);
    expect(rankExamples([cand("x")], null, 0)).toEqual([]);
  });
});

describe("selectForAnalysis", () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    cand(`p${i}`, { text: body(`p${i}`, 1000), reactions: i, postedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }),
  );

  it("packs the best and most recent posts into the budget, oldest first", () => {
    const picked = selectForAnalysis(many, { maxPosts: 25, budgetChars: 5_000, maxCharsPerPost: 1_800 });
    expect(picked.length).toBe(5);
    expect(picked.map((p) => p.id)).toEqual(["p25", "p26", "p27", "p28", "p29"]);
  });

  it("caps the number of posts and clips long ones", () => {
    const picked = selectForAnalysis(many, { maxPosts: 3, budgetChars: 1_000_000, maxCharsPerPost: 300 });
    expect(picked).toHaveLength(3);
    for (const p of picked) {
      expect(p.text.length).toBeLessThanOrEqual(306);
      expect(p.text.endsWith("[…]")).toBe(true);
    }
  });

  it("always keeps at least three posts even with a tiny budget", () => {
    expect(selectForAnalysis(many, { maxPosts: 25, budgetChars: 10, maxCharsPerPost: 1_800 })).toHaveLength(3);
  });
});
