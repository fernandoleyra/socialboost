import { describe, expect, it } from "vitest";
import type { VoiceStats } from "@/lib/types";
import { LEXICON, compiledLexicon } from "./lexicon";
import { autofix, extractNeverSay, extractNumbers, lintPost, scoreFromLint } from "./lint";

const rules = (text: string, stats?: VoiceStats | null, opts?: Parameters<typeof lintPost>[2]) => lintPost(text, stats, opts).issues.map((i) => i.rule);

const stats = (over: Partial<VoiceStats> = {}): VoiceStats => ({
  sampleCount: 12,
  avgWords: 230,
  medianWords: 235,
  avgSentenceWords: 14,
  avgParagraphLines: 1.6,
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

/** A clean, human post: concrete, varied rhythm, ~700 chars, ends on a specific question. */
const HUMAN = `At 7:40 on a Tuesday the Basel office was empty except for me and a cold coffee.

I had promised the client a working prototype by nine. It was not working. The export kept timing out after 30 seconds, and I had no idea why.

So I called Marta, our most junior engineer, who had joined three weeks earlier. She listened for a minute and asked if I had checked the proxy. I hadn't.

It took her four minutes to fix. The demo went fine, and the client signed the next phase that afternoon.

I used to think asking for help early made me look unprepared. Now I ask in the first hour, not the last.

When did someone junior save your morning?`;

describe("lexicon", () => {
  it("has 126 entries with unique ids", () => {
    expect(LEXICON.length).toBe(126);
    expect(new Set(LEXICON.map((e) => e.id)).size).toBe(126);
    expect(LEXICON.filter((e) => e.tier === "A").length).toBe(86);
    expect(LEXICON.filter((e) => e.tier === "B").length).toBe(40);
  });

  it("compiles every pattern", () => {
    expect(() => compiledLexicon()).not.toThrow();
  });

  it("matches whole words only, case-insensitively, with curly apostrophes", () => {
    expect(rules("We will Delve into it.")).toContain("ai-phrase");
    expect(rules("The delver went home.")).not.toContain("ai-phrase");
    expect(rules("Here’s the thing about coffee.")).toContain("ai-phrase");
  });

  it("treats literal journeys as fine and figurative ones as filler", () => {
    expect(rules("The train journey took 16 hours.")).not.toContain("filler-phrase");
    expect(rules("My leadership journey started in 2019.")).toContain("filler-phrase");
  });
});

describe("lintPost", () => {
  it("returns a perfect score for empty text", () => {
    expect(lintPost("   ")).toEqual({ issues: [], score: 100 });
  });

  it("scores a clean, human post highly", () => {
    const r = lintPost(HUMAN, stats());
    expect(r.issues.filter((i) => i.severity !== "info")).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(95);
  });

  it("flags tier A phrases as errors and tier B as warnings", () => {
    const r = lintPost("In today's fast-paced world, we must leverage data.");
    const a = r.issues.find((i) => i.rule === "ai-phrase");
    const b = r.issues.find((i) => i.rule === "filler-phrase");
    expect(a?.severity).toBe("error");
    expect(a?.match?.toLowerCase()).toContain("in today");
    expect(b?.severity).toBe("warn");
    expect(b?.match).toBe("leverage");
  });

  it("reports nested lexicon hits once", () => {
    const r = lintPost("It was a pivotal moment for the team.");
    const hits = r.issues.filter((i) => i.rule === "ai-phrase");
    expect(hits).toHaveLength(1);
    expect(hits[0].match).toBe("a pivotal moment");
  });

  it("gives positions that point at the match", () => {
    const text = "Coffee first. Then we embark on the hard part.";
    const hit = lintPost(text).issues.find((i) => i.rule === "ai-phrase")!;
    expect(text.slice(hit.start, hit.end)).toBe("embark");
  });

  it("skips phrases that are the user's own", () => {
    expect(rules("Here's the thing about hiring.", stats({ signaturePhrases: ["here's the thing"] }))).not.toContain("ai-phrase");
  });

  it("flags em dashes against the voice baseline", () => {
    expect(rules("I waited — nothing happened.")).toContain("em-dash");
    const three = "One — two — three — four.";
    expect(lintPost(three).issues.filter((i) => i.rule === "em-dash").every((i) => i.severity === "error")).toBe(true);
    // A writer who really uses dashes gets their rate.
    expect(rules("I waited — nothing happened.", stats({ emDashPerPost: 2 }))).not.toContain("em-dash");
    // Number ranges are not dashes-as-connectors.
    expect(rules("Between 2019–2021 we grew.")).not.toContain("em-dash");
  });

  it("flags negative parallelism", () => {
    expect(rules("It's not about the money, it's about respect.")).toContain("negative-parallelism");
    expect(rules("This isn't a tool. It's a mindset.")).toContain("negative-parallelism");
    expect(rules("We needed not just speed but focus.")).toContain("negative-parallelism");
    expect(rules("No meetings, no slides, just work.")).toContain("negative-parallelism");
  });

  it("flags repeated triads and slogan triplets", () => {
    expect(rules("It was fast, cheap, and simple. The team was kind, sharp, and calm.")).toContain("triplet");
    expect(rules("We shipped it. Fast. Simple. Effective.")).toContain("triplet");
    expect(rules("My wife, my son and I drove to Bern on Friday.")).not.toContain("triplet");
  });

  it("flags one-line staircases but not numbered lists", () => {
    const stair = ["I failed.", "Then I failed again.", "Then I learned.", "Now I win.", "Every day.", "No excuses."].join("\n\n");
    expect(rules(stair)).toContain("staircase");
    const list = "Four things I learned:\n\n1. Ask early.\n2. Ship small.\n3. Write it down.\n4. Sleep.";
    expect(rules(list)).not.toContain("staircase");
    expect(rules(stair, stats({ oneLineParagraphRatio: 0.85 }))).not.toContain("staircase");
  });

  it("flags emoji bullets and emoji counts above the baseline", () => {
    expect(rules("✅ Ship fast\n✅ Learn faster")).toContain("emoji-bullet");
    expect(rules("Great day 🎉", stats({ emojiPerPost: 0 }))).toContain("emoji");
    expect(rules("Great day 🎉")).not.toContain("emoji");
    expect(rules("Great day 🎉🚀")).toContain("emoji");
  });

  it("flags hashtags above the limit and inline hashtags", () => {
    expect(rules("Post.\n\n#a #b #c #d")).toContain("hashtags");
    expect(rules("Post.\n\n#a #b")).not.toContain("hashtags");
    expect(rules("Post.\n\n#ai", stats({ hashtagsPerPost: 0 }))).toContain("hashtags");
    const inline = lintPost("We use #ai every day.\n\nThat's it.").issues.find((i) => i.rule === "hashtags");
    expect(inline?.severity).toBe("info");
    expect(rules("We wrote it in C# and F#.")).not.toContain("hashtags");
  });

  it("checks the hook: length, question, stock openers", () => {
    expect(rules("x".repeat(220) + "\n\nBody.")).toContain("hook-length");
    expect(rules("Have you ever failed a demo?\n\nI have.")).toEqual(expect.arrayContaining(["question-hook", "cliche-opener"]));
    expect(rules('"Why does every forecast miss by 30%?" a CFO asked me.\n\nHere is why.')).not.toContain("question-hook");
  });

  it("checks length bounds", () => {
    const short = lintPost("Short post.").issues.find((i) => i.rule === "length");
    expect(short?.severity).toBe("warn");
    const long = lintPost("word ".repeat(700)).issues.find((i) => i.rule === "length");
    expect(long?.severity).toBe("error");
  });

  it("flags links, exclamations, unicode bold, markdown, double spaces", () => {
    expect(rules("Read more at https://example.com/x")).toContain("link");
    expect(rules("Wow! Great! Amazing! Yes!")).toContain("exclamation");
    expect(rules("This is 𝗯𝗼𝗹𝗱 text.")).toContain("unicode-styling");
    expect(rules("This is **bold** text.")).toContain("markdown");
    expect(rules("Two  spaces.")).toContain("double-space");
  });

  it("flags engagement bait, chatbot residue and generic closers", () => {
    expect(rules("Comment YES and I'll send the guide.")).toContain("engagement-bait");
    expect(rules("♻️ Repost to help your network.")).toContain("engagement-bait");
    expect(rules("Follow me for more.")).toContain("engagement-bait");
    expect(rules("I hope this helps!")).toContain("chatbot");
    const cta = lintPost("A story.\n\nWhat do you think?").issues.find((i) => i.rule === "generic-cta");
    expect(cta?.severity).toBe("info");
    expect(rules("A story.\n\nAgree?")).toContain("generic-cta");
  });

  it("flags -ing riders, vague sources, morals and humblebrags", () => {
    expect(rules("We hit the goal, highlighting the power of focus.")).toContain("ing-rider");
    expect(rules("Studies show that remote teams are faster.")).toContain("vague-attribution");
    expect(rules("A story.\n\nAnd that's what leadership is all about.")).toContain("generic-moral");
    expect(rules("I'm thrilled to announce my new role.")).toContain("humblebrag");
  });

  it("flags repeated sentence openers", () => {
    expect(rules("We tried. We failed. We tried again and it worked this time.")).toContain("repeated-openers");
    const iRun = lintPost("I ran. I fell. I got up and kept running for an hour.").issues.find((i) => i.rule === "repeated-openers");
    expect(iRun?.severity).toBe("info");
  });

  it("enforces the never-say list", () => {
    const r = lintPost("Our synergy is great, folks.", null, { neverSay: ["folks"] });
    expect(r.issues.some((i) => i.rule === "never-say" && i.match === "folks")).toBe(true);
  });

  it("flags numbers and quotes that aren't in the story", () => {
    const facts = "We refunded 84,000 euros in one afternoon. Marta said: we should call every customer today. It was 2019.";
    const draft = 'We refunded €84k in 2019 to 312 customers.\n\nMarta said "we should call every customer today".\n\nThen my boss said "this is the best day of my career".';
    const issues = lintPost(draft, null, { facts }).issues;
    const nums = issues.filter((i) => i.rule === "unverified-number").map((i) => i.match);
    expect(nums).toEqual(["312"]);
    const quotes = issues.filter((i) => i.rule === "unverified-quote");
    expect(quotes).toHaveLength(1);
    expect(quotes[0].match).toContain("best day");
  });

  it("does not treat list markers or small counts as invented numbers", () => {
    const issues = lintPost("Three things:\n\n1. Ask early.\n2. Ship small.\n3. Write it down.\n\nI learned 3 of them late.", null, { facts: "nothing numeric" }).issues;
    expect(issues.filter((i) => i.rule === "unverified-number")).toEqual([]);
  });

  it("accepts number words from the story", () => {
    const issues = lintPost("It took 16 hours and 40 people.", null, { facts: "sixteen hours, forty people" }).issues;
    expect(issues.filter((i) => i.rule === "unverified-number")).toEqual([]);
  });

  it("flags the figures a 4B writer changed in a real run", () => {
    const facts = "Turning down a 40k rebrand\nLast March a founder asked us for a full rebrand. 40k budget. We found that 60% of revenue came from 4 products. Sales went up 23% in two months. We were turning down 40k of work.";
    const draft = `I felt scared, honestly, because we were turning down forty thousand dollars of work.

We found out sixty percent of revenue came from just four products. Sales went up twenty-three percent in two months.

Should we spend $40k on a new logo or fix what sells?`;
    const issues = lintPost(draft, null, { facts }).issues;
    const byRule = (rule: string) => issues.filter((i) => i.rule === rule).map((i) => [i.match, (i as { suggest?: string }).suggest]);
    expect(byRule("invented-currency")).toEqual([
      ["dollars", "40k"],
      ["$", "40k"],
    ]);
    expect(issues.find((i) => i.rule === "invented-currency")!.severity).toBe("error");
    expect(byRule("number-words")).toEqual([
      ["forty thousand", "40k"],
      ["sixty percent", "60%"],
      ["four", "4"],
      ["twenty-three percent", "23%"],
    ]);
    // Spelled out, but real: no "unverified" noise on top of the digits hint.
    expect(byRule("unverified-number")).toEqual([]);
  });

  it("checks spelled-out numbers against the story and accepts currencies it names", () => {
    const issues = lintPost("We refunded €84k to three hundred and twelve customers.", null, { facts: "We refunded 84,000 euros in one afternoon." }).issues;
    expect(issues.filter((i) => i.rule === "unverified-number").map((i) => i.match)).toEqual(["three hundred and twelve"]);
    expect(issues.filter((i) => i.rule === "invented-currency")).toEqual([]);
    const added = lintPost("The sprint costs 18k and the rebrand was 40k euros.", null, { facts: "40k budget. The sprint is around 18k euros." }).issues;
    expect(added.filter((i) => i.rule === "invented-currency").map((i) => [i.match, i.severity])).toEqual([["euros", "warn"]]);
  });

  it("sorts errors first", () => {
    const sev = lintPost("Let's dive in. We will leverage it. Two  spaces.").issues.map((i) => i.severity);
    expect(sev).toEqual([...sev].sort((a, b) => ["error", "warn", "info"].indexOf(a) - ["error", "warn", "info"].indexOf(b)));
  });
});

describe("scoreFromLint", () => {
  it("caps the penalty per rule", () => {
    const many = Array.from({ length: 10 }, () => ({ rule: "ai-phrase", severity: "error" as const }));
    expect(scoreFromLint(many)).toBe(70);
    expect(scoreFromLint([{ rule: "a", severity: "warn" }, { rule: "b", severity: "info" }])).toBe(94);
    expect(scoreFromLint([])).toBe(100);
  });
});

describe("autofix", () => {
  it("replaces em dashes with commas and tidies punctuation", () => {
    expect(autofix("I waited — nothing happened.")).toBe("I waited, nothing happened.");
    expect(autofix("We shipped—finally.")).toBe("We shipped, finally.");
    expect(autofix("2019–2021 was hard.")).toBe("2019–2021 was hard.");
  });

  it("removes double spaces, markdown and unicode bold", () => {
    expect(autofix("A  b **c** 𝗱")).toBe("A b c d");
  });
});

describe("extractNeverSay", () => {
  it("pulls quoted terms from negative rules only", () => {
    expect(extractNeverSay(['Never say "synergy"', "Avoid 'folks' and 'peeps'", 'I like "short posts"'])).toEqual(["synergy", "folks", "peeps"]);
  });

  it("doesn't mistake apostrophes for quote marks", () => {
    expect(extractNeverSay(["Don't say 'folks'", 'I don\'t use "leverage"', "I'd never write 'humbled'", "Don’t write ‘circle back’"])).toEqual(["folks", "leverage", "humbled", "circle back"]);
    expect(extractNeverSay(["Never say 'don't hesitate'"])).toEqual(["don't hesitate"]);
    expect(extractNeverSay(["I don't use emojis"])).toEqual([]);
  });
});

describe("extractNumbers", () => {
  it("normalises separators and suffixes", () => {
    const v = extractNumbers("CHF 2,190 · 8 500 permits · €84k · 30% · 1.5x · 1’000").map((n) => n.value);
    expect(v).toEqual([2190, 8500, 84000, 30, 1.5, 1000]);
  });
});

describe("calibration", () => {
  it("scores typical AI slop far below a human post", () => {
    const slop = `In today's fast-paced world, leadership is not just about managing people — it's about empowering them.

Here's the thing:

Great leaders don't just lead.
They inspire.
They elevate.
They transform.

✅ Communicate with clarity
✅ Lead with empathy
✅ Embrace the journey

Let that sink in.

At the end of the day, it's clear that success is a journey, not a destination.

Agree? ♻️ Repost to help your network.

#leadership #growth #mindset #success #ai`;
    const r = lintPost(slop);
    expect(r.score).toBeLessThan(25);
    expect(lintPost(HUMAN).score - r.score).toBeGreaterThan(70);
  });

  it("does not flag real lists of things or compound names", () => {
    expect(rules("We sold to banks, retail chains and family companies across Europe.")).not.toContain("triplet");
    expect(rules("The Navier–Stokes equations stayed unsolved.")).not.toContain("em-dash");
    expect(rules("Fast, cheap, and simple. Kind, sharp, and calm.")).toContain("triplet");
  });
});

describe("copied notes", () => {
  const notes = "It was a Tuesday in March, 7:40 in the morning, in our Basel office. I had promised the client's COO a working prototype by 8:00. The export kept timing out after 30 seconds and I had no idea why. I had been stuck for an hour, alone with a cold coffee, too proud to ask anyone.";
  it("flags a draft that pastes the notes back", () => {
    const hit = lintPost(notes, null, { notes }).issues.find((i) => i.rule === "copied-notes");
    expect(hit?.severity).toBe("error");
  });
  it("accepts a retelling", () => {
    const retold = "7:40 on a Tuesday, Basel. Nine minutes to a demo and the export keeps dying after 30 seconds.\n\nI had been stuck for an hour with a cold coffee, too proud to ask anyone for help with it.\n\nThen Marta walked in and asked one question that fixed everything in four minutes.";
    expect(lintPost(retold, null, { notes }).issues.map((i) => i.rule)).not.toContain("copied-notes");
  });
});

describe("sentence splitting", () => {
  it("does not treat decimals as sentence ends", () => {
    expect(rules("Revenue grew 2.5x in a year and margins held at 31.4% the whole time.")).not.toContain("triplet");
  });
});
