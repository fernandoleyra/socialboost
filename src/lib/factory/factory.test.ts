import { describe, expect, it } from "vitest";
import type { Critique, LintIssue, Strategy, VoiceStats } from "@/lib/types";
import { AngleSchema, cleanHook, hookOf, normalizeAngles, parseAngleField, replaceHook, serializeAngleField, toAngle } from "./angles";
import { cleanPost, stripUnicodeStyling } from "./clean";
import { changeRatio, diffWords } from "./diff";
import { aboveFold, foldIndex } from "./fold";
import { findPillar } from "./pillars";
import { anglesPrompt, critiquePrompt, draftPrompt, factsText, instructionsFromCritique, instructionsFromLint, languageName, presetInstruction, revisePrompt, targetWords, writingRules, type PromptContext } from "./prompts";
import { buildQuality, combineScore, critiqueScore, hashBody, isCritiqueFresh, qualityGate, relint } from "./quality";
import { fromLocalInput, nextOpenSlots, toLocalInput } from "./schedule";
import { checkStatusChange, statusAfterGeneration, statusAfterHumanEdit } from "./status";
import { STRUCTURES, STRUCTURE_IDS, getStructure, matchStructureId, recommendStructures } from "./structures";

/* ------------------------------------------------------------------ */

describe("structures", () => {
  it("has 10 unique, complete structures", () => {
    expect(STRUCTURES).toHaveLength(10);
    expect(new Set(STRUCTURES.map((s) => s.id)).size).toBe(10);
    for (const s of STRUCTURES) {
      expect(s.skeleton.length).toBeGreaterThanOrEqual(4);
      expect(s.words[0]).toBeLessThan(s.words[1]);
      expect(s.skeleton[0].toLowerCase()).toContain("hook");
    }
  });

  it("recommends by story shape", () => {
    expect(recommendStructures({ story: "I made a mistake that cost us the client. I missed the signs." })[0]).toBe("mistake-fix");
    expect(recommendStructures({ story: "I met an investor at a dinner in Zurich and asked him one question.", people: ["Igor"] })[0]).toBe("meeting");
    expect(recommendStructures({ story: "I was surprised. I expected chaos and discovered calm." })[0]).toBe("discovery");
    expect(recommendStructures({ story: "" })).toHaveLength(STRUCTURE_IDS.length);
  });

  it("matches loose structure ids from models", () => {
    expect(matchStructureId("Scene_Lesson")).toBe("scene-lesson");
    expect(matchStructureId("Before / after")).toBe("before-after");
    expect(matchStructureId("nonsense")).toBeNull();
    expect(getStructure("mistake-fix")?.format).toBe("lesson");
  });
});

/* ------------------------------------------------------------------ */

describe("angles", () => {
  const a = { hook: "“11:40 pm, hotel lobby in Zurich.”", hookType: "Scene", structureId: "scene_lesson", takeaway: " Ask early. ", whyItWorks: "Concrete." };

  it("normalises model output and drops duplicates", () => {
    const out = normalizeAngles([a, { ...a }, { hook: "", takeaway: "" }, { ...a, hook: "Another hook", structureId: "unknown" }], "mistake-fix");
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ hook: "11:40 pm, hotel lobby in Zurich.", hookType: "scene", structureId: "scene-lesson", takeaway: "Ask early.", whyItWorks: "Concrete." });
    expect(out[1].structureId).toBe("mistake-fix");
    expect(AngleSchema.safeParse(out[0]).success).toBe(true);
  });

  it("keeps a structure-only angle chosen by the user", () => {
    expect(toAngle({ hook: "", structureId: "how-i-do" })).toMatchObject({ hook: "", structureId: "how-i-do" });
  });

  it("round-trips the stored field and reads legacy text as a note", () => {
    const field = { selected: normalizeAngles([a], "scene-lesson")[0], options: normalizeAngles([a], "scene-lesson"), note: "" };
    expect(parseAngleField(serializeAngleField(field))).toEqual(field);
    expect(parseAngleField("Talk about the refund")).toEqual({ selected: null, options: [], note: "Talk about the refund" });
    expect(parseAngleField("")).toEqual({ selected: null, options: [], note: "" });
    expect(serializeAngleField({ selected: null, options: [], note: "" })).toBe("");
  });

  it("cleans hooks and replaces the first line", () => {
    expect(cleanHook("Hook: We refunded €84k .")).toBe("We refunded €84k.");
    expect(replaceHook("Old hook\n\nBody stays.", "New hook ")).toBe("New hook\n\nBody stays.");
    expect(replaceHook("Old\nBody", '"Did you check the proxy?"')).toBe('"Did you check the proxy?"\nBody');
    expect(normalizeAngles([{ hook: '"Did you check the proxy?"', hookType: "dialogue", structureId: "meeting" }], "scene-lesson")[0].hook).toBe('"Did you check the proxy?"');
    expect(hookOf("\n\n  First line  \nSecond")).toBe("First line");
  });
});

/* ------------------------------------------------------------------ */

describe("fold", () => {
  it("returns null when everything fits", () => {
    expect(foldIndex("A short hook.")).toBeNull();
    expect(foldIndex("")).toBeNull();
  });

  it("cuts after three lines, counting blank lines", () => {
    const text = "Hook line.\n\nSecond paragraph starts here.\nThird line.\nFourth line.";
    const idx = foldIndex(text, "desktop")!;
    expect(text.slice(0, idx)).toBe("Hook line.\n\nSecond paragraph starts here.");
  });

  it("cuts long single paragraphs at a word boundary near the char limit", () => {
    const text = "word ".repeat(80).trim();
    const idx = foldIndex(text, "mobile")!;
    expect(idx).toBeLessThanOrEqual(140);
    expect(text[idx]).toBe(" ");
    expect(foldIndex(text, "desktop")!).toBeGreaterThan(idx);
  });

  it("exposes the visible part", () => {
    expect(aboveFold("One.\nTwo.\nThree.\nFour.").visible).toBe("One.\nTwo.\nThree.");
    expect(aboveFold("One.").truncated).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("cleanPost", () => {
  it("strips preambles, sign-offs, fences, markdown and think blocks", () => {
    const raw = "<think>plan</think>Sure! Here's your LinkedIn post:\n\n**Hook** line here.\n\n## Not a heading\n\nBody.\n\nLet me know if you'd like any changes!";
    expect(cleanPost(raw)).toBe("Hook line here.\n\nNot a heading\n\nBody.");
    expect(cleanPost("```\nPost body.\n```")).toBe("Post body.");
    expect(cleanPost('"Whole post in quotes."')).toBe("Whole post in quotes.");
    expect(cleanPost("Line\n\n\n\nLine 2   ")).toBe("Line\n\nLine 2");
  });

  it("keeps real content that only looks like a preamble", () => {
    expect(cleanPost("Here's what I learned after 60 hires:\n\n1. Ask.")).toBe("Here's what I learned after 60 hires:\n\n1. Ask.");
    expect(cleanPost("Story.\n\nLet me know if you've seen this in your team.")).toBe("Story.\n\nLet me know if you've seen this in your team.");
  });

  it("hides an unfinished think block while streaming", () => {
    expect(cleanPost("<think>still reasoning")).toBe("");
  });

  it("turns unicode bold into plain letters", () => {
    expect(stripUnicodeStyling("𝗛𝗲𝗹𝗹𝗼 𝘄𝗼𝗿𝗹𝗱")).toBe("Hello world");
  });
});

/* ------------------------------------------------------------------ */

const crit = (n: number, over: Partial<Critique> = {}): Critique => ({ humanness: n, specificity: n, voiceMatch: n, hook: n, issues: [], suggestions: [], ...over });

describe("quality", () => {
  it("weights the critique", () => {
    expect(critiqueScore(crit(10))).toBe(100);
    expect(critiqueScore(crit(5))).toBe(50);
    expect(critiqueScore(crit(1, { humanness: 10 }))).toBe(37);
  });

  it("combines lint and critique and caps blocked drafts", () => {
    expect(combineScore(90, [], null)).toBe(90);
    expect(combineScore(100, [], crit(9))).toBe(94);
    expect(combineScore(100, [{ severity: "error" }], crit(10))).toBe(79);
    expect(combineScore(100, [], crit(9, { hook: 5 }))).toBe(79);
  });

  it("tracks whether the critique still describes the text", () => {
    const q = buildQuality({ body: "Text A", lint: [], lintScore: 100, critique: crit(9) });
    expect(isCritiqueFresh(q, "Text A")).toBe(true);
    expect(isCritiqueFresh(q, "Text  A ")).toBe(true);
    expect(isCritiqueFresh(q, "Text B")).toBe(false);
    const after = relint(q, "Text B", [], 100);
    expect(after.critique).not.toBeNull();
    expect(after.score).toBe(100);
    expect(isCritiqueFresh(after, "Text B")).toBe(false);
    expect(isCritiqueFresh(relint(after, "Text A", [], 100), "Text A")).toBe(true);
  });

  it("gates review on score, errors and freshness", () => {
    const good = buildQuality({ body: "Body", lint: [], lintScore: 100, critique: crit(9) });
    expect(qualityGate(good, "Body")).toEqual({ ready: true, reasons: [] });
    expect(qualityGate(good, "Changed").ready).toBe(false);
    expect(qualityGate(null, "Body").reasons).toEqual(["Not checked yet."]);
    expect(qualityGate(good, " ").reasons).toEqual(["The post is empty."]);
    const lint: LintIssue[] = [{ rule: "em-dash", severity: "error", message: "x" }];
    expect(qualityGate(buildQuality({ body: "Body", lint, lintScore: 88, critique: crit(9) }), "Body").reasons[0]).toContain("lint error");
  });

  it("hashes stably", () => {
    expect(hashBody("a  b\n")).toBe(hashBody("a b"));
    expect(hashBody("a b")).not.toBe(hashBody("a c"));
  });
});

/* ------------------------------------------------------------------ */

const strategy: Strategy = {
  positioning: "I help European banks ship AI without breaking compliance.",
  goals: ["clients"],
  audience: { who: "CIOs of mid-size banks", pains: ["pilots that never ship"], desires: ["one live use case"] },
  expertise: ["18 hackathon wins"],
  offers: ["AI rollout sprint"],
  beliefs: [],
  contrarianTakes: [],
  pillars: [{ id: "p1", name: "Field notes", description: "What I see inside banks", weight: 50, storyPrompts: [], color: "blue" }],
  avoidTopics: ["politics"],
  cta: "the AI rollout sprint",
  cadence: { postsPerWeek: 3, days: [2, 3, 4], time: "08:30" },
  language: "en",
  notes: "",
};

const stats = (over: Partial<VoiceStats> = {}): VoiceStats => ({
  sampleCount: 10,
  avgWords: 230,
  medianWords: 235,
  avgSentenceWords: 14,
  avgParagraphLines: 1.5,
  oneLineParagraphRatio: 0.3,
  emojiPerPost: 0,
  hashtagsPerPost: 0,
  questionRatio: 0.3,
  exclamationPerPost: 0,
  emDashPerPost: 0,
  bulletRatio: 0.4,
  firstPersonRatio: 0.9,
  avgHookChars: 120,
  topEmojis: [],
  commonOpeners: [],
  commonClosers: [],
  signaturePhrases: [],
  ...over,
});

const ctx = (over: Partial<PromptContext> = {}): PromptContext => ({
  author: { name: "Ana Ruiz", headline: "AI lead" },
  language: "en",
  strategy,
  pillar: strategy.pillars[0],
  memory: {
    title: "The proxy fix",
    summary: "A junior engineer saved the demo.",
    story: "At 7:40 the export kept timing out after 30 seconds. Marta checked the proxy and fixed it in four minutes.",
    when: "Tuesday, March 2026",
    place: "Basel office",
    people: ["Marta"],
    emotions: ["panic", "relief"],
    details: ["cold coffee", "30-second timeout"],
    quotes: ["Did you check the proxy?"],
    lesson: "Ask for help in the first hour, not the last.",
  },
  photo: { caption: "Two people at a laptop in an empty office.", userNote: "" },
  voiceBlock: "No emojis. No hashtags. Avg 230 words.",
  examples: ["My own example post about a train ride."],
  stats: stats(),
  ...over,
});

describe("prompts", () => {
  it("names languages", () => {
    expect(languageName("de")).toBe("German");
    expect(languageName("pt-BR")).toBe("Portuguese");
    expect(languageName("xx")).toBe("xx");
  });

  it("puts facts first and numbered rules last in the draft prompt", () => {
    const p = draftPrompt(ctx(), { hook: "7:40, Basel office.", hookType: "scene", structureId: "scene-lesson", takeaway: "Ask early.", whyItWorks: "" }, "scene-lesson");
    expect(p.system).toContain("Ana Ruiz");
    const u = p.user;
    expect(u.indexOf("THE STORY")).toBeLessThan(u.indexOf("RULES"));
    expect(u.indexOf("EXAMPLES OF POSTS I WROTE")).toBeLessThan(u.indexOf("RULES"));
    expect(u.trim().endsWith("Output only the post text.")).toBe(true);
    expect(u).toContain('"Did you check the proxy?"');
    expect(u).toContain("Hook idea");
    expect(u).toContain("No emojis.");
    expect(u).toContain("Do not use em dashes");
    expect(u).toContain("Write in English.");
    expect(u).not.toMatch(/json/i);
  });

  it("adapts rules to the voice baseline", () => {
    const rules = writingRules(ctx({ stats: stats({ emojiPerPost: 2, hashtagsPerPost: 3, emDashPerPost: 1 }) }), getStructure("result-lessons"));
    const all = rules.join("\n");
    expect(all).toContain("at most 2 emoji");
    expect(all).toContain("At most 3 hashtags");
    expect(all).toContain("Use dashes sparingly");
    expect(all).toContain("numbered list");
  });

  it("targets the user's usual length when there are enough samples", () => {
    expect(targetWords(ctx(), getStructure("scene-lesson")!)).toEqual([188, 282]);
    expect(targetWords(ctx({ stats: null }), getStructure("photo-micro")!)).toEqual([100, 170]);
  });

  it("works without voice samples or a memory", () => {
    const p = revisePrompt(ctx({ memory: null, examples: [], voiceBlock: "" }), "My draft.", ["Shorter."]);
    expect(p.user).toContain("No story card is linked");
    expect(p.user).toContain("No samples of my writing yet");
    expect(p.user).toContain("1. Shorter.");
    expect(p.user).not.toContain("EXAMPLES OF POSTS");
  });

  it("lists every structure and the recommended fits in the angles prompt", () => {
    const p = anglesPrompt(ctx(), ["mistake-fix", "scene-lesson"]);
    for (const s of STRUCTURES) expect(p.user).toContain(s.id);
    expect(p.user).toContain("Good fits for this story: mistake-fix, scene-lesson.");
    expect(p.user).toContain("CIOs of mid-size banks");
  });

  it("feeds automatic findings into the critique", () => {
    const p = critiquePrompt(ctx(), "Draft text", [
      { rule: "em-dash", severity: "error", message: "Em dashes read as AI." },
      { rule: "double-space", severity: "info", message: "Double space." },
    ]);
    expect(p.user).toContain("- Em dashes read as AI.");
    expect(p.user).not.toContain("Double space.");
    expect(p.user).toContain("Invented:");
  });

  it("collects facts for the provenance check", () => {
    const f = factsText(ctx());
    expect(f).toContain("18 hackathon wins");
    expect(f).toContain("30-second timeout");
    expect(f).toContain("Two people at a laptop");
  });

  it("turns lint and critique into concrete instructions", () => {
    const out = instructionsFromLint([
      { rule: "ai-phrase", severity: "error", message: "", match: "delve" },
      { rule: "filler-phrase", severity: "warn", message: "", match: "leverage" },
      { rule: "em-dash", severity: "error", message: "" },
      { rule: "unverified-number", severity: "warn", message: "", match: "312" },
      { rule: "double-space", severity: "info", message: "" },
    ]);
    expect(out[0]).toBe('Replace these with plain words, or cut them: "delve", "leverage".');
    expect(out).toContain("Remove every em dash and en dash. Use a period or a comma instead.");
    expect(out.some((s) => s.includes('"312"'))).toBe(true);
    expect(out).toHaveLength(3);
    expect(instructionsFromCritique(crit(5, { issues: ['Invented: "312 customers"', "Weak hook"], suggestions: ["Open on the timeout."] }))).toEqual(['Remove this invented detail: "312 customers"', "Open on the timeout."]);
  });

  it("fills the CTA preset from the strategy and refuses without one", () => {
    expect(presetInstruction("cta", strategy)).toContain("the AI rollout sprint");
    expect(presetInstruction("cta", { ...strategy, cta: "" })).toBeNull();
    expect(presetInstruction("shorter", null)).toContain("two thirds");
  });
});

/* ------------------------------------------------------------------ */

describe("diff", () => {
  it("diffs words and measures change", () => {
    const parts = diffWords("I waited for the train", "I waited for the bus");
    expect(parts.filter((p) => p.type === "del").map((p) => p.text.trim())).toEqual(["train"]);
    expect(parts.filter((p) => p.type === "add").map((p) => p.text.trim())).toEqual(["bus"]);
    expect(changeRatio(parts)).toBeCloseTo(2 / 6, 5);
    expect(changeRatio(diffWords("same", "same"))).toBe(0);
  });
});

/* ------------------------------------------------------------------ */

describe("schedule", () => {
  it("suggests open cadence slots a day apart", () => {
    const now = new Date(2026, 9, 10, 12, 0); // Saturday 10 Oct 2026, local time
    const slots = nextOpenSlots({ days: [2, 3, 4], time: "08:30" }, [new Date(2026, 9, 13, 9, 0).toISOString()], now, 3);
    expect(slots.map((d) => [d.getDate(), d.getHours(), d.getMinutes()])).toEqual([
      [14, 8, 30],
      [15, 8, 30],
      [20, 8, 30],
    ]);
  });

  it("falls back to a default cadence", () => {
    expect(nextOpenSlots(null, [], new Date(2026, 9, 10, 12, 0), 1)[0].getDay()).toBe(2);
  });

  it("round-trips datetime-local values", () => {
    const d = new Date(2026, 9, 14, 8, 30);
    expect(toLocalInput(d)).toBe("2026-10-14T08:30");
    expect(fromLocalInput("2026-10-14T08:30")).toBe(d.toISOString());
    expect(fromLocalInput("garbage")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe("status", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("validates transitions", () => {
    expect(checkStatusChange({ from: "draft", to: "approved", body: "", scheduledAt: null }).ok).toBe(false);
    expect(checkStatusChange({ from: "draft", to: "approved", body: "x".repeat(3001), scheduledAt: null }).ok).toBe(false);
    expect(checkStatusChange({ from: "approved", to: "scheduled", body: "Text", scheduledAt: null }).ok).toBe(false);
    expect(checkStatusChange({ from: "approved", to: "scheduled", body: "Text", scheduledAt: "2026-10-09T12:00:00Z", now }).ok).toBe(false);
    expect(checkStatusChange({ from: "approved", to: "scheduled", body: "Text", scheduledAt: "2026-10-12T08:30:00Z", now }).ok).toBe(true);
    expect(checkStatusChange({ from: "published", to: "draft", body: "Text", scheduledAt: null }).ok).toBe(false);
    expect(checkStatusChange({ from: "published", to: "archived", body: "Text", scheduledAt: null }).ok).toBe(true);
    expect(checkStatusChange({ from: "review", to: "draft", body: "", scheduledAt: null }).ok).toBe(true);
  });

  it("moves status along after generation and edits", () => {
    expect(statusAfterGeneration("idea")).toBe("draft");
    expect(statusAfterGeneration("scheduled")).toBe("review");
    expect(statusAfterGeneration("review")).toBe("review");
    expect(statusAfterHumanEdit("idea", "text")).toBe("draft");
    expect(statusAfterHumanEdit("idea", "  ")).toBe("idea");
    expect(statusAfterHumanEdit("approved", "text")).toBe("approved");
  });
});

describe("pillars", () => {
  it("finds pillars by id or name", () => {
    expect(findPillar(strategy, "p1")?.name).toBe("Field notes");
    expect(findPillar(strategy, " field NOTES ")?.id).toBe("p1");
    expect(findPillar(strategy, "nope")).toBeNull();
    expect(findPillar(null, "p1")).toBeNull();
  });
});
