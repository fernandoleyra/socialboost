import { describe, expect, it } from "vitest";
import { cadenceNote, cadenceSlots, markTaken, postingDays } from "./slots";

describe("postingDays", () => {
  it("uses all selected days when posts per week covers them", () => {
    expect(postingDays({ postsPerWeek: 3, days: [4, 2, 3], time: "08:30" })).toEqual([2, 3, 4]);
    expect(postingDays({ postsPerWeek: 5, days: [2, 3, 4], time: "08:30" })).toEqual([2, 3, 4]);
  });

  it("spreads fewer posts across the selected days", () => {
    // Mon..Fri, 3 posts → Mon/Wed/Fri keeps every gap ≥ 2 days.
    expect(postingDays({ postsPerWeek: 3, days: [1, 2, 3, 4, 5], time: "08:30" })).toEqual([1, 3, 5]);
    // 2 posts → widest gap, ties prefer Tue.
    expect(postingDays({ postsPerWeek: 2, days: [1, 2, 3, 4, 5], time: "08:30" })).toEqual([2, 5]);
    expect(postingDays({ postsPerWeek: 1, days: [1, 2, 3, 4, 5], time: "08:30" })).toEqual([2]);
  });

  it("falls back to Tue–Thu with no days", () => {
    expect(postingDays({ postsPerWeek: 3, days: [], time: "08:30" })).toEqual([2, 3, 4]);
    expect(postingDays(null)).toEqual([2, 3, 4]);
  });

  it("explains mismatches", () => {
    expect(cadenceNote({ postsPerWeek: 5, days: [2, 3, 4], time: "08:30" })).toMatch(/5 posts a week but has 3 posting days/);
    expect(cadenceNote({ postsPerWeek: 3, days: [2, 3, 4], time: "08:30" })).toBeNull();
    expect(cadenceNote({ postsPerWeek: 2, days: [1, 2, 3, 4, 5], time: "08:30" })).toMatch(/Tue, Fri/);
  });
});

describe("cadenceSlots", () => {
  it("lists slots in the profile time zone within [from, to)", () => {
    const slots = cadenceSlots({
      cadence: { postsPerWeek: 3, days: [2, 3, 4], time: "08:30" },
      timezone: "Europe/Zurich",
      from: new Date("2026-10-12T00:00:00Z"), // Monday
      to: new Date("2026-10-19T00:00:00Z"),
    });
    expect(slots.map((s) => s.day)).toEqual(["2026-10-13", "2026-10-14", "2026-10-15"]);
    expect(slots[0].at).toBe("2026-10-13T06:30:00.000Z");
    expect(slots[0].time).toBe("08:30");
  });

  it("excludes a slot that is earlier than `from`", () => {
    const slots = cadenceSlots({
      cadence: { postsPerWeek: 3, days: [2, 3, 4], time: "08:30" },
      timezone: "UTC",
      from: new Date("2026-10-13T09:00:00Z"),
      to: new Date("2026-10-16T00:00:00Z"),
    });
    expect(slots.map((s) => s.day)).toEqual(["2026-10-14", "2026-10-15"]);
  });

  it("returns nothing for an empty range", () => {
    expect(cadenceSlots({ cadence: null, timezone: "UTC", from: new Date("2026-10-13T00:00:00Z"), to: new Date("2026-10-13T00:00:00Z") })).toEqual([]);
  });

  it("marks a slot taken when any post sits on that local day", () => {
    const slots = cadenceSlots({ cadence: null, timezone: "America/New_York", from: new Date("2026-10-12T00:00:00Z"), to: new Date("2026-10-17T00:00:00Z") });
    // 2026-10-14 23:30 New York = 2026-10-15T03:30Z → counts for the 14th locally.
    const marked = markTaken(slots, [{ id: "p1", at: "2026-10-15T03:30:00.000Z" }, { id: "p2", at: null }], "America/New_York");
    expect(marked.find((s) => s.day === "2026-10-14")).toMatchObject({ taken: true, postId: "p1" });
    expect(marked.find((s) => s.day === "2026-10-15")).toMatchObject({ taken: false, postId: null });
  });
});
