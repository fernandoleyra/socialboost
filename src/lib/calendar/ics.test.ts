import { describe, expect, it } from "vitest";
import { buildIcs, escapeIcsText, foldIcsLine, icsDate } from "./ics";

describe("ics", () => {
  it("escapes TEXT values", () => {
    expect(escapeIcsText("a;b,c\\d\nnext\r\nline")).toBe("a\\;b\\,c\\\\d\\nnext\\nline");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = "DESCRIPTION:" + "é".repeat(80);
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    const enc = new TextEncoder();
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(enc.encode(p).length).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(line);
    expect(foldIcsLine("SHORT:x")).toBe("SHORT:x");
  });

  it("formats UTC dates", () => {
    expect(icsDate(new Date("2026-10-13T06:30:00.000Z"))).toBe("20261013T063000Z");
  });

  it("builds a calendar with CRLF line endings", () => {
    const ics = buildIcs({
      name: "Ana's LinkedIn",
      now: new Date("2026-10-10T00:00:00Z"),
      events: [
        {
          uid: "post_1@socialboost",
          start: new Date("2026-10-13T06:30:00Z"),
          durationMinutes: 15,
          summary: "LinkedIn: We refunded €84k, in one afternoon",
          description: "Line one\nLine two",
          url: "http://localhost:3000/studio/post_1",
          categories: ["Founder lessons"],
        },
      ],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261013T063000Z");
    expect(ics).toContain("DTEND:20261013T064500Z");
    expect(ics).toContain("SUMMARY:LinkedIn: We refunded €84k\\, in one afternoon");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
    expect(ics).toContain("X-WR-CALNAME:Ana's LinkedIn");
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
  });
});
