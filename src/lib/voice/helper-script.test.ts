import { describe, expect, it } from "vitest";
import { HELPER_SCRIPT, bookmarkletHref } from "./helper-script";

describe("browser helper", () => {
  it("is valid JavaScript", () => {
    expect(() => new Function(HELPER_SCRIPT)).not.toThrow();
  });

  it("survives being squashed onto one line (bookmarklet)", () => {
    expect(() => new Function(HELPER_SCRIPT.replace(/\n\s*/g, " "))).not.toThrow();
  });

  it("only reads: no innerHTML, no fetch, no form posts", () => {
    expect(HELPER_SCRIPT).not.toMatch(/innerHTML|fetch\(|XMLHttpRequest|\.submit\(/);
  });

  it("builds a bookmarklet that decodes back to the script", () => {
    const href = bookmarkletHref();
    expect(href.startsWith("javascript:")).toBe(true);
    expect(decodeURIComponent(href.slice("javascript:".length))).toBe(HELPER_SCRIPT + "void 0;");
  });
});
