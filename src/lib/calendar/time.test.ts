import { describe, expect, it } from "vitest";
import { addDays, addMonths, dayKeyOf, diffDays, isDayKey, parseDbDate, parseTime, safeTimezone, startOfWeek, timeOf, weekdayOf, zonedToUtc } from "./time";

describe("time zones", () => {
  it("falls back to UTC for unknown zones", () => {
    expect(safeTimezone("Mars/Olympus")).toBe("UTC");
    expect(safeTimezone("")).toBe("UTC");
    expect(safeTimezone("Europe/Zurich")).toBe("Europe/Zurich");
  });

  it("converts local wall-clock time to UTC across DST", () => {
    // Zurich is UTC+2 in summer, UTC+1 in winter.
    expect(zonedToUtc("2026-07-14", "08:30", "Europe/Zurich").toISOString()).toBe("2026-07-14T06:30:00.000Z");
    expect(zonedToUtc("2026-12-15", "08:30", "Europe/Zurich").toISOString()).toBe("2026-12-15T07:30:00.000Z");
    // The day after the October change (2026-10-25).
    expect(zonedToUtc("2026-10-26", "08:30", "Europe/Zurich").toISOString()).toBe("2026-10-26T07:30:00.000Z");
    expect(zonedToUtc("2026-03-10", "09:00", "America/New_York").toISOString()).toBe("2026-03-10T13:00:00.000Z");
    expect(zonedToUtc("2026-03-10", "09:00", "UTC").toISOString()).toBe("2026-03-10T09:00:00.000Z");
  });

  it("round-trips day key and time", () => {
    const at = zonedToUtc("2026-10-13", "08:30", "Asia/Tokyo");
    expect(dayKeyOf(at, "Asia/Tokyo")).toBe("2026-10-13");
    expect(timeOf(at, "Asia/Tokyo")).toBe("08:30");
    // Same instant is the previous day in New York.
    expect(dayKeyOf(at, "America/New_York")).toBe("2026-10-12");
  });

  it("parses SQLite and ISO timestamps", () => {
    expect(parseDbDate("2026-10-10 08:30:00")?.toISOString()).toBe("2026-10-10T08:30:00.000Z");
    expect(parseDbDate("2026-10-10T08:30:00.000Z")?.toISOString()).toBe("2026-10-10T08:30:00.000Z");
    expect(parseDbDate("nope")).toBeNull();
    expect(parseDbDate(null)).toBeNull();
  });
});

describe("day keys", () => {
  it("does calendar math", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-10-01", "2026-10-31")).toBe(30);
    expect(weekdayOf("2026-10-10")).toBe(6); // Saturday
    expect(startOfWeek("2026-10-10")).toBe("2026-10-05"); // Monday
    expect(startOfWeek("2026-10-10", 0)).toBe("2026-10-04"); // Sunday
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
  });

  it("validates keys and times", () => {
    expect(isDayKey("2026-02-29")).toBe(false);
    expect(isDayKey("2028-02-29")).toBe(true);
    expect(isDayKey("2026-1-1")).toBe(false);
    expect(parseTime("7:05")).toEqual([7, 5]);
    expect(parseTime("25:00")).toEqual([8, 30]);
    expect(parseTime("")).toEqual([8, 30]);
  });
});
