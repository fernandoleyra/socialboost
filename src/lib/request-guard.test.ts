import { describe, expect, it } from "vitest";
import { allowedHosts, isAllowedLocalHost, isCrossSiteWrite } from "./request-guard";

const h = (init: Record<string, string>) => new Headers(init);

describe("isAllowedLocalHost", () => {
  it("accepts loopback names with or without a port", () => {
    for (const host of ["localhost:3000", "LOCALHOST", "127.0.0.1:3200", "[::1]:3000", "studio.localhost:3000"]) {
      expect(isAllowedLocalHost(host)).toBe(true);
    }
  });

  it("refuses LAN addresses, rebinding names and junk", () => {
    for (const host of ["192.168.1.20:3000", "rebind.attacker.example:3200", "localhost.attacker.example", "evil@localhost", "", null]) {
      expect(isAllowedLocalHost(host)).toBe(false);
    }
  });

  it("accepts hosts listed in SOCIALBOOST_ALLOWED_HOSTS", () => {
    const extra = allowedHosts(" studio.lan , 192.168.1.20:3000,");
    expect(extra).toEqual(["studio.lan", "192.168.1.20"]);
    expect(isAllowedLocalHost("192.168.1.20:3000", extra)).toBe(true);
    expect(isAllowedLocalHost("Studio.LAN", extra)).toBe(true);
    expect(isAllowedLocalHost("192.168.1.21:3000", extra)).toBe(false);
  });
});

describe("isCrossSiteWrite", () => {
  it("never blocks reads", () => {
    expect(isCrossSiteWrite("GET", h({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }))).toBe(false);
    expect(isCrossSiteWrite("HEAD", h({ "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("trusts Sec-Fetch-Site when the browser sends it", () => {
    expect(isCrossSiteWrite("POST", h({ "sec-fetch-site": "cross-site", host: "localhost:3000" }))).toBe(true);
    expect(isCrossSiteWrite("POST", h({ "sec-fetch-site": "same-site", host: "localhost:3000" }))).toBe(true);
    expect(isCrossSiteWrite("POST", h({ "sec-fetch-site": "same-origin", host: "localhost:3000" }))).toBe(false);
    // Behind a reverse proxy that rewrites Host, Sec-Fetch-Site still says same-origin.
    expect(isCrossSiteWrite("PUT", h({ "sec-fetch-site": "same-origin", origin: "https://sb.example.com", host: "127.0.0.1:3000" }))).toBe(false);
  });

  it("falls back to comparing Origin with Host for older browsers", () => {
    expect(isCrossSiteWrite("POST", h({ origin: "https://evil.example", host: "localhost:3000" }))).toBe(true);
    expect(isCrossSiteWrite("POST", h({ origin: "null", host: "localhost:3000" }))).toBe(true);
    expect(isCrossSiteWrite("POST", h({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(false);
    expect(isCrossSiteWrite("POST", h({ origin: "https://sb.example.com", host: "app:3000", "x-forwarded-host": "sb.example.com" }))).toBe(false);
  });

  it("lets scripts without browser headers through (they can't use the browser's session)", () => {
    expect(isCrossSiteWrite("POST", h({ host: "localhost:3000" }))).toBe(false);
  });
});
