import { describe, expect, it } from "vitest";
import { StrategySchema, type Strategy } from "@/lib/types";
import { cadenceDays, cardToMemory, evenWeights, groundAvoidTopics, groundPositioning, mergeStrategy, samePillar, tidyList, extractSummary, type SaidMessage } from "./outputs";
import { PositioningExtractSchema, storyCardSchema } from "./schemas";
import {
  coverageCheckPrompt,
  directorNote,
  interviewerMessages,
  interviewerSystemPrompt,
  languageName,
  openingMessage,
  protocolLines,
  questionOnTarget,
  storyCardPrompt,
  type InterviewContext,
} from "./prompts";
import type { Decision } from "./engine";

const extract = (patch: Partial<ReturnType<typeof PositioningExtractSchema.parse>> = {}) => PositioningExtractSchema.parse({ ...patch });

describe("tidyList", () => {
  it("trims, strips bullets, de-duplicates case-insensitively and caps", () => {
    expect(tidyList([" - Clients ", "clients", "", null, "1. Hiring", "Investors"], 2)).toEqual(["Clients", "Hiring"]);
  });

  it("keeps numbers that start an item", () => {
    expect(tidyList(["40,000 francs over budget", "3 weeks late", "2) Second point", "• 12 people in the room"])).toEqual([
      "40,000 francs over budget",
      "3 weeks late",
      "Second point",
      "12 people in the room",
    ]);
  });
});

describe("cardToMemory", () => {
  const card = storyCardSchema(["AI in banks", "Switzerland"]).parse({
    title: '"The budget meeting"',
    summary: "The CFO cut the budget.",
    story: "I walked in.\n\n\n\nShe said no.",
    people: ["CFO", "cfo"],
    quotes: ["we are cutting the budget by 40%", "Innovation is a journey, not a destination."],
    pillar: "AI in banks",
    tags: ["#Budget", "AI"],
    strength: 5,
  });
  const pillars = [
    { id: "p1", name: "AI in banks" },
    { id: "p2", name: "Switzerland" },
  ];

  it("keeps only verbatim quotes, maps the pillar and blends strength", () => {
    const m = cardToMemory(card, { userTexts: ['The CFO said "We are cutting the budget by 40%." I froze.'], pillars, presetPillarId: null, coverageStrength: 3 });
    expect(m.title).toBe("The budget meeting");
    expect(m.quotes).toEqual(["We are cutting the budget by 40%."]);
    expect(m.pillar).toBe("p1");
    expect(m.strength).toBe(4);
    expect(m.people).toEqual(["CFO"]);
    expect(m.tags).toEqual(["budget", "ai"]);
    expect(m.story).toBe("I walked in.\n\nShe said no.");
  });

  it("prefers the pillar the interview was targeted at", () => {
    const m = cardToMemory(card, { userTexts: [], pillars, presetPillarId: "p2", coverageStrength: 1 });
    expect(m.pillar).toBe("p2");
    expect(m.quotes).toEqual([]);
    expect(m.strength).toBe(3);
  });

  it("schema without pillars accepts free text", () => {
    expect(storyCardSchema([]).parse({ title: "x", pillar: "anything" }).pillar).toBe("anything");
    expect(() => storyCardSchema(["A"]).parse({ title: "x", pillar: "B" })).toThrow();
  });
});

describe("mergeStrategy", () => {
  it("builds a fresh strategy with 3-4 pillars, ids, colors, even weights and cadence", () => {
    const s = mergeStrategy(
      null,
      extract({
        positioning: "I help family companies adopt AI without breaking what works.",
        goals: ["Clients", "Speaking"],
        audienceWho: "Owners of family businesses in DACH",
        pillars: [
          { name: "AI in old companies", description: "Field notes", storyPrompts: ["When did a client surprise you?"] },
          { name: "Switzerland", description: "", storyPrompts: [] },
          { name: "Hackathons", description: "", storyPrompts: [] },
          { name: "Succession", description: "", storyPrompts: [] },
          { name: "Fifth", description: "", storyPrompts: [] },
        ],
        postsPerWeek: 4,
      }),
      { language: "de" },
    );
    expect(() => StrategySchema.parse(s)).not.toThrow();
    expect(s.pillars).toHaveLength(4);
    expect(s.pillars.map((p) => p.weight).reduce((a, b) => a + b, 0)).toBe(100);
    expect(new Set(s.pillars.map((p) => p.id)).size).toBe(4);
    expect(s.pillars[0].id).toBe("pl_ai-in-old-companies");
    expect(s.pillars[0].color).toBe("blue");
    expect(s.cadence).toMatchObject({ postsPerWeek: 4, days: [1, 2, 3, 4] });
    expect(s.language).toBe("de");
    expect(s.audience.who).toBe("Owners of family businesses in DACH");
  });

  it("merges into an existing strategy without losing edits", () => {
    const existing: Strategy = StrategySchema.parse({
      positioning: "Old line",
      goals: ["Hiring"],
      notes: "Never uses emojis.",
      cadence: { postsPerWeek: 2, days: [2, 4], time: "07:45" },
      pillars: [{ id: "p1", name: "AI in banks", description: "Mine", weight: 70, storyPrompts: ["A"], color: "pink" }],
    });
    const s = mergeStrategy(
      existing,
      extract({
        positioning: "New line",
        goals: ["hiring", "Clients"],
        pillars: [
          { name: "AI inside banks", description: "Theirs", storyPrompts: ["B", "A"] },
          { name: "Moving to Switzerland", description: "Relocation", storyPrompts: [] },
        ],
        postsPerWeek: 5,
        notes: "Dry humour.",
      }),
      { language: "en" },
    );
    expect(s.positioning).toBe("New line");
    expect(s.goals).toEqual(["Hiring", "Clients"]);
    expect(s.cadence).toEqual({ postsPerWeek: 2, days: [2, 4], time: "07:45" });
    const banks = s.pillars.find((p) => p.id === "p1")!;
    expect(banks).toMatchObject({ description: "Mine", color: "pink", storyPrompts: ["A", "B"] });
    expect(s.pillars).toHaveLength(2);
    expect(s.pillars.reduce((a, p) => a + p.weight, 0)).toBe(100);
    expect(s.pillars[1].color).not.toBe("pink");
    expect(s.notes).toBe("Never uses emojis.\nDry humour.");
  });

  it("keeps existing text when the interview didn't cover it", () => {
    const existing = StrategySchema.parse({ positioning: "Keep me", cta: "DM me" });
    const s = mergeStrategy(existing, extract(), { language: "en" });
    expect(s.positioning).toBe("Keep me");
    expect(s.cta).toBe("DM me");
  });

  it("never trims lists the person wrote, and stores a normalized strategy", () => {
    const goals = Array.from({ length: 11 }, (_, i) => `Goal ${i + 1}`);
    const existing = StrategySchema.parse({ goals, pillars: [{ id: "p1", name: "  Banks ", weight: 100, color: "chartreuse" }] });
    const s = mergeStrategy(existing, extract({ goals: ["New goal"] }), { language: "en" });
    expect(s.goals).toEqual(goals);
    expect(s.pillars[0]).toMatchObject({ id: "p1", name: "Banks", weight: 100, color: "blue" });
  });
});

/** The story answers from the real end-to-end run: "40k" with no currency anywhere. */
const STORY_ANSWERS = [
  "Last March a founder of a bakery chain in Valencia asked us for a full rebrand. 40k budget. In the first workshop I asked to see their sales by product instead of their logo.",
  "We found that 60% of revenue came from 4 products and nobody knew it. We killed the rebrand and spent 6 weeks redesigning the offer and the shop window. Sales went up 23% in two months.",
  "I felt scared, honestly. We were turning down 40k of work. But afterwards she sent me a photo of a queue outside the shop and wrote 'ok, you were right'.",
];

describe("figures in extracted memories", () => {
  it("removes a currency the user never named and keeps the bare number", () => {
    const card = storyCardSchema([]).parse({
      title: "Turning down a $40k rebrand",
      summary: "A bakery founder dropped a forty thousand dollar rebrand after seeing sixty percent of revenue came from four products.",
      story: "We were turning down 40k of work.",
      details: ["$40k budget", "60% revenue", "23% sales increase"],
      lesson: "Sell the problem before the solution.",
      angles: ["The moment I told a founder to kill their $40k rebrand"],
    });
    const m = cardToMemory(card, { userTexts: STORY_ANSWERS, pillars: [], presetPillarId: null, coverageStrength: 4 });
    expect(m.title).toBe("Turning down a 40k rebrand");
    expect(m.summary).toBe("A bakery founder dropped a 40k rebrand after seeing 60% of revenue came from 4 products.");
    expect(m.details).toEqual(["40k budget", "60% revenue", "23% sales increase"]);
    expect(m.angles).toEqual(["The moment I told a founder to kill their 40k rebrand"]);
  });

  it("keeps a currency the user did use", () => {
    const card = storyCardSchema([]).parse({ title: "Refunding €84k in one afternoon", details: ["84,000 euros"] });
    const m = cardToMemory(card, { userTexts: ["We refunded 84,000 euros in one afternoon."], pillars: [], presetPillarId: null, coverageStrength: 3 });
    expect(m.title).toBe("Refunding €84k in one afternoon");
    expect(m.details).toEqual(["84,000 euros"]);
  });
});

/** The positioning run: the interviewer listed "money" as an option; the user only excluded politics and family. */
const POSITIONING: SaidMessage[] = [
  { role: "assistant", content: "What do you want LinkedIn to do for you?" },
  { role: "user", content: "Their pain is that agencies sell them decks and not results. They spend 40k on a rebrand and nothing changes in sales." },
  { role: "assistant", content: "Most companies need to fix their offer, that is a strong take. What's off-limits for your posts: clients, your employer, family, politics, money?" },
  {
    role: "user",
    content:
      "Topics: behind the scenes of client work, lessons from running an agency of 12 people, and opinions on marketing for founders. I don't want to talk about politics or my family.",
  },
  { role: "assistant", content: "How often could you post?" },
  { role: "user", content: "Contrarian: rebrands are usually a waste of money. The sprint is around 18k euros." },
];

describe("grounding the positioning extract", () => {
  it("drops off-limits topics that only the interviewer named", () => {
    expect(groundAvoidTopics(["Politics", "Family", "Money", "Clients"], POSITIONING)).toEqual(["Politics", "Family"]);
  });

  it("accepts short direct answers to the off-limits question, in any form", () => {
    const t: SaidMessage[] = [
      { role: "assistant", content: "Anything you'd rather keep private or off-limits?" },
      { role: "user", content: "Religion. My kids." },
    ];
    expect(groundAvoidTopics(["Religious topics", "Children", "Kids"], t)).toEqual(["Religious topics", "Kids"]);
    expect(groundAvoidTopics(["Política", "Familia"], [{ role: "user", content: "No quiero hablar de política ni de mi familia." }])).toEqual(["Política", "Familia"]);
  });

  it("grounds the whole extract: topics and figures", () => {
    const x = groundPositioning(
      {
        ...extract({ audiencePains: ["Spending $40k on a rebrand with no change in sales"], offers: ["6-week brand sprint, around 18k euros"], avoidTopics: ["Politics", "Money"] }),
        pillars: [{ name: "The promise over the logo", description: "", storyPrompts: ["When did you tell a founder a $40k rebrand was a waste?"] }],
      },
      POSITIONING,
    );
    expect(x.avoidTopics).toEqual(["Politics"]);
    expect(x.audiencePains).toEqual(["Spending 40k on a rebrand with no change in sales"]);
    expect(x.offers).toEqual(["6-week brand sprint, around 18k euros"]);
    expect(x.pillars[0].storyPrompts).toEqual(["When did you tell a founder a 40k rebrand was a waste?"]);
  });

  it("aligns generated pillars with the extract's own figures when merging", () => {
    const s = mergeStrategy(
      null,
      extract({
        audiencePains: ["Spending 40k on a rebrand with no change in sales"],
        pillars: [{ name: "Promise over logo", description: "Why a forty thousand dollar rebrand rarely moves sales.", storyPrompts: ["Describe the moment you told a founder a $40k rebrand was a waste of money."] }],
      }),
      { language: "en" },
    );
    expect(s.pillars[0].description).toBe("Why a 40k rebrand rarely moves sales.");
    expect(s.pillars[0].storyPrompts).toEqual(["Describe the moment you told a founder a 40k rebrand was a waste of money."]);
  });
});

describe("helpers", () => {
  it("matches pillar names loosely", () => {
    expect(samePillar("AI in banks", "ai inside BANKS")).toBe(true);
    expect(samePillar("Hiring", "Switzerland")).toBe(false);
  });
  it("splits weights evenly to 100", () => {
    expect(evenWeights(3)).toEqual([34, 33, 33]);
    expect(evenWeights(0)).toEqual([]);
  });
  it("spreads cadence days", () => {
    expect(cadenceDays(3)).toEqual([2, 3, 4]);
    expect(cadenceDays(12)).toHaveLength(7);
  });
  it("summarises an extract for the pillar retry", () => {
    expect(extractSummary(extract({ positioning: "P", goals: ["G"] }))).toBe("Positioning: P\nGoals: G");
  });
});

describe("prompts", () => {
  const ctx: InterviewContext = {
    kind: "story",
    name: "Ivan Petrov",
    headline: "AI consultant",
    language: "es",
    positioning: "",
    audience: "CFOs",
    goals: [],
    pillar: { name: "AI in banks", description: "" },
    savedTitles: ["The budget meeting"],
    avoidTopics: ["politics"],
    seed: "When did you almost quit?",
    earlierThreads: [],
  };
  const decision: Decision = { stage: "opening", firstMessage: true, covered: [], missing: [] };

  it("names the language and keeps context lines", () => {
    const sys = interviewerSystemPrompt(ctx);
    expect(sys).toContain("Write in Spanish");
    expect(sys).toContain("The budget meeting");
    expect(sys).toContain("politics");
    expect(languageName("pt-BR")).toBe("Portuguese");
  });

  it("puts the seed in the opening note and the director note last", () => {
    const msgs = interviewerMessages(ctx, [], decision);
    expect(msgs[0]).toEqual({ role: "user", content: "Hi, I'm ready." });
    expect(msgs[msgs.length - 1].role).toBe("system");
    expect(msgs[msgs.length - 1].content).toContain("When did you almost quit?");
    expect(directorNote(ctx, decision)).toContain("greet Ivan");
  });

  it("merges consecutive same-role messages and marks photos", () => {
    const msgs = interviewerMessages(
      ctx,
      [
        { id: "a", role: "assistant", content: "Where were you?", photoIds: [] },
        { id: "b", role: "user", content: "At the office.", photoIds: [] },
        { id: "c", role: "user", content: "", photoIds: ["x"] },
      ],
      { stage: "probe", target: "people", firstMessage: false, covered: ["scene"], missing: ["people"] },
    );
    const users = msgs.filter((m) => m.role === "user");
    expect(users[users.length - 1].content).toContain("[shared a photo]");
    expect(msgs.filter((m) => m.role === "user").length).toBe(2);
  });

  it("lists the right items for coverage checks", () => {
    expect(coverageCheckPrompt("story", "Ana", "t").user).toContain("turning:");
    expect(coverageCheckPrompt("positioning", "Ana", "t").user).toContain("rhythm:");
  });

  it("has fixed protocol lines for supported languages only", () => {
    expect(protocolLines("en")?.photoAsk).toMatch(/photo/);
    expect(protocolLines("es-ES")?.wrap).toContain("Finish & save");
    expect(protocolLines("ja")).toBeNull();
  });

  it("builds deterministic English openings with the seed verbatim", () => {
    const first = openingMessage({ ...ctx, language: "en" }, { returning: false, variant: 0 })!;
    expect(first).toMatch(/^Hi Ivan\./);
    expect(first.endsWith("When did you almost quit?")).toBe(true);
    const again = openingMessage({ ...ctx, language: "en" }, { returning: true, variant: 4 })!;
    expect(again).not.toEqual(first);
    expect(openingMessage({ ...ctx, kind: "positioning", language: "en" }, { returning: false, variant: 0 })).toContain("LinkedIn to do for you");
    expect(openingMessage(ctx, { returning: false, variant: 0 })).toBeNull();
  });

  it("checks that a question matches its target", () => {
    expect(questionOnTarget("scene", "Where were you when you found out?")).toBe(true);
    expect(questionOnTarget("people", "Where were you when you found out?")).toBe(false);
    expect(questionOnTarget("stakes", "What could you have lost if it failed?")).toBe(true);
    expect(questionOnTarget("rhythm", "How often could you post?")).toBe(true);
    expect(questionOnTarget(undefined, "Anything?")).toBe(true);
  });

  it("protocol notes ask the model for a reaction only", () => {
    const note = directorNote(ctx, { stage: "wrap", firstMessage: false, covered: [], missing: [] }, "protocol");
    expect(note).toContain("No question");
    expect(directorNote(ctx, { stage: "wrap", firstMessage: false, covered: [], missing: [], photoDeferred: true }, "free")).toContain("add the photo later");
  });

  it("passes the privacy note to the story extractor", () => {
    const p = storyCardPrompt({ name: "Ana", headline: "", language: "en", pillars: [], transcript: "t", privacy: "Don't name the bank." });
    expect(p.user).toContain("Privacy note from Ana");
    expect(p.user).toContain("Leave out the interviewer's questions");
  });
});
