import { describe, expect, it } from "vitest";
import { languageLabel, normalizeLinkedInUrl, timezoneOptions } from "./options";

describe("normalizeLinkedInUrl", () => {
  it("strips tracking params and normalizes the host", () => {
    expect(normalizeLinkedInUrl("https://www.linkedin.com/in/glushenkovig?utm_source=share_via&utm_medium=member_ios")).toBe(
      "https://www.linkedin.com/in/glushenkovig",
    );
    expect(normalizeLinkedInUrl("linkedin.com/in/jane-doe/")).toBe("https://www.linkedin.com/in/jane-doe");
    expect(normalizeLinkedInUrl("https://de.linkedin.com/in/hans")).toBe("https://www.linkedin.com/in/hans");
  });

  it("accepts empty input and rejects non-profile URLs", () => {
    expect(normalizeLinkedInUrl("  ")).toBe("");
    expect(normalizeLinkedInUrl("https://example.com/in/jane")).toBeNull();
    expect(normalizeLinkedInUrl("https://www.linkedin.com/company/acme")).toBeNull();
    expect(normalizeLinkedInUrl("https://notlinkedin.com/in/x")).toBeNull();
  });
});

describe("options", () => {
  it("lists timezones with UTC first and keeps the current one", () => {
    const zones = timezoneOptions("Etc/GMT+3");
    expect(zones[0]).toBe("UTC");
    expect(zones).toContain("Europe/Zurich");
    expect(zones).toContain("Etc/GMT+3");
    expect(new Set(zones).size).toBe(zones.length);
  });

  it("labels languages", () => {
    expect(languageLabel("es")).toBe("Español");
    expect(languageLabel("xx")).toBe("xx");
  });
});
