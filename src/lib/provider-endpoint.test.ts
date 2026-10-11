import { describe, expect, it } from "vitest";
import { sameProviderEndpoint } from "./provider-endpoint";

describe("sameProviderEndpoint", () => {
  it("matches the same kind and origin, ignoring path and trailing slashes", () => {
    expect(sameProviderEndpoint({ kind: "openai", baseUrl: "https://api.openai.com/v1" }, { kind: "openai", baseUrl: "https://API.openai.com/v1/ " })).toBe(true);
    expect(sameProviderEndpoint({ kind: "anthropic", baseUrl: "" }, { kind: "anthropic", baseUrl: "https://api.anthropic.com" })).toBe(true);
  });

  it("differs when the host or the kind changes", () => {
    expect(sameProviderEndpoint({ kind: "anthropic", baseUrl: "https://api.anthropic.com" }, { kind: "openai", baseUrl: "https://api.anthropic.com" })).toBe(false);
    expect(sameProviderEndpoint({ kind: "openai", baseUrl: "https://api.openai.com/v1" }, { kind: "openai", baseUrl: "https://attacker.example/v1" })).toBe(false);
    expect(sameProviderEndpoint({ kind: "openai", baseUrl: "http://localhost:1234/v1" }, { kind: "openai", baseUrl: "http://localhost:1235/v1" })).toBe(false);
  });
});
