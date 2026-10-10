import { describe, expect, it } from "vitest";
import { firstLineLength, lineSentences, openingTooLong, restoreOpening, splitOpening } from "./opening";

/** The revision from the end-to-end run (figures already aligned): hook and second paragraph glued into one line. */
const COLLAPSED = `Last March in Valencia, it smelled like bread and flour was on the table. I sat across from Marta and her head of operations in their back office above the shop. She told me she didn't hire me to look at spreadsheets. I felt scared, honestly, because we were turning down 40k of work.

I said, If we change the logo and the croissant still sells at the same price, nothing changes.`;

const DRAFT = `Last March in Valencia, the air smelled of flour and the tension was thick.

I sat across from Marta and her head of operations in their back office above the shop.`;

describe("opening guard", () => {
  it("measures the first line", () => {
    expect(firstLineLength(COLLAPSED)).toBe(284);
    expect(openingTooLong(COLLAPSED)).toBe(true);
    expect(openingTooLong(DRAFT)).toBe(false);
  });

  it("splits sentences without breaking times or decimals", () => {
    expect(lineSentences("We met at 8 a.m. with Marta. It took 1.5x longer. Then she left!")).toEqual(["We met at 8 a.m. with Marta.", "It took 1.5x longer.", "Then she left!"]);
  });

  it("splits a collapsed opening after its first sentence and keeps every word", () => {
    const fixed = splitOpening(COLLAPSED, 140)!;
    const lines = fixed.split("\n");
    expect(lines[0]).toBe("Last March in Valencia, it smelled like bread and flour was on the table.");
    expect(lines[1]).toBe("");
    expect(lines[2].startsWith("I sat across from Marta")).toBe(true);
    expect(fixed.replace(/\s+/g, " ")).toBe(COLLAPSED.replace(/\s+/g, " "));
    expect(openingTooLong(fixed)).toBe(false);
  });

  it("takes more than one sentence when they fit the target", () => {
    const text = `Tuesday, 7:40. The office was empty. ${"Then the client called and asked about the export that had failed twice that week, and nobody had an answer for her. ".repeat(2)}`.trim();
    expect(splitOpening(text, 140)!.split("\n")[0]).toBe("Tuesday, 7:40. The office was empty.");
  });

  it("does nothing to a short opening or a single endless sentence", () => {
    expect(splitOpening(DRAFT, 140)).toBeNull();
    const oneSentence = `Last March in Valencia ${"and then the founder and her head of operations ".repeat(5)}sat with me.`;
    expect(splitOpening(oneSentence, 140)).toBeNull();
  });

  it("puts the previous short opening back when the long line can't be split", () => {
    const glued = `Last March in Valencia, the air smelled of flour and the tension was thick ${"and I sat across from Marta and her head of operations in their back office ".repeat(3)}above the shop.\n\nShe almost ended the meeting.`;
    const fixed = restoreOpening(glued, DRAFT)!;
    const lines = fixed.split("\n");
    expect(lines[0]).toBe("Last March in Valencia, the air smelled of flour and the tension was thick.");
    expect(lines[2].startsWith("And I sat across from Marta")).toBe(true);
    expect(lines.at(-1)).toBe("She almost ended the meeting.");
    expect(restoreOpening(glued, COLLAPSED)).toBeNull();
    expect(restoreOpening(DRAFT, DRAFT)).toBeNull();
  });

  it("keeps the rewrite's long line under the restored hook when it is new text", () => {
    const rewrite = `${"We spent six weeks on the offer and the shop window instead of the logo, ".repeat(3)}and it worked.`;
    const fixed = restoreOpening(rewrite, DRAFT)!;
    expect(fixed.split("\n")[0]).toBe("Last March in Valencia, the air smelled of flour and the tension was thick.");
    expect(fixed.split("\n")[2]).toBe(rewrite);
  });
});
