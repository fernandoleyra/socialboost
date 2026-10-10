import { describe, expect, it } from "vitest";
import type { VoiceGuide } from "@/lib/types";
import { MARA_POSTS } from "./__fixtures__/corpus";
import { analysisBudget, buildAnalysisPrompt, buildVoicePromptBlock, reconcileGuide, sanitizeGuide, statRules } from "./prompts";
import { computeVoiceExtras, computeVoiceStats } from "./stylometry";

const EMPTY_GUIDE: VoiceGuide = { summary: "", tone: [], hookPatterns: [], structure: [], formatting: [], vocabulary: [], signatureMoves: [], neverDoes: [] };
const stats = computeVoiceStats(MARA_POSTS);
const extras = computeVoiceExtras(MARA_POSTS);

describe("buildVoicePromptBlock", () => {
  it("is empty when nothing is known yet", () => {
    expect(buildVoicePromptBlock({ stats: null, guide: EMPTY_GUIDE, manualRules: [], extras: null })).toBe("");
  });

  it("turns measurements into plain rules", () => {
    const block = buildVoicePromptBlock({ stats, guide: EMPTY_GUIDE, manualRules: [], extras });
    expect(block).toMatch(/^Measured from 7 of my real posts:/);
    for (const rule of ["No emojis.", "No hashtags.", "No em dashes", "numbered list of 3-4 items", "end with one short question", '"And one more"']) expect(block).toContain(rule);
    expect(block).not.toContain("My own rules");
  });

  it("adds the style guide and puts manual rules last", () => {
    const guide: VoiceGuide = { ...EMPTY_GUIDE, summary: "Dry, concrete, a little self-deprecating.", tone: ["dry", "direct"], neverDoes: ["Never moralises at the end"] };
    const block = buildVoicePromptBlock({ stats, guide, manualRules: ['Never say "leverage"', "  "], extras });
    const lines = block.split("\n");
    expect(block).toContain("My style:\n- Overall: Dry, concrete, a little self-deprecating.\n- Tone: dry, direct");
    expect(block).toContain("- I never: Never moralises at the end");
    expect(lines.at(-2)).toMatch(/^My own rules/);
    expect(lines.at(-1)).toBe('- Never say "leverage"');
  });

  it("works with only manual rules", () => {
    expect(buildVoicePromptBlock({ stats: null, guide: EMPTY_GUIDE, manualRules: ["No emojis"], extras: null })).toBe(
      "My own rules (always follow these; they override everything above):\n- No emojis",
    );
  });
});

describe("statRules", () => {
  it("describes emoji and hashtag habits when they exist", () => {
    const s = computeVoiceStats(["Big week 🚀 for the team. We shipped it.\n\n#ops #logistics", "Another 🚀 launch day with the crew, two more to go!\n\n#ops"]);
    const rules = statRules(s, computeVoiceExtras(["x"]));
    expect(rules.join("\n")).toMatch(/Emojis: about 1 per post \(🚀\), never as bullets\./);
    expect(rules.join("\n")).toMatch(/Hashtags: about 2, only at the very end\./);
  });
});

describe("sanitizeGuide", () => {
  it("strips list markers, de-duplicates and caps lengths", () => {
    const g = sanitizeGuide({
      ...EMPTY_GUIDE,
      summary: "  Plain   and direct. ",
      tone: ["- dry", "Dry", "1. direct", "", "warm", "calm", "blunt", "curious", "extra"],
      vocabulary: ["x".repeat(300), '"by feel"'],
    });
    expect(g.summary).toBe("Plain and direct.");
    expect(g.tone).toEqual(["dry", "direct", "warm", "calm", "blunt", "curious"]);
    expect(g.vocabulary).toEqual(['"by feel"']);
  });
});

describe("reconcileGuide", () => {
  it("drops 'never' claims the numbers contradict and adds proven absences", () => {
    const emojiStats = { ...stats, emojiPerPost: 1.4 };
    const g = reconcileGuide({ ...EMPTY_GUIDE, neverDoes: ["Never uses emojis", "Never uses emojis as bullets", "Never writes about politics"] }, emojiStats, extras);
    expect(g.neverDoes).not.toContain("Never uses emojis");
    expect(g.neverDoes).toContain("Never uses emojis as bullets");
    expect(g.neverDoes).toContain("Never writes about politics");
    expect(g.neverDoes).toContain("No hashtags.");
    expect(g.neverDoes).toContain("No em dashes.");
    expect(g.neverDoes).toContain("No links in the post.");
    expect(g.neverDoes).not.toContain("No emojis.");
  });

  it("doesn't infer absences from too few posts", () => {
    const few = computeVoiceStats(MARA_POSTS.slice(0, 3));
    expect(reconcileGuide(EMPTY_GUIDE, few, computeVoiceExtras(MARA_POSTS.slice(0, 3))).neverDoes).toEqual([]);
  });
});

describe("buildAnalysisPrompt", () => {
  it("includes the posts, the measured facts and the field list", () => {
    const prompt = buildAnalysisPrompt({ name: "Mara Jensen", posts: MARA_POSTS.slice(0, 2).map((text) => ({ text })), stats, extras });
    expect(prompt).toContain("Below are 2 LinkedIn posts written by Mara Jensen.");
    expect(prompt).toContain("<post 1>");
    expect(prompt).toContain("</post 2>");
    expect(prompt).toContain("MEASURED FACTS (counted by code across 7 posts");
    expect(prompt).toContain("8. neverDoes:");
    expect(prompt).toContain("Most common ending: a question");
  });
});

describe("analysisBudget", () => {
  it("fits local context windows and is generous for hosted models", () => {
    expect(analysisBudget({ providerKind: "ollama", numCtx: 8192 }).budgetChars).toBe(Math.floor((8192 - 2800) * 3.3));
    expect(analysisBudget({ providerKind: "ollama", numCtx: 2048 }).budgetChars).toBe(3500);
    expect(analysisBudget({ providerKind: "anthropic", numCtx: 8192 }).budgetChars).toBe(60_000);
  });
});
