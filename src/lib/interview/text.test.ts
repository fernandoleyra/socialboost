import { describe, expect, it } from "vitest";
import {
  cleanReply,
  detectStorySignals,
  filterTurn,
  isFiller,
  takeSentences,
  isAcknowledgement,
  isDoneSignal,
  isGenericAnswer,
  isSkipAnswer,
  isSubstantive,
  keepVerbatimQuotes,
  parseDbDate,
  truncate,
  formatDay,
} from "./text";

async function collect(pieces: string[], opts: Parameters<typeof filterTurn>[1]) {
  async function* gen() {
    for (const p of pieces) yield p;
  }
  let out = "";
  let stopped = false;
  for await (const p of filterTurn(gen(), opts, () => (stopped = true))) out += p;
  return { out, stopped };
}

const Q = { mode: "question" as const, maxStatements: 1, maxChars: 400 };

describe("answer classification", () => {
  it("detects done signals only in short messages", () => {
    expect(isDoneSignal("That's it")).toBe(true);
    expect(isDoneSignal("I think that's all.")).toBe(true);
    expect(isDoneSignal("Let's wrap up")).toBe(true);
    expect(isDoneSignal("eso es todo")).toBe(true);
    expect(isDoneSignal("That's it, the client walked out and we never heard from them again after that awful meeting")).toBe(false);
    expect(isDoneSignal("We were done by noon")).toBe(false);
    expect(isDoneSignal("That's it for now, thanks!")).toBe(true);
    expect(isDoneSignal("I'm done")).toBe(true);
    expect(isDoneSignal("Let's stop here")).toBe(true);
    // Real answers that only start like a done phrase keep the interview going.
    expect(isDoneSignal("No more than ten people")).toBe(false);
    expect(isDoneSignal("I'm good at reading the room")).toBe(false);
    expect(isDoneSignal("Not really, it was just me")).toBe(false);
    expect(isDoneSignal("Nope, nobody else was there")).toBe(false);
    expect(isDoneSignal("I want to stop hiring juniors")).toBe(false);
    expect(isDoneSignal("That's all I needed to hear, he said")).toBe(false);
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
    expect(isSkipAnswer("Nope.")).toBe(true);
    expect(isSkipAnswer("not really")).toBe(true);
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

describe("cleanReply", () => {
  it("strips labels, markdown and wrapping quotes", () => {
    expect(cleanReply('Interviewer: "**Your biggest client**, gone. Where were you?"')).toBe("Your biggest client, gone. Where were you?");
  });
  it("caps length at a sentence boundary", () => {
    const out = cleanReply("One sentence here. ".repeat(40), 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith(".")).toBe(true);
  });
});

describe("takeSentences", () => {
  it("splits complete sentences and keeps the unfinished tail", () => {
    expect(takeSentences("Ouch. Where were you? And who", 0, false)).toEqual({ sentences: ["Ouch.", "Where were you?"], end: 21 });
    expect(takeSentences("It cost 3.5 million. Then", 0, true).sentences).toEqual(["It cost 3.5 million.", "Then"]);
    expect(takeSentences('She said "no." Then left.\nNext', 0, true).sentences).toEqual(['She said "no."', "Then left.", "Next"]);
  });
});

describe("filterTurn", () => {
  it("keeps one reaction and exactly one question, and stops the model", async () => {
    const { out, stopped } = await collect(["Assistant: A 40-minute silence. ", "Ouch, that must have hurt. What did you say ", "first? And what did ", "they say?"], Q);
    expect(out).toBe("A 40-minute silence. What did you say first?");
    expect(stopped).toBe(true);
  });

  it("drops filler praise and preambles", async () => {
    const { out } = await collect(["Sure! Here's my question: ", "Great! ", "**When** did it happen", "? Tell me more."], Q);
    expect(out).toBe("When did it happen?");
    expect(isFiller("That's a powerful moment.")).toBe(true);
    expect(isFiller("Flour everywhere, ovens running.")).toBe(false);
  });

  it("replaces an off-target question with the fallback probe", async () => {
    const opts = { ...Q, accept: (q: string) => /\b(who|said)\b/i.test(q), fallbackQuestion: "Who else was there?" };
    expect((await collect(["Valencia at night, wow. How did the export go?"], opts)).out).toBe("Valencia at night, wow. Who else was there?");
    expect((await collect(["Valencia at night. Who said that?"], opts)).out).toBe("Valencia at night. Who said that?");
  });

  it("asks the fallback when the model forgets to ask", async () => {
    const { out } = await collect(["That sounds like a long night for everyone involved there."], { ...Q, fallbackQuestion: "What happened next?" });
    expect(out).toBe("That sounds like a long night for everyone involved there. What happened next?");
  });

  it("statement mode never asks and stops after the allowed sentences", async () => {
    const opts = { mode: "statement" as const, maxStatements: 1, maxChars: 300 };
    expect((await collect(["The midnight call to Luis, with your hands shaking. Did you sleep at all?"], opts)).out).toBe("The midnight call to Luis, with your hands shaking.");
    expect((await collect(["Thanks for sharing! What a story?"], opts)).out).toBe("");
  });

  it("free mode only cleans up", async () => {
    const { out } = await collect(["Interviewer: Gracias. ", "¿Tienes una foto?"], { mode: "free", maxStatements: 0, maxChars: 400 });
    expect(out).toBe("Gracias. ¿Tienes una foto?");
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

describe("formatDay", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("is relative in the given time zone", () => {
    expect(formatDay("2026-10-10 08:00:00", "Europe/Zurich", { now })).toBe("Today");
    expect(formatDay("2026-10-09T22:30:00Z", "Europe/Zurich", { now })).toBe("Today");
    expect(formatDay("2026-10-09 08:00:00", "UTC", { now })).toBe("Yesterday");
    expect(formatDay("2026-10-06 08:00:00", "UTC", { now })).toBe("Tue, Oct 6");
    expect(formatDay("2025-10-06 08:00:00", "UTC", { now })).toBe("Mon, Oct 6, 2025");
  });
  it("can skip relative labels and survives bad zones", () => {
    expect(formatDay("2026-10-10 08:00:00", "UTC", { now, relative: false })).toBe("Sat, Oct 10");
    expect(formatDay("2026-10-10 08:00:00", "Not/AZone", { now, relative: false })).toBe("Sat, Oct 10");
    expect(formatDay(null, "UTC")).toBe("");
  });
});

describe("isFiller", () => {
  it("catches praise but keeps real reactions", () => {
    expect(isFiller("That's a great lesson learned.")).toBe(true);
    expect(isFiller("Great to hear.")).toBe(true);
    expect(isFiller("What an amazing story!")).toBe(true);
    expect(isFiller("That's a long night to be on the phone with a client.")).toBe(false);
    expect(isFiller("A tray of croissants next to the laptop.")).toBe(false);
  });
});
