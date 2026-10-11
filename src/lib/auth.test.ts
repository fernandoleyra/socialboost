import { describe, expect, it } from "vitest";
import { LoginThrottle, safeNextPath } from "./auth";

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/studio/abc?tab=2#top")).toBe("/studio/abc?tab=2#top");
    expect(safeNextPath("/")).toBe("/");
  });

  it("refuses anything a browser would send to another site", () => {
    for (const v of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "https://evil.example", "evil", "", undefined, ["/a"]]) {
      expect(safeNextPath(v)).toBe("/");
    }
  });
});

describe("LoginThrottle", () => {
  it("locks for a growing window after each failure, capped at a minute", () => {
    const t = new LoginThrottle();
    const now = 1_000_000;
    expect(t.retryAfter(now)).toBe(0);
    t.fail(now);
    expect(t.retryAfter(now)).toBe(500);
    t.fail(now + 500);
    expect(t.retryAfter(now + 500)).toBe(1000);
    let at = now + 1500;
    for (let i = 0; i < 12; i++) {
      t.fail(at);
      at += t.retryAfter(at);
    }
    t.fail(at);
    expect(t.retryAfter(at)).toBe(60_000);
  });

  it("refuses attempts during the window however many arrive at once", () => {
    const t = new LoginThrottle();
    t.fail(0);
    const allowed = Array.from({ length: 100 }, () => t.retryAfter(10) === 0).filter(Boolean).length;
    expect(allowed).toBe(0);
    expect(t.retryAfter(500)).toBe(0);
  });

  it("clears after a successful sign-in and forgets old mistakes", () => {
    const t = new LoginThrottle();
    for (let i = 0; i < 6; i++) t.fail(0);
    t.succeed();
    expect(t.retryAfter(0)).toBe(0);
    for (let i = 0; i < 6; i++) t.fail(0);
    t.fail(60 * 60_000);
    expect(t.retryAfter(60 * 60_000)).toBe(500);
  });
});
