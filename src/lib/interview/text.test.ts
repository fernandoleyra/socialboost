import { describe, expect, it } from "vitest";
import {
  cleanReply,
  detectStorySignals,
  filterReply,
  isAcknowledgement,
  isDoneSignal,
  isGenericAnswer,
  isSkipAnswer,
  isSubstantive,
  keepVerbatimQuotes,
  parseDbDate,
  truncate,
} from "./text";

async function collect(pieces: string[], opts = { singleQuestion: true, maxChars: 400 }) {
  async function* gen() {
    for (const p of pieces) yield p;
  }
  let out = "";
  let stopped = false;
  for await (const p of filterReply(gen(), opts, () => (stopped = true))) out += p;
  return { out, stopped };
}

describe("answer classification", () => {
  it("detects done signals only in short messages", () => {
    expect(isDoneSignal("That's it")).toBe(true);
    expect(isDoneSignal("I think that's all.")).toBe(true);
    expect(isDoneSignal("Let's wrap up")).toBe(true);
    expect(isDoneSignal("eso es todo")).toBe(true);
    expect(isDoneSignal("That's it, the client walked out and we never heard from them again after that awful meeting")).toBe(false);
    expect(isDoneSignal("We were done by noon")).toBe(false);
  });

  it("detects acknowledgements", () => {
    expect(isAcknowledgement("ok thanks!")).toBe(true);
    expect(isAcknowledgement("Great")).toBe(true);
    expect(isAcknowledgement("ok so another one: my first hire quit after a week")).toBe(false);
  });

  it("detects skip answers", () => {
    expect(isSkipAnswer("I don't remember")).toBe(true);
    expect(isSkipAnswer("no idea")).toBe(true);
    expect(isSkipAnswer("")).toBe(true);
    expect(isSkipAnswer("I don't remember the date but it was raining and the office was empty, around 7pm")).toBe(false);
    expect(isSubstantive("It was in March at our office")).toBe(true);
    expect(isSubstantive("yes")).toBe(false);
  });

  it("flags generic answers but not specific ones", () => {
    expect(isGenericAnswer("Usually clients don't read the contract and then complain about the invoice")).toBe(true);
    expect(isGenericAnswer("Last week a client told me she never read the contract")).toBe(false);
    expect(isGenericAnswer("We always lose about 20% of deals in procurement")).toBe(false);
    expect(isGenericAnswer("Always")).toBe(false);
  });
});

describe("detectStorySignals", () => {
  it("finds scene, people, details, feelings and lesson", () => {
    const s = detectStorySignals(
      'Last March, in the meeting room at our Basel office, the CFO said "we are cutting the budget by 40%". I felt sick. Since then I always bring the numbers myself.',
    );
    expect(s.scene).toBe(true);
    expect(s.people).toBe(true);
    expect(s.details).toBe(true);
    expect(s.feelings).toBe(true);
    expect(s.lesson).toBe(true);
  });

  it("does not over-detect on a thin answer", () => {
    const s = detectStorySignals("It went fine.");
    expect(Object.values(s).some(Boolean)).toBe(false);
  });

  it("needs both time and place for a scene", () => {
    expect(detectStorySignals("It happened last week.").scene).toBe(false);
    expect(detectStorySignals("It happened last week at the airport.").scene).toBe(true);
  });
});

describe("keepVerbatimQuotes", () => {
  const user = ["Honestly? I told him: “If you can't explain it to the board, it doesn't exist.” Then I left the room."];

  it("keeps quotes that appear verbatim and restores the user's exact words", () => {
    const kept = keepVerbatimQuotes(["If you can't explain it to the board, it doesn't exist."], user);
    expect(kept).toEqual(["If you can't explain it to the board, it doesn't exist."]);
  });

  it("tolerates case, punctuation and curly quotes", () => {
    expect(keepVerbatimQuotes(["if you can’t explain it to the board it doesn’t exist"], user)).toHaveLength(1);
  });

  it("drops invented or paraphrased quotes", () => {
    expect(keepVerbatimQuotes(["Clarity is the currency of leadership."], user)).toEqual([]);
    expect(keepVerbatimQuotes(["If you cannot explain your idea to the board then it simply does not exist at all."], user)).toEqual([]);
  });

  it("drops too-short quotes and duplicates", () => {
    expect(keepVerbatimQuotes(["Honestly", "Then I left the room.", "then i left the room"], user)).toEqual(["Then I left the room."]);
  });
});

describe("reply cleaning", () => {
  it("strips labels, markdown and wrapping quotes; keeps one question", () => {
    expect(cleanReply('Interviewer: "**Your biggest client**, gone. Where were you? And who told you?"', { singleQuestion: true, maxChars: 400 })).toBe(
      "Your biggest client, gone. Where were you?",
    );
  });

  it("keeps multi-sentence wraps when not single-question", () => {
    const t = "Thanks, that's a great one to keep. Tap Finish & save, or tell me about another moment.";
    expect(cleanReply(t, { singleQuestion: false, maxChars: 400 })).toBe(t);
  });

  it("caps length at a sentence boundary", () => {
    const t = "One sentence here. ".repeat(40);
    const out = cleanReply(t, { singleQuestion: false, maxChars: 100 });
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith(".")).toBe(true);
  });

  it("streams only the first question and reports the early stop", async () => {
    const { out, stopped } = await collect(["Assistant: ", "A 40-minute silence. ", "Ouch. What did you say ", "first? And what did ", "they say?"]);
    expect(out).toBe("A 40-minute silence. Ouch. What did you say first?");
    expect(stopped).toBe(true);
  });

  it("emits short replies that end before the hold-back window", async () => {
    const { out } = await collect(["Where were you?"]);
    expect(out).toBe("Where were you?");
  });

  it("stream output equals the final cleanup", async () => {
    const pieces = ["Sure! Here's my question: ", "**When** did ", "it happen", "?"];
    const { out } = await collect(pieces);
    expect(out).toBe(cleanReply(pieces.join(""), { singleQuestion: true, maxChars: 400 }));
    expect(out).toBe("When did it happen?");
  });
});

describe("misc", () => {
  it("parses SQLite and ISO dates as UTC", () => {
    expect(parseDbDate("2026-10-10 08:30:00")?.toISOString()).toBe("2026-10-10T08:30:00.000Z");
    expect(parseDbDate("2026-10-10T08:30:00.000Z")?.toISOString()).toBe("2026-10-10T08:30:00.000Z");
    expect(parseDbDate("nope")).toBeNull();
    expect(parseDbDate(null)).toBeNull();
  });

  it("truncates on whitespace-normalized text", () => {
    expect(truncate("a  b\n c", 10)).toBe("a b c");
    expect(truncate("abcdefghijkl", 5)).toBe("abcd…");
  });
});
