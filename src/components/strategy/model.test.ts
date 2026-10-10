import { describe, expect, it } from "vitest";
import { StrategySchema } from "@/lib/types";
import {
  balanceWeights,
  cadenceSummary,
  createPillar,
  emptyStrategy,
  isStrategyEmpty,
  isValidTime,
  nextPillarColor,
  normalizeStrategy,
  pillarShares,
  setPostsPerWeek,
  sharePercents,
  toggleDay,
  prepareStrategyInput,
} from "./model";

const cadence = { postsPerWeek: 3, days: [2, 3, 4], time: "08:30" };

describe("strategy emptiness", () => {
  it("treats null and default strategies as empty", () => {
    expect(isStrategyEmpty(null)).toBe(true);
    expect(isStrategyEmpty(emptyStrategy("es"))).toBe(true);
    expect(emptyStrategy("es").language).toBe("es");
    expect(isStrategyEmpty({ ...emptyStrategy(), positioning: "I help fintechs ship AI" })).toBe(false);
    expect(isStrategyEmpty({ ...emptyStrategy(), goals: ["Win clients"] })).toBe(false);
  });
});

describe("pillars", () => {
  it("picks unused colors and sensible default weights", () => {
    expect(nextPillarColor([])).toBe("blue");
    expect(nextPillarColor([{ color: "blue" }, { color: "orange" }])).toBe("purple");
    const first = createPillar([], "AI in finance");
    expect(first).toMatchObject({ name: "AI in finance", weight: 100, color: "blue", storyPrompts: [] });
    expect(first.id).toMatch(/^pl_/);
    const second = createPillar([{ ...first, weight: 60 }]);
    expect(second.weight).toBe(60);
    expect(second.color).toBe("purple");
    expect(second.id).not.toBe(first.id);
  });

  it("converts weights into shares and whole percentages that sum to 100", () => {
    expect(pillarShares([{ weight: 50 }, { weight: 50 }])).toEqual([0.5, 0.5]);
    expect(pillarShares([{ weight: 0 }, { weight: 0 }, { weight: 0 }])).toEqual([1 / 3, 1 / 3, 1 / 3]);
    const pct = sharePercents([{ weight: 33 }, { weight: 33 }, { weight: 33 }]);
    expect(pct.reduce((a, b) => a + b, 0)).toBe(100);
    expect(sharePercents([{ weight: 40 }, { weight: 35 }, { weight: 25 }])).toEqual([40, 35, 25]);
    expect(sharePercents([])).toEqual([]);
  });

  it("balances weights evenly", () => {
    const ps = [createPillar([]), createPillar([]), createPillar([])];
    expect(balanceWeights(ps).map((p) => p.weight)).toEqual([34, 33, 33]);
  });
});

describe("cadence", () => {
  it("adds preferred days when raising posts per week", () => {
    expect(setPostsPerWeek(cadence, 4)).toEqual({ postsPerWeek: 4, days: [1, 2, 3, 4], time: "08:30" });
    expect(setPostsPerWeek(cadence, 5).days).toEqual([1, 2, 3, 4, 5]);
  });

  it("drops the least preferred days when lowering posts per week", () => {
    expect(setPostsPerWeek({ ...cadence, days: [1, 2, 3, 4, 5], postsPerWeek: 5 }, 2).days).toEqual([2, 3]);
    expect(setPostsPerWeek(cadence, 0).postsPerWeek).toBe(1);
    expect(setPostsPerWeek(cadence, 99).postsPerWeek).toBe(7);
  });

  it("keeps posts per week equal to the number of toggled days", () => {
    expect(toggleDay(cadence, 5)).toEqual({ postsPerWeek: 4, days: [2, 3, 4, 5], time: "08:30" });
    expect(toggleDay(cadence, 3)).toEqual({ postsPerWeek: 2, days: [2, 4], time: "08:30" });
    const single = { postsPerWeek: 1, days: [2], time: "08:30" };
    expect(toggleDay(single, 2)).toBe(single);
  });

  it("validates times and summarizes", () => {
    expect(isValidTime("08:30")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("8:30")).toBe(false);
    expect(cadenceSummary(cadence)).toBe("3 posts a week · Tue, Wed, Thu at 08:30");
    expect(cadenceSummary({ postsPerWeek: 1, days: [0], time: "09:00" })).toBe("1 post a week · Sun at 09:00");
  });
});

describe("normalizeStrategy", () => {
  it("cleans lists, drops unnamed pillars and repairs ids, colors, weights and cadence", () => {
    const raw = StrategySchema.parse(prepareStrategyInput({
      positioning: "  I help founders tell real stories  ",
      goals: ["Win clients", " win clients ", "", "Hire"],
      audience: { who: " Seed founders ", pains: ["", "No time"], desires: ["Inbound  leads"] },
      pillars: [
        { id: "a", name: " Building ", weight: 150, color: "chartreuse", storyPrompts: ["", "First hire", "first hire"] },
        { id: "a", name: "Dup id", weight: -5, color: "blue" },
        { id: "c", name: "   ", weight: 20 },
      ],
      cadence: { postsPerWeek: 3, days: [4, 2, 2, 9], time: "8am" },
      language: " ",
    }));
    const s = normalizeStrategy(raw);
    expect(s.positioning).toBe("I help founders tell real stories");
    expect(s.goals).toEqual(["Win clients", "Hire"]);
    expect(s.audience).toEqual({ who: "Seed founders", pains: ["No time"], desires: ["Inbound leads"] });
    expect(s.pillars).toHaveLength(2);
    expect(s.pillars[0]).toMatchObject({ id: "a", name: "Building", weight: 100, color: "blue", storyPrompts: ["First hire"] });
    expect(s.pillars[1].id).not.toBe("a");
    expect(s.pillars[1]).toMatchObject({ name: "Dup id", weight: 0, color: "blue" });
    expect(s.cadence).toEqual({ postsPerWeek: 3, days: [2, 4], time: "08:30" });
    expect(s.language).toBe("en");
  });

  it("falls back to default posting days when none are set", () => {
    const s = normalizeStrategy(StrategySchema.parse({ cadence: { postsPerWeek: 2, days: [], time: "07:15" } }));
    expect(s.cadence).toEqual({ postsPerWeek: 2, days: [2, 3, 4], time: "07:15" });
  });

  it("prepares lenient input: missing pillar ids, out-of-range numbers", () => {
    const input = prepareStrategyInput({
      pillars: [{ name: "No id", weight: 140 }, { id: "keep", name: "Has id", weight: -3 }],
      cadence: { postsPerWeek: 30.4, days: [1, 7, -1, 2.5, 3], time: "09:00" },
    });
    const parsed = StrategySchema.parse(input);
    expect(parsed.pillars[0].id).toMatch(/^pl_/);
    expect(parsed.pillars.map((p) => p.weight)).toEqual([100, 0]);
    expect(parsed.pillars[1].id).toBe("keep");
    expect(parsed.cadence).toEqual({ postsPerWeek: 14, days: [1, 3], time: "09:00" });
    expect(prepareStrategyInput({ positioning: "x" })).toEqual({ positioning: "x" });
  });
});
