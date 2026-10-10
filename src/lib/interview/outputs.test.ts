import { describe, expect, it } from "vitest";
import { StrategySchema, type Strategy } from "@/lib/types";
import { cadenceDays, cardToMemory, evenWeights, mergeStrategy, samePillar, tidyList, extractSummary } from "./outputs";
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
