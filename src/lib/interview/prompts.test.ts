import { describe, expect, it } from "vitest";
import type { Decision } from "./engine";
import { directorNote, interviewerMessages, interviewerSystemPrompt, pillarsPrompt, positioningPrompt, storyCardPrompt, type InterviewContext } from "./prompts";
import type { TranscriptMessage } from "./types";

const ctx: InterviewContext = {
  kind: "story",
  name: "Marta Ruiz",
  headline: "Fractional CFO",
  language: "en",
  positioning: "I help family businesses see their real cash position.",
  audience: "Second-generation owners",
  goals: ["Inbound clients", "Speaking"],
  pillar: { name: "Cash flow", description: "Seeing the real numbers." },
  savedTitles: ["Payroll export failed before Christmas"],
  avoidTopics: ["Politics"],
  seed: "When did a client misread their cash?",
  earlierThreads: [],
};

const probe: Decision = { stage: "probe", target: "scene", probe: { id: "F02", text: "When was this, and where were you?" }, firstMessage: false, covered: [], missing: ["scene"] };

const thread: TranscriptMessage[] = [
  { id: "a1", role: "assistant", content: "Hi Marta. When did a client misread their cash?", photoIds: [] },
  { id: "u1", role: "user", content: "A bakery owner thought he had 200k in the bank.", photoIds: [] },
];

describe("interviewer prompt", () => {
  it("puts the strategy context (readers, goals, saved stories, avoid list) in the system prompt", () => {
    const sys = interviewerSystemPrompt(ctx);
    expect(sys).toContain("Second-generation owners");
    expect(sys).toContain("Inbound clients");
    expect(sys).toContain("Payroll export failed before Christmas");
    expect(sys).toContain("Politics");
    expect(sys).toMatch(/You never write the post/);
  });

  it("ends with the director's note as a system turn by default", () => {
    const msgs = interviewerMessages(ctx, thread, probe);
    expect(msgs[0]).toEqual({ role: "user", content: "Hi, I'm ready." });
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe("system");
    expect(last.content).toContain("Director's note");
    expect(last.content).toContain("When was this, and where were you?");
  });

  it("forbids praise and asks only for a neutral echo", () => {
    for (const kind of ["story", "positioning"] as const) {
      const sys = interviewerSystemPrompt({ ...ctx, kind });
      expect(sys).toMatch(/Never judge or praise/);
      expect(sys).toMatch(/repeated neutrally/);
    }
    expect(interviewerSystemPrompt({ ...ctx, kind: "positioning" })).not.toMatch(/got it/i);
    for (const stage of ["probe", "pos-question", "photo", "pos-wrap"] as const) {
      const note = directorNote(ctx, { ...probe, stage });
      expect(note, stage).not.toMatch(/reacting/);
      expect(note, stage).toMatch(/repeated neutrally|no praise/);
    }
  });

  it("folds the note into the last user turn for servers that reject a late system message", () => {
    const msgs = interviewerMessages(ctx, thread, probe, "protocol", { noteInUserTurn: true });
    expect(msgs.some((m) => m.role === "system")).toBe(false);
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe("user");
    expect(last.content.startsWith("A bakery owner thought he had 200k in the bank.")).toBe(true);
    expect(last.content).toContain("not from Marta");
    // Roles still alternate user / assistant.
    msgs.forEach((m, i) => expect(m.role).toBe(i % 2 === 0 ? "user" : "assistant"));
  });
});

describe("extraction prompts", () => {
  it("story card: never pads a thin story", () => {
    const { user } = storyCardPrompt({ name: "Marta Ruiz", headline: "", language: "en", pillars: [], transcript: "Marta: short", privacy: null });
    expect(user).toMatch(/Use ONLY facts Marta said/);
    expect(user).toMatch(/If they said little, keep it short/);
    expect(user).not.toMatch(/100 to 300 words/);
  });

  it("story card: figures exactly as said, no added currency", () => {
    const { user } = storyCardPrompt({ name: "Marta Ruiz", headline: "", language: "en", pillars: [], transcript: "Marta: 40k budget", privacy: null });
    expect(user).toMatch(/Numbers and amounts exactly as Marta wrote them/);
    expect(user).toMatch(/Never add or convert a currency/);
  });

  it("positioning: the interviewer's examples are not answers", () => {
    const { user } = positioningPrompt({ name: "Marta Ruiz", headline: "", language: "en", transcript: "t" });
    expect(user).toMatch(/Examples listed inside the interviewer's questions are not answers/);
    expect(user).toMatch(/avoidTopics: only topics Marta said, in their own words/);
    expect(user).not.toMatch(/politics|money/i);
  });

  it("pillars: grounded in what was said, with moment-based story prompts", () => {
    const { user } = pillarsPrompt({ name: "Marta Ruiz", language: "es", summary: "Expertise: cash flow" });
    expect(user).toMatch(/what Marta actually said/);
    expect(user).toMatch(/ONE specific past moment/);
    expect(user).toMatch(/Write in Spanish/);
  });
});
