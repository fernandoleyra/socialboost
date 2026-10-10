import { describe, expect, it } from "vitest";
import { memoryScore, planCalendar, planMessages, pillarShares, type PlanMemory } from "./plan";

const now = new Date("2026-10-10T10:00:00Z");

function mem(id: string, pillar: string | null, extra: Partial<PlanMemory> = {}): PlanMemory {
  return { id, title: `Story ${id}`, pillar, strength: 3, coverPhotoId: null, photoCount: 0, createdAt: "2026-10-01 10:00:00", ...extra };
}

const slots = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 13 + i, 6, 30));
    return { at: d.toISOString(), day: d.toISOString().slice(0, 10) };
  });

const pillars = [
  { id: "a", name: "Founder lessons", weight: 50 },
  { id: "b", name: "Hiring", weight: 25 },
  { id: "c", name: "Sales", weight: 25 },
];

describe("memoryScore", () => {
  it("prefers stories with a photo, then strength", () => {
    const withPhoto = memoryScore(mem("1", "a", { coverPhotoId: "ph", strength: 2 }), now);
    const strong = memoryScore(mem("2", "a", { strength: 5 }), now);
    expect(withPhoto).toBeGreaterThan(strong);
    expect(memoryScore(mem("3", "a", { strength: 5 }), now)).toBeGreaterThan(memoryScore(mem("4", "a", { strength: 2 }), now));
  });
});

describe("pillarShares", () => {
  it("normalizes weights and splits evenly when all are zero", () => {
    expect(pillarShares(pillars).get("a")).toBeCloseTo(0.5);
    const even = pillarShares([
      { id: "x", name: "X", weight: 0 },
      { id: "y", name: "Y", weight: 0 },
    ]);
    expect(even.get("x")).toBeCloseTo(0.5);
  });
});

describe("planCalendar", () => {
  it("follows pillar weights and never repeats a pillar back to back when it can avoid it", () => {
    const memories = [...["a1", "a2", "a3", "a4"].map((id) => mem(id, "a")), ...["b1", "b2"].map((id) => mem(id, "b")), ...["c1", "c2"].map((id) => mem(id, "c"))];
    const res = planCalendar({ slots: slots(8), memories, pillars, existing: [], now });
    expect(res.assignments).toHaveLength(8);
    const seq = res.assignments.map((a) => a.pillar);
    expect(seq.filter((p) => p === "a")).toHaveLength(4);
    expect(seq.filter((p) => p === "b")).toHaveLength(2);
    for (let i = 1; i < seq.length; i++) {
      // a and a can only be adjacent if nothing else was available; with this pool it never happens.
      if (seq[i] === "a") expect(seq[i - 1]).not.toBe("a");
    }
    expect(res.gaps).toEqual([]);
    expect(res.unfilled).toEqual([]);
  });

  it("uses each story once and prefers stories with photos", () => {
    const memories = [mem("plain", "a", { strength: 5 }), mem("photo", "a", { coverPhotoId: "ph1", photoCount: 1, strength: 2 })];
    const res = planCalendar({ slots: slots(3), memories, pillars: [pillars[0]], existing: [], now });
    expect(res.assignments.map((a) => a.memoryId)).toEqual(["photo", "plain"]);
    expect(res.assignments[0].photoId).toBe("ph1");
    expect(res.assignments[1].needsPhoto).toBe(true);
    expect(res.needsPhoto).toBe(1);
    expect(res.unfilled).toHaveLength(1);
  });

  it("reports a gap for a pillar with no stories and fills with the next pillar", () => {
    const memories = [mem("b1", "b"), mem("b2", "b"), mem("c1", "c"), mem("c2", "c")];
    const res = planCalendar({ slots: slots(4), memories, pillars, existing: [], now });
    expect(res.assignments).toHaveLength(4);
    expect(res.gaps[0]).toMatchObject({ pillar: "a", pillarName: "Founder lessons" });
    expect(res.gaps[0].missing).toBeGreaterThanOrEqual(2);
  });

  it("counts existing posts toward the balance", () => {
    const existing = [
      { at: "2026-10-01T06:30:00Z", pillar: "a" },
      { at: "2026-10-02T06:30:00Z", pillar: "a" },
    ];
    const memories = [mem("a1", "a"), mem("b1", "b"), mem("c1", "c")];
    const res = planCalendar({ slots: slots(1), memories, pillars, existing, now });
    expect(res.assignments[0].pillar).not.toBe("a");
  });

  it("treats stories with an unknown pillar as unsorted fallbacks", () => {
    const res = planCalendar({ slots: slots(1), memories: [mem("x", "deleted-pillar")], pillars, existing: [], now });
    expect(res.assignments[0]).toMatchObject({ memoryId: "x", pillar: null });
  });

  it("plans by story quality when there are no pillars", () => {
    const res = planCalendar({ slots: slots(2), memories: [mem("weak", null, { strength: 1 }), mem("strong", null, { strength: 5 })], pillars: [], existing: [], now });
    expect(res.assignments.map((a) => a.memoryId)).toEqual(["strong", "weak"]);
  });

  it("writes helpful summary lines", () => {
    const res = planCalendar({ slots: slots(3), memories: [mem("b1", "b")], pillars, existing: [], now });
    const lines = planMessages(res, 3);
    expect(lines[0]).toBe("1 of 3 open slots filled with stories from your Memory Bank.");
    expect(lines.some((l) => l.includes("Not enough stories for Founder lessons"))).toBe(true);
    expect(lines.some((l) => l.includes("no photo yet"))).toBe(true);
    expect(planMessages({ assignments: [], gaps: [], unfilled: [], needsPhoto: 0 }, 0)[0]).toMatch(/already has a post/);
  });
});
