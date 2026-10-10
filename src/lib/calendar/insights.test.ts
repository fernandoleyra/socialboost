import { describe, expect, it } from "vitest";
import { angleInfo, classifyHook, computeInsights, engagementRate, engagementScore, insightsDigest, postIndexes, recommendWeights, roundToTotal, smoothIndex, type GroupStat, type InsightPost } from "./insights";

describe("classifyHook", () => {
  it.each([
    ["We refunded €84k in one afternoon.", "number"],
    ["11:40 p.m., hotel lobby in Zurich. My co-founder's message: 'We need to talk.'", "scene"],
    ["Last Tuesday my co-founder asked: 'Are we done?'", "scene"],
    ["Unpopular opinion: CVs are useless.", "contrarian"],
    ["Stop chasing every lead.", "contrarian"],
    ["After 60 hires I stopped reading CVs first.", "credential"],
    ["I've hired 140 people across 3 startups.", "credential"],
    ["What would you do with a client who never pays?", "question"],
    ["I almost fired the best hire I ever made.", "statement"],
    ["", "statement"],
  ])("%s → %s", (line, type) => {
    expect(classifyHook(line)).toBe(type);
  });
});

describe("engagement", () => {
  it("weights comments and reposts", () => {
    expect(engagementScore({ impressions: null, reactions: 10, comments: 2, reposts: 1 })).toBe(18);
    expect(engagementRate({ impressions: 1000, reactions: 10, comments: 2, reposts: 1 })).toBeCloseTo(0.018);
    expect(engagementRate({ impressions: null, reactions: 10, comments: 2, reposts: 1 })).toBeNull();
  });

  it("indexes posts against the median of posts measured the same way", () => {
    const idx = postIndexes([
      { id: "a", impressions: 1000, reactions: 10, comments: 0, reposts: 0 },
      { id: "b", impressions: 1000, reactions: 20, comments: 0, reposts: 0 },
      { id: "c", impressions: 1000, reactions: 30, comments: 0, reposts: 0 },
      { id: "d", impressions: null, reactions: 5, comments: 0, reposts: 0 },
      { id: "e", impressions: null, reactions: null, comments: null, reposts: null },
    ]);
    expect(idx.get("b")).toBeCloseTo(1);
    expect(idx.get("c")).toBeCloseTo(1.5);
    expect(idx.get("d")).toBeCloseTo(1);
    expect(idx.has("e")).toBe(false);
  });

  it("smooths small groups toward 1", () => {
    expect(smoothIndex([3])).toBeCloseTo((3 + 2) / 3);
    expect(smoothIndex([])).toBe(1);
  });
});

describe("weights", () => {
  const pillars = [
    { id: "a", name: "A", color: "blue", weight: 40 },
    { id: "b", name: "B", color: "green", weight: 30 },
    { id: "c", name: "C", color: "orange", weight: 30 },
  ];
  const g = (key: string, smoothed: number, count = 4): GroupStat => ({ key, label: key, count, avgReactions: 0, avgComments: 0, avgReposts: 0, avgImpressions: null, avgRate: null, index: smoothed, smoothed });

  it("rounds to a total", () => {
    expect(roundToTotal([33.3, 33.3, 33.4])).toEqual([33, 33, 34]);
    expect(roundToTotal([50, 50]).reduce((s, x) => s + x, 0)).toBe(100);
  });

  it("shifts toward winners, sums to 100 and caps changes at ±15", () => {
    const rec = recommendWeights(pillars, [g("a", 3), g("b", 0.5), g("c", 0.5)], 12);
    expect(rec.ready).toBe(true);
    const sum = rec.rows.reduce((s, r) => s + r.suggested, 0);
    expect(sum).toBe(100);
    for (const r of rec.rows) expect(Math.abs(r.delta)).toBeLessThanOrEqual(15);
    expect(rec.rows[0].suggested).toBe(55);
    expect(rec.changed).toBe(true);
  });

  it("keeps a floor so a pillar never disappears", () => {
    const rec = recommendWeights(
      [
        { id: "a", name: "A", color: "blue", weight: 90 },
        { id: "b", name: "B", color: "green", weight: 10 },
      ],
      [g("a", 5), g("b", 0.2)],
      10,
    );
    expect(rec.rows[1].suggested).toBeGreaterThanOrEqual(5);
    expect(rec.rows.reduce((s, r) => s + r.suggested, 0)).toBe(100);
  });

  it("waits for enough data", () => {
    expect(recommendWeights(pillars, [g("a", 2)], 3)).toMatchObject({ ready: false });
    expect(recommendWeights(pillars, [g("a", 2)], 3).reason).toMatch(/2 more posts/);
    expect(recommendWeights([], [], 10).ready).toBe(false);
    const unchanged = recommendWeights(pillars, [], 10);
    expect(unchanged.rows.map((r) => r.suggested)).toEqual([40, 30, 30]);
  });
});

describe("angleInfo", () => {
  it("reads the Studio's angle JSON and tolerates notes", () => {
    expect(angleInfo(JSON.stringify({ v: 1, selected: { structureId: "mistake-fix", hookType: "scene" }, options: [] }))).toEqual({ structureId: "mistake-fix", hookType: "scene" });
    expect(angleInfo("just a note")).toEqual({ structureId: null, hookType: null });
    expect(angleInfo("{broken")).toEqual({ structureId: null, hookType: null });
  });
});

describe("computeInsights", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const post = (id: string, over: Partial<InsightPost>): InsightPost => ({
    id,
    body: "A line\n\nMore text here.",
    pillar: "a",
    format: "story",
    angle: "",
    photoId: null,
    publishedAt: "2026-10-06T07:00:00Z",
    linkedinUrl: null,
    impressions: null,
    reactions: null,
    comments: null,
    reposts: null,
    ...over,
  });
  const pillars = [
    { id: "a", name: "Founder lessons", color: "blue", weight: 50 },
    { id: "b", name: "Hiring", color: "green", weight: 50 },
  ];

  it("aggregates by pillar, hook, weekday and photo", () => {
    const posts = [
      post("1", { body: "Last Tuesday at 9am I lost a client.\n\nStory.", pillar: "a", photoId: "p", reactions: 80, comments: 20, publishedAt: "2026-09-08T07:00:00Z" }),
      post("2", { body: "Yesterday I cried in a parking lot.\n\nStory.", pillar: "a", photoId: "p", reactions: 60, comments: 15, publishedAt: "2026-09-15T07:00:00Z" }),
      post("3", { body: "We refunded €84k.\n\nStory.", pillar: "a", photoId: "p", reactions: 70, comments: 10, publishedAt: "2026-09-22T07:00:00Z" }),
      post("4", { body: "Hiring is hard.\n\nStory.", pillar: "b", reactions: 10, comments: 1, publishedAt: "2026-09-10T15:00:00Z" }),
      post("5", { body: "Interviews are broken.\n\nStory.", pillar: "b", reactions: 12, comments: 2, publishedAt: "2026-09-17T15:00:00Z" }),
      post("6", { body: "Culture eats everything.\n\nStory.", pillar: "b", reactions: 8, comments: 1, publishedAt: "2026-09-24T15:00:00Z" }),
      post("7", { body: "No metrics yet.", pillar: "b", publishedAt: "2026-10-01T07:00:00Z" }),
      post("8", { body: "Not published", publishedAt: null, reactions: 999 }),
    ];
    const ins = computeInsights(posts, { pillars, timezone: "Europe/Zurich", now });
    expect(ins.totals.published).toBe(7);
    expect(ins.totals.measured).toBe(6);
    expect(ins.totals.missingMetrics).toBe(1);
    expect(ins.totals.last30).toBe(6);
    expect(ins.bestPillar?.key).toBe("a");
    expect(ins.groups.pillar[0].smoothed).toBeGreaterThan(1);
    expect(ins.groups.hook.find((g) => g.key === "scene")?.count).toBe(2);
    expect(ins.groups.weekday[0].label).toBe("Tuesday");
    expect(ins.groups.photo.map((g) => g.key)).toEqual(["photo", "text"]);
    expect(ins.top).toHaveLength(3);
    expect(ins.bottom).toHaveLength(3);
    expect(ins.rows[0].id).toBe("7");
    expect(ins.recommendations.some((r) => r.includes("Founder lessons"))).toBe(true);
    expect(ins.recommendations.some((r) => r.includes("own photo"))).toBe(true);
    expect(ins.weights.ready).toBe(true);
    expect(ins.weights.rows[0].suggested).toBeGreaterThan(50);
    expect(insightsDigest(ins)).toContain("By pillar:");
  });

  it("asks for data when little is measured", () => {
    const ins = computeInsights([post("1", { reactions: 3 })], { pillars, timezone: "UTC", now });
    expect(ins.recommendations).toEqual(["Log reactions and comments for 2 more posts to see what's working."]);
    expect(ins.weights.ready).toBe(false);
  });

  it("handles nothing published", () => {
    const ins = computeInsights([], { pillars, timezone: "UTC", now });
    expect(ins.totals.published).toBe(0);
    expect(ins.bestPillar).toBeNull();
    expect(ins.top).toEqual([]);
  });
});
