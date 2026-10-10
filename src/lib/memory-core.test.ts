import { describe, expect, it } from "vitest";
import {
  appendParagraph,
  blendScore,
  cleanList,
  countMemories,
  deriveSummary,
  deriveTitle,
  findPillar,
  firstLine,
  keepVerbatimQuotes,
  keywordScore,
  memoryDepth,
  memoryMatchesFilter,
  needsPhoto,
  parseMemoryFilter,
  rankHits,
  semanticNorm,
  stem,
  strengthFromScore,
  tokenize,
} from "./memory-core";
import type { Memory } from "./types";

function mem(over: Partial<Memory> = {}): Memory {
  return {
    id: "m1",
    profileId: "p1",
    interviewId: null,
    title: "",
    summary: "",
    story: "",
    when: "",
    place: "",
    people: [],
    emotions: [],
    details: [],
    quotes: [],
    lesson: "",
    pillar: null,
    tags: [],
    angles: [],
    status: "ready",
    strength: 3,
    createdAt: "2026-10-01 08:00:00",
    updatedAt: "2026-10-01 08:00:00",
    photoCount: 0,
    coverPhotoId: null,
    ...over,
  };
}

describe("filters", () => {
  it("flags stories that still need a photo", () => {
    expect(needsPhoto(mem())).toBe(true);
    expect(needsPhoto(mem({ status: "raw" }))).toBe(true);
    expect(needsPhoto(mem({ photoCount: 1 }))).toBe(false);
    expect(needsPhoto(mem({ status: "used" }))).toBe(false);
    expect(needsPhoto(mem({ status: "archived" }))).toBe(false);
  });

  it("counts every tab and keeps archived out of All", () => {
    const counts = countMemories([mem(), mem({ photoCount: 2 }), mem({ status: "used", photoCount: 1 }), mem({ status: "archived" }), mem({ status: "raw" })]);
    expect(counts).toEqual({ all: 4, ready: 2, "needs-photo": 2, used: 1, archived: 1 });
    expect(memoryMatchesFilter(mem({ status: "archived" }), "all")).toBe(false);
  });

  it("parses filter params", () => {
    expect(parseMemoryFilter("needs-photo")).toBe("needs-photo");
    expect(parseMemoryFilter("nope")).toBeNull();
    expect(parseMemoryFilter(null)).toBeNull();
  });

  it("matches pillars by id or by name", () => {
    const pillars = [
      { id: "p_a", name: "Leadership" },
      { id: "p_b", name: "AI in banks" },
    ];
    expect(findPillar(pillars, "p_b")?.id).toBe("p_b");
    expect(findPillar(pillars, "ai in Banks")?.id).toBe("p_b");
    expect(findPillar(pillars, null)).toBeNull();
    expect(findPillar(pillars, "Hiring")).toBeNull();
  });
});

describe("memoryDepth", () => {
  it("scores an empty card at zero with every probe listed", () => {
    const d = memoryDepth(mem());
    expect(d.score).toBe(0);
    expect(d.ready).toBe(false);
    expect(d.items.filter((i) => !i.present)).toHaveLength(11);
    expect(d.items.reduce((s, i) => s + i.points, 0)).toBe(100);
  });

  it("reaches ready for a vivid story with a photo", () => {
    const d = memoryDepth(
      mem({
        when: "March 2024, Friday 6pm",
        place: "our old office kitchen",
        story:
          "Our biggest client called. If we lost them we had two months of runway left. I was terrified. Then I realized they weren't angry about price at all. Since then we call every client monthly.",
        details: ["14 browser tabs of spreadsheets"],
        quotes: ["We're moving everything in-house."],
        lesson: "Ask why before you discount.",
        pillar: "p_a",
        photoCount: 1,
      }),
    );
    expect(d.score).toBe(100);
    expect(d.ready).toBe(true);
  });

  it("only gives the photo points when a photo is linked", () => {
    const without = memoryDepth(mem({ lesson: "Ship the ugly version first." }));
    const withPhoto = memoryDepth(mem({ lesson: "Ship the ugly version first.", photoCount: 2 }));
    expect(withPhoto.score - without.score).toBe(10);
    expect(without.items.find((i) => i.key === "photo")?.target).toBe("photo");
  });

  it("maps scores to 1-5 strength", () => {
    expect([0, 30, 50, 70, 85, 100].map(strengthFromScore)).toEqual([1, 2, 3, 4, 5, 5]);
  });
});

describe("keyword search", () => {
  it("stems common English endings", () => {
    expect(stem("clients")).toBe("client");
    expect(stem("hiring")).toBe("hir");
    expect(stem("stories")).toBe("story");
    expect(stem("classes")).toBe("class");
    expect(stem("business")).toBe("business");
  });

  it("drops stopwords and folds accents", () => {
    expect(tokenize("The Café in Zürich")).toEqual(["cafe", "zurich"]);
  });

  it("ranks title hits above story hits and matches word variants", () => {
    const a = mem({ title: "Hiring my first engineer", story: "It took three months." });
    const b = mem({ title: "A long week", story: "We talked about how we hire people." });
    const c = mem({ title: "Pricing call", story: "Nothing about people at all." });
    const q = "hiring";
    expect(keywordScore(a, q)).toBeGreaterThan(keywordScore(b, q));
    expect(keywordScore(b, q)).toBeGreaterThan(0);
    expect(keywordScore(c, q)).toBe(0);
  });

  it("gives a bonus for the exact phrase", () => {
    const m = mem({ title: "x", story: "The day the client said no to our proposal." });
    expect(keywordScore(m, "client said no")).toBeGreaterThan(keywordScore(mem({ title: "x", story: "No, said the client." }), "client said no"));
  });

  it("returns 0 for empty queries", () => {
    expect(keywordScore(mem({ title: "Anything" }), "the and of")).toBe(0);
  });
});

describe("blending and ranking", () => {
  it("stretches cosine into 0..1 and falls back to keywords without embeddings", () => {
    expect(semanticNorm(0.2)).toBe(0);
    expect(semanticNorm(0.9)).toBe(1);
    expect(blendScore(0.4, null)).toBe(0.4);
    expect(blendScore(0, 0.75)).toBeCloseTo(0.65);
  });

  it("keeps hits near the best one and drops the long tail", () => {
    const hits = [{ score: 0.9 }, { score: 0.5 }, { score: 0.3 }, { score: 0.05 }];
    expect(rankHits(hits).map((h) => h.score)).toEqual([0.9, 0.5]);
    expect(rankHits([{ score: 0 }])).toEqual([]);
    expect(rankHits(hits, { limit: 1 })).toHaveLength(1);
  });
});

describe("text helpers", () => {
  it("derives a summary from the first sentences", () => {
    expect(deriveSummary("Short one. Second sentence here. Third.")).toBe("Short one. Second sentence here.");
    const long = "This is a very long first sentence that keeps going ".repeat(6) + ".";
    expect(deriveSummary(long).length).toBeLessThanOrEqual(181);
    expect(deriveSummary("")).toBe("");
  });

  it("derives a title", () => {
    expect(deriveTitle("We lost our biggest client on a Friday. It hurt.")).toBe("We lost our biggest client on a Friday");
    expect(deriveTitle("a ".repeat(80)).endsWith("…")).toBe(true);
  });

  it("keeps only quotes that are really in the source", () => {
    const source = "She looked at me and said: “Why are we still doing this by hand?” I had no answer.";
    const quotes = ["Why are we still doing this by hand?", '"why are we still doing this BY HAND"', "Why do we still do this manually?", "I had"];
    expect(keepVerbatimQuotes(quotes, source)).toEqual(["Why are we still doing this by hand?"]);
  });

  it("cleans lists", () => {
    expect(cleanList(["  Anna ", "anna", "", "Ben  Li"])).toEqual(["Anna", "Ben Li"]);
  });

  it("appends paragraphs and reads first lines", () => {
    expect(appendParagraph("One.\n\n", "Two.")).toBe("One.\n\nTwo.");
    expect(appendParagraph("", "Two.")).toBe("Two.");
    expect(appendParagraph("One.", "  ")).toBe("One.");
    expect(firstLine("\n\n  Hook line  \nBody")).toBe("Hook line");
  });
});
