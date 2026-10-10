import { describe, expect, it } from "vitest";
import { MARA_POSTS } from "./__fixtures__/corpus";
import { computeVoiceExtras, computeVoiceStats, postSkeleton, quantile, skeletonSteps } from "./stylometry";
import { classifyCloser, classifyOpener, findList, sentencesOf, wordCount } from "./text";

describe("text helpers", () => {
  it("counts words with apostrophes and hyphens as one", () => {
    expect(wordCount("I don't co-sign 40,000 euros.")).toBe(5);
  });

  it("splits sentences on punctuation and line breaks", () => {
    expect(sentencesOf("Short one. Another one?\nA line without a period\n3. A list item.")).toEqual(["Short one.", "Another one?", "A line without a period", "A list item."]);
  });

  it("finds a numbered list even when items have explanation lines", () => {
    const text = "Intro line.\n\n1. First thing.\nWhy it matters.\n2. Second thing.\n3. Third thing.\n\nOutro.";
    expect(findList(text)).toMatchObject({ kind: "numbered", items: 3 });
    expect(findList("- one\nplain\n\nmore plain")).toBeNull();
  });

  it("classifies openers", () => {
    expect(classifyOpener("Yesterday at 6:40 a.m. a driver handed me a map.")).toBe("scene");
    expect(classifyOpener("I have spent six years fixing warehouses.")).toBe("credential");
    expect(classifyOpener("We refunded €84k in one afternoon.")).toBe("number");
    expect(classifyOpener('"You are running a favour bank," my first board member said.')).toBe("quote");
    expect(classifyOpener("Why does every forecast miss by 30%?")).toBe("question");
    expect(classifyOpener("Most supply chain problems are people problems.")).toBe("claim");
  });

  it("classifies closers", () => {
    expect(classifyCloser("Do you see the same thing?")).toBe("question");
    expect(classifyCloser("If you're thinking about moving, write to me.")).toBe("invite");
    expect(classifyCloser("I bet the renaming starts in November.")).toBe("bet");
    expect(classifyCloser("So the lesson: count the pallets yourself.")).toBe("lesson");
    expect(classifyCloser("I think about that pasta more than I should.")).toBe("statement");
  });
});

describe("computeVoiceStats", () => {
  const stats = computeVoiceStats(MARA_POSTS);

  it("measures the basics", () => {
    expect(stats.sampleCount).toBe(7);
    expect(stats.medianWords).toBeGreaterThan(50);
    expect(stats.medianWords).toBeLessThan(120);
    expect(stats.avgSentenceWords).toBeGreaterThan(5);
    expect(stats.avgSentenceWords).toBeLessThan(20);
    expect(stats.avgHookChars).toBeGreaterThan(40);
  });

  it("sees what this writer never does", () => {
    expect(stats.emojiPerPost).toBe(0);
    expect(stats.hashtagsPerPost).toBe(0);
    expect(stats.emDashPerPost).toBe(0);
    expect(stats.exclamationPerPost).toBe(0);
    expect(stats.topEmojis).toEqual([]);
  });

  it("measures lists, questions and first person", () => {
    expect(stats.bulletRatio).toBeCloseTo(2 / 7, 2);
    expect(stats.questionRatio).toBeCloseTo(5 / 7, 2);
    expect(stats.firstPersonRatio).toBeGreaterThan(0.3);
  });

  it("finds recurring phrases, openers and closers", () => {
    expect(stats.signaturePhrases.map((p) => p.toLowerCase())).toContain("and one more");
    expect(stats.commonClosers.map((p) => p.toLowerCase())).toContain("do you see");
    expect(stats.commonOpeners).toEqual([]);
  });

  it("counts emojis, hashtags and dashes", () => {
    const s = computeVoiceStats([
      "Big week 🚀🚀 for the team 👩‍💻. It was a lot — really.\n\n#ops #logistics",
      "Another one 🚀 here – with an en dash. No hashtags here at all, just text -- and more.",
    ]);
    expect(s.emojiPerPost).toBe(2);
    expect(s.topEmojis[0]).toBe("🚀");
    expect(s.topEmojis).toContain("👩‍💻");
    expect(s.hashtagsPerPost).toBe(1);
    expect(s.emDashPerPost).toBe(1.5);
  });

  it("handles an empty corpus", () => {
    const s = computeVoiceStats([]);
    expect(s.sampleCount).toBe(0);
    expect(s.avgWords).toBe(0);
    expect(s.signaturePhrases).toEqual([]);
  });

  it("uses the profile language for first-person detection", () => {
    const es = computeVoiceStats(["Ayer yo hablé con mi equipo durante dos horas.", "El equipo entregó todo a tiempo esta semana."], { language: "es" });
    expect(es.firstPersonRatio).toBe(0.5);
  });
});

describe("computeVoiceExtras", () => {
  const x = computeVoiceExtras(MARA_POSTS);

  it("describes shape and habits", () => {
    expect(x.sampleCount).toBe(7);
    expect(x.wordsP25).toBeLessThanOrEqual(x.wordsP75);
    expect(x.numberedListRatio).toBeCloseTo(2 / 7, 2);
    expect(x.bulletListRatio).toBe(0);
    expect(x.listItemsMin).toBe(3);
    expect(x.listItemsMax).toBe(4);
    expect(x.linkRatio).toBe(0);
    expect(x.sentenceWordsSd).toBeGreaterThan(0);
  });

  it("gives opener/closer distributions that add up", () => {
    const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    expect(total(x.openerTypes)).toBeCloseTo(1, 1);
    expect(total(x.closerTypes)).toBeCloseTo(1, 1);
    expect(x.closerTypes.question).toBeCloseTo(5 / 7, 2);
  });
});

describe("postSkeleton", () => {
  it("captures the list-with-a-twist shape", () => {
    const s = postSkeleton(MARA_POSTS[0]);
    expect(s).toMatchObject({ opener: "credential", closer: "question", list: { kind: "numbered", items: 3 }, afterList: true });
    expect(skeletonSteps(s)).toEqual(["Credential hook", `${s.paragraphs} paragraphs`, "numbered list of 3", "twist after the list", "ends on a question"]);
  });

  it("describes a scene story without a list", () => {
    const s = postSkeleton(MARA_POSTS[1]);
    expect(s.opener).toBe("scene");
    expect(s.list).toBeNull();
    expect(skeletonSteps(s)).not.toContain("twist after the list");
  });
});

describe("quantile", () => {
  it("interpolates", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBe(0);
  });
});
