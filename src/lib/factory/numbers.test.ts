import { describe, expect, it } from "vitest";
import { alignFigures, currencyFamilies, currencyIssues, digitFixes, extractNumbers, findCurrencies, spelledNumbers } from "./numbers";

/** The story from the end-to-end run: no currency anywhere, figures as digits. */
const STORY =
  "Last March a founder of a bakery chain in Valencia asked us for a full rebrand. 40k budget. We found that 60% of revenue came from 4 products and nobody knew it. We killed the rebrand and spent 6 weeks redesigning the offer. Sales went up 23% in two months. We were turning down 40k of work.";

const values = (text: string) => spelledNumbers(text).map((n) => [n.raw, n.value]);

describe("spelledNumbers", () => {
  it("reads English compounds, scales and percentages", () => {
    expect(values("sixty percent of revenue, twenty-three percent, forty thousand dollars")).toEqual([
      ["sixty percent", 60],
      ["twenty-three percent", 23],
      ["forty thousand", 40000],
    ]);
    expect(values("two hundred and fifty people")).toEqual([["two hundred and fifty", 250]]);
    expect(spelledNumbers("sixty percent")[0].percent).toBe(true);
  });

  it("reads basic Spanish", () => {
    expect(values("el sesenta por ciento, treinta y dos clientes, veinte mil euros, dos millones")).toEqual([
      ["sesenta por ciento", 60],
      ["treinta y dos", 32],
      ["veinte mil", 20000],
      ["dos millones", 2000000],
    ]);
    expect(values("veintitrés semanas y cien clientes")).toEqual([
      ["veintitrés", 23],
      ["cien", 100],
    ]);
  });

  it("skips idioms and doesn't glue separate numbers together", () => {
    expect(values("a thousand times, mil gracias, thousands of people")).toEqual([]);
    expect(values("between one and two hours")).toEqual([
      ["one", 1],
      ["two", 2],
    ]);
    expect(values("ten, twenty")).toEqual([
      ["ten", 10],
      ["twenty", 20],
    ]);
    // "once" is an English word, not 11.
    expect(values("I once asked her")).toEqual([]);
  });
});

describe("extractNumbers", () => {
  it("reads digits with scale words and percent words", () => {
    expect(extractNumbers("40 mil euros, 2 millones, 40 thousand").map((n) => n.value)).toEqual([40000, 2000000, 40000]);
    expect(extractNumbers("60 percent").map((n) => n.percent)).toEqual([true]);
  });
});

describe("currencies", () => {
  it("finds symbols, codes and words", () => {
    expect(findCurrencies("$40k, US$5, €84k, 40 €, CHF 2,190, 300 dollars, 20 euros, 5 libras").map((m) => [m.raw, m.family])).toEqual([
      ["$", "dollar"],
      ["US$", "dollar"],
      ["€", "euro"],
      ["€", "euro"],
      ["CHF", "franc"],
      ["dollars", "dollar"],
      ["euros", "euro"],
      ["libras", "pound"],
    ]);
  });

  it("counts ambiguous words only next to an amount", () => {
    expect(currencyFamilies("I lost a few pounds of pride")).toEqual(new Set());
    expect(currencyFamilies("It cost 400 pounds")).toEqual(new Set(["pound"]));
    expect(currencyFamilies("around 18k euros")).toEqual(new Set(["euro"]));
  });

  it("flags currencies the source never names", () => {
    const issues = currencyIssues("We were turning down forty thousand dollars of work. A $40k rebrand.", STORY);
    expect(issues.map((i) => [i.raw, i.kind, i.suggest])).toEqual([
      ["dollars", "absent", "40k"],
      ["$", "absent", "40k"],
    ]);
    expect(currencyIssues("It cost us real money.", STORY)).toEqual([]);
  });

  it("flags a currency added to an amount the source gives without one", () => {
    const source = "40k budget. The sprint is around 18k euros.";
    expect(currencyIssues("A 40k euros rebrand and an 18k euros sprint.", source).map((i) => [i.raw, i.kind])).toEqual([["euros", "added"]]);
    expect(currencyIssues("We refunded €84k.", "We refunded 84,000 euros.")).toEqual([]);
  });
});

describe("digitFixes", () => {
  it("maps spelled-out numbers to the source's digits", () => {
    const draft = "We found out sixty percent of revenue came from just four products. Sales went up twenty-three percent. We spent six weeks on it and turned down forty thousand.";
    expect(digitFixes(draft, STORY).map((f) => [f.raw, f.replacement])).toEqual([
      ["sixty percent", "60%"],
      ["four", "4"],
      ["twenty-three percent", "23%"],
      ["six", "6"],
      ["forty thousand", "40k"],
    ]);
  });

  it("leaves numbers the source spells out, and small counts without the same noun", () => {
    expect(digitFixes("Sales went up in two months.", STORY)).toEqual([]);
    expect(digitFixes("Four of us were in the room.", STORY)).toEqual([]);
  });

  it("keeps a percent word when the source uses one", () => {
    expect(digitFixes("sixty percent of revenue", "60 percent of revenue").map((f) => [f.raw, f.replacement])).toEqual([["sixty", "60"]]);
  });
});

describe("alignFigures", () => {
  it("rewrites the observed draft lines with the author's figures", () => {
    expect(alignFigures("I felt scared, honestly, because we were turning down forty thousand dollars of work.", STORY)).toBe(
      "I felt scared, honestly, because we were turning down 40k of work.",
    );
    expect(alignFigures("We found out sixty percent of revenue came from just four products and nobody knew it.", STORY)).toBe(
      "We found out 60% of revenue came from just 4 products and nobody knew it.",
    );
    expect(alignFigures("Turning down a $40k rebrand", STORY)).toBe("Turning down a 40k rebrand");
    expect(alignFigures("Should we spend forty thousand on a new logo?", STORY)).toBe("Should we spend 40k on a new logo?");
    expect(alignFigures("A forty-thousand-dollar rebrand.", STORY)).toBe("A 40k rebrand.");
    expect(alignFigures("The budget was USD 40k.", STORY)).toBe("The budget was 40k.");
  });

  it("keeps currencies the source has and text without a source", () => {
    expect(alignFigures("We refunded €84k.", "We refunded 84,000 euros.")).toBe("We refunded €84k.");
    expect(alignFigures("forty thousand dollars", "")).toBe("forty thousand dollars");
    expect(alignFigures("Nothing numeric here.", STORY)).toBe("Nothing numeric here.");
  });
});
