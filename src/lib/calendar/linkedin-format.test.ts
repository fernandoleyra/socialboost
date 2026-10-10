import { describe, expect, it } from "vitest";
import {
  altTextFor,
  buildAuthorizeUrl,
  buildPostBody,
  describeLinkedInError,
  extractPostIds,
  isValidApiVersion,
  linkedinComposerUrl,
  normalizeLinkedInPostUrl,
  postUrlFromUrn,
  publishingMarker,
  publishingSince,
  toLittleText,
  tokenStatus,
  urnFromPostUrl,
} from "./linkedin-format";

describe("toLittleText", () => {
  it("escapes all 15 reserved characters", () => {
    expect(toLittleText("a|b{c}d@e[f]g(h)i<j>k\\l*m_n~o")).toBe("a\\|b\\{c\\}d\\@e\\[f\\]g\\(h\\)i\\<j\\>k\\\\l\\*m\\_n\\~o");
  });

  it("keeps real hashtags and escapes the rest", () => {
    expect(toLittleText("Three years ago I almost quit (again).\n\n#leadership #AI")).toBe("Three years ago I almost quit \\(again\\).\n\n#leadership #AI");
    expect(toLittleText("We're #1 in Zurich")).toBe("We're \\#1 in Zurich");
    expect(toLittleText("mid#word")).toBe("mid\\#word");
    expect(toLittleText("#data_science")).toBe("#data\\_science");
    expect(toLittleText("(#tag)")).toBe("\\(#tag\\)");
  });

  it("normalizes line endings and can escape hashtags too", () => {
    expect(toLittleText("a\r\nb\rc")).toBe("a\nb\nc");
    expect(toLittleText("#tag", { keepHashtags: false })).toBe("\\#tag");
  });

  it("produces the documented wire format after JSON encoding", () => {
    expect(JSON.stringify({ commentary: toLittleText("quit (again)") })).toBe('{"commentary":"quit \\\\(again\\\\)"}');
  });
});

describe("OAuth helpers", () => {
  it("builds the authorize URL with %20-separated scopes", () => {
    const url = buildAuthorizeUrl({ clientId: "abc", redirectUri: "http://localhost:3000/api/linkedin/callback", state: "s1" });
    expect(url.startsWith("https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=abc")).toBe(true);
    expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Flinkedin%2Fcallback");
    expect(url).toContain("scope=openid%20profile%20w_member_social");
    expect(url).toContain("state=s1");
  });

  it("validates API versions", () => {
    expect(isValidApiVersion("202609")).toBe(true);
    expect(isValidApiVersion("202613")).toBe(false);
    expect(isValidApiVersion("2026-09")).toBe(false);
  });

  it("reports token status", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    expect(tokenStatus("2026-12-09T00:00:00Z", now)).toEqual({ expired: false, daysLeft: 60, expiringSoon: false });
    expect(tokenStatus("2026-10-13T00:00:00Z", now)).toEqual({ expired: false, daysLeft: 3, expiringSoon: true });
    expect(tokenStatus("2026-10-09T00:00:00Z", now).expired).toBe(true);
    expect(tokenStatus(null, now).expired).toBe(true);
  });
});

describe("post body", () => {
  it("builds a text post", () => {
    const body = buildPostBody({ author: "urn:li:person:abc", text: "  Hello (world)  " });
    expect(body).toEqual({
      author: "urn:li:person:abc",
      commentary: "Hello \\(world\\)",
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    });
  });

  it("attaches a single image with alt text", () => {
    const body = buildPostBody({ author: "urn:li:person:abc", text: "Hi", image: { urn: "urn:li:image:X", altText: "Me at the whiteboard" } });
    expect(body.content).toEqual({ media: { id: "urn:li:image:X", altText: "Me at the whiteboard" } });
    expect(buildPostBody({ author: "u", text: "x", image: { urn: "urn:li:image:Y", altText: "  " } }).content).toEqual({ media: { id: "urn:li:image:Y" } });
  });

  it("keeps alt text under 120 characters", () => {
    expect(altTextFor({ caption: "A whiteboard", userNote: "" })).toBe("A whiteboard");
    expect(altTextFor({ caption: "x", userNote: "My note" })).toBe("My note");
    const long = altTextFor({ caption: "word ".repeat(60) });
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith("…")).toBe(true);
    expect(altTextFor(null)).toBe("");
  });
});

describe("URLs and ids", () => {
  it("builds the public URL from a URN", () => {
    expect(postUrlFromUrn("urn:li:share:6844785523593134080")).toBe("https://www.linkedin.com/feed/update/urn:li:share:6844785523593134080/");
  });

  it("extracts post ids from URNs and URLs", () => {
    expect(extractPostIds("urn:li:share:6844785523593134080")).toEqual(["6844785523593134080"]);
    expect(extractPostIds("https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A7123456789012345678/")).toEqual(["7123456789012345678"]);
    expect(extractPostIds("https://www.linkedin.com/posts/ana-silva_hiring-activity-7123456789012345678-AbCd?utm_source=share")).toEqual(["7123456789012345678"]);
    expect(extractPostIds("https://example.com/123")).toEqual([]);
    expect(extractPostIds(null)).toEqual([]);
  });

  it("accepts only LinkedIn URLs when marking a post as posted by hand", () => {
    expect(normalizeLinkedInPostUrl("linkedin.com/feed/update/urn:li:activity:7123456789012345678/?utm_source=x")).toBe("https://linkedin.com/feed/update/urn:li:activity:7123456789012345678/");
    expect(normalizeLinkedInPostUrl("https://evil.com/linkedin.com")).toBeNull();
    expect(normalizeLinkedInPostUrl("")).toBeNull();
    expect(urnFromPostUrl("https://www.linkedin.com/posts/ana_x-activity-7123456789012345678-AbCd")).toBe("urn:li:activity:7123456789012345678");
    expect(urnFromPostUrl("https://www.linkedin.com/feed/update/urn:li:share:6844785523593134080/")).toBe("urn:li:share:6844785523593134080");
    expect(urnFromPostUrl("https://www.linkedin.com/in/ana")).toBeNull();
  });

  it("prefills the composer only for texts that fit in a URL comfortably", () => {
    expect(linkedinComposerUrl("Hi there")).toBe("https://www.linkedin.com/feed/?shareActive=true&text=Hi%20there");
    expect(linkedinComposerUrl("x".repeat(2600))).toBe("https://www.linkedin.com/feed/?shareActive=true");
  });
});

describe("errors and publish markers", () => {
  it("maps API errors to actionable messages", () => {
    expect(describeLinkedInError(401)).toMatchObject({ reconnect: true });
    expect(describeLinkedInError(426, "NONEXISTENT_VERSION", null, "202509").message).toContain("202509");
    expect(describeLinkedInError(429).retryable).toBe(true);
    expect(describeLinkedInError(503).retryable).toBe(true);
    expect(describeLinkedInError(400, "FIELD_LENGTH_TOO_LONG").message).toMatch(/too long/);
    expect(describeLinkedInError(400, "INVALID_VALUE_FOR_FIELD", "bad author").message).toBe("LinkedIn returned 400 INVALID_VALUE_FOR_FIELD: bad author");
  });

  it("round-trips the in-flight marker", () => {
    const at = new Date("2026-10-10T08:30:00.000Z");
    expect(publishingSince(publishingMarker(at))?.toISOString()).toBe(at.toISOString());
    expect(publishingSince("Some other error")).toBeNull();
    expect(publishingSince(null)).toBeNull();
  });
});
