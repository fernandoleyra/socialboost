import { describe, expect, it } from "vitest";
import { MISSED_MESSAGE, VERIFY_MESSAGE, publishingMarker } from "./linkedin-format";
import { displayState, formatWeekTitle, monthGrid, shiftAnchor, viewRange, visibleError, weekKeys, weekdayLabels } from "./view";

const now = new Date("2026-10-10T10:00:00Z");
const base = { status: "scheduled" as const, scheduledAt: "2026-10-13T06:30:00Z", publishedAt: null, error: null };

describe("displayState", () => {
  it("adds time to the stored status", () => {
    expect(displayState(base, now)).toBe("scheduled");
    expect(displayState({ ...base, scheduledAt: "2026-10-10T09:00:00Z" }, now)).toBe("due");
    expect(displayState({ ...base, status: "approved" }, now)).toBe("approved");
    expect(displayState({ ...base, status: "approved", scheduledAt: "2026-10-09T09:00:00Z" }, now)).toBe("stale");
    expect(displayState({ ...base, status: "idea" }, now)).toBe("idea");
    expect(displayState({ ...base, status: "draft", scheduledAt: "2026-10-08T09:00:00Z" }, now)).toBe("stale");
    expect(displayState({ ...base, status: "published", publishedAt: "2026-10-09T09:00:00Z" }, now)).toBe("published");
  });

  it("shows publishing, then verify when the claim is old", () => {
    expect(displayState({ ...base, error: publishingMarker(new Date(now.getTime() - 60_000)) }, now)).toBe("publishing");
    expect(displayState({ ...base, error: publishingMarker(new Date(now.getTime() - 10 * 60_000)) }, now)).toBe("verify");
    expect(displayState({ ...base, error: VERIFY_MESSAGE }, now)).toBe("verify");
  });

  it("hides stale scheduler errors once the post has a new time", () => {
    expect(visibleError({ ...base, error: MISSED_MESSAGE }, now)).toBeNull();
    expect(visibleError({ ...base, scheduledAt: "2026-10-09T09:00:00Z", error: MISSED_MESSAGE }, now)).toBe(MISSED_MESSAGE);
    expect(visibleError({ ...base, error: publishingMarker(now) }, now)).toBeNull();
    expect(visibleError({ ...base, error: "LinkedIn returned 400" }, now)).toBeNull();
    expect(visibleError({ ...base, status: "approved", error: "LinkedIn returned 400" }, now)).toBe("LinkedIn returned 400");
    expect(visibleError({ ...base, scheduledAt: "2026-10-10T09:00:00Z", error: "LinkedIn returned 400" }, now)).toBe("LinkedIn returned 400");
  });
});

describe("grids", () => {
  it("builds a Monday-first month grid", () => {
    const grid = monthGrid("2026-10-10");
    expect(grid[0][0]).toBe("2026-09-28");
    expect(grid[grid.length - 1][6]).toBe("2026-11-01");
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid).toHaveLength(5);
  });

  it("computes ranges and navigation", () => {
    expect(viewRange("week", "2026-10-10")).toEqual({ from: "2026-10-05", to: "2026-10-12" });
    expect(viewRange("month", "2026-10-10")).toEqual({ from: "2026-09-28", to: "2026-11-02" });
    expect(weekKeys("2026-10-10")[6]).toBe("2026-10-11");
    expect(shiftAnchor("month", "2026-10-10", 1)).toBe("2026-11-01");
    expect(shiftAnchor("week", "2026-10-10", -1)).toBe("2026-10-03");
  });

  it("labels weekdays starting Monday", () => {
    expect(weekdayLabels("en-US")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(formatWeekTitle("2026-10-10", "en-GB")).toBe("5–11 October 2026");
    expect(formatWeekTitle("2026-10-01", "en-GB")).toMatch(/^28 Sep.* – 4 Oct 2026$/);
    expect(formatWeekTitle("2026-01-01", "en-GB")).toBe("29 Dec 2025 – 4 Jan 2026");
  });
});
