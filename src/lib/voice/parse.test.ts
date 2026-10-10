import { describe, expect, it } from "vitest";
import { ImportFormatError, cleanPostText, parseCount, parseExportDate, parseHelperJson, parsePastedPosts, parseSharesCsv } from "./parse";

const LONG_A = "Yesterday at 6:40 a.m. a driver named Joost handed me a paper map of our yard. He had drawn every pothole by hand.";
const LONG_B = "Four reasons warehouse projects die, from what I have seen inside. Nobody owns the result, ten people own a slide each.";

describe("parseCount", () => {
  it("reads LinkedIn-style counts", () => {
    expect(parseCount("1,234")).toBe(1234);
    expect(parseCount("1.234")).toBe(1234);
    expect(parseCount("1.2K")).toBe(1200);
    expect(parseCount("3,5K")).toBe(3500);
    expect(parseCount("2M")).toBe(2_000_000);
    expect(parseCount("12 comments")).toBe(12);
    expect(parseCount(42)).toBe(42);
    expect(parseCount("")).toBeNull();
    expect(parseCount(null)).toBeNull();
    expect(parseCount(-3)).toBeNull();
  });
});

describe("parseExportDate", () => {
  it("treats export timestamps as UTC", () => {
    expect(parseExportDate("2025-01-03 10:00:00 UTC")).toBe("2025-01-03T10:00:00.000Z");
    expect(parseExportDate("2024-05-12 08:15")).toBe("2024-05-12T08:15:00.000Z");
    expect(parseExportDate("2024-05-12")).toBe("2024-05-12T00:00:00.000Z");
  });
  it("falls back to Date parsing and rejects junk", () => {
    expect(parseExportDate("2026-10-08T10:46:05.753Z")).toBe("2026-10-08T10:46:05.753Z");
    expect(parseExportDate("not a date")).toBeNull();
    expect(parseExportDate(undefined)).toBeNull();
  });
});

describe("cleanPostText", () => {
  it("strips LinkedIn UI lines but keeps hashtag-only lines", () => {
    const raw = [LONG_A, "", "hashtag#logistics hashtag#ops", "…see more", "42", "Mara Jensen and 41 others", "7 comments · 3 reposts", "Like", "Comment", "Repost", "Send"].join("\n");
    const { text, truncated } = cleanPostText(raw);
    expect(text).toBe(`${LONG_A}\n\n#logistics #ops`);
    expect(truncated).toBe(true);
  });

  it("drops the author header block of a copied feed post", () => {
    const raw = ["Mara Jensen", "• You", "Warehouse fixer | Logistics consultant", "1w • Edited •", LONG_A].join("\n");
    expect(cleanPostText(raw).text).toBe(LONG_A);
  });

  it("drops header lines that match the author's name and headline", () => {
    const raw = ["Mara Jensen", "Warehouse fixer", LONG_A].join("\n");
    expect(cleanPostText(raw, { headerLines: ["Mara Jensen", "Warehouse fixer"] }).text).toBe(LONG_A);
  });

  it("flags text cut at the see-more fold", () => {
    const { text, truncated } = cleanPostText(`${LONG_A} …see more`);
    expect(text).toBe(LONG_A);
    expect(truncated).toBe(true);
  });

  it("keeps numbers that are part of the post", () => {
    const raw = ["Our numbers this year:", "", "2019", "", "That's when it started. " + LONG_A, "", "And that's it for today, more next week."].join("\n");
    expect(cleanPostText(raw).text).toContain("\n2019\n");
  });
});

describe("cleanPostText keeps what the person wrote", () => {
  it("doesn't mistake a short time line in the post for the author block", () => {
    const post = `I timed my morning routine for a month.\n\n10 min\n\n${LONG_A}`;
    expect(cleanPostText(post).text).toBe(post);
    const post2 = `We shipped it.\n\n24h.\n\n${LONG_B}`;
    expect(cleanPostText(post2).text).toBe(post2);
  });

  it("still drops a bare time line under the author's name", () => {
    expect(cleanPostText(["Mara Jensen", "Warehouse fixer", "1w", LONG_A].join("\n"), { headerLines: ["Mara Jensen"] }).text).toBe(LONG_A);
  });

  it("keeps a closing number when there was no LinkedIn UI around it", () => {
    const post = `My year in one number.\n\n${LONG_A}\n\n2026`;
    expect(cleanPostText(post).text).toBe(post);
  });

  it("is idempotent", () => {
    const raw = ["Mara Jensen", "• You", "1w • Edited •", LONG_A, "", "#ops", "42", "7 comments", "Like", "Comment"].join("\n");
    const once = cleanPostText(raw).text;
    expect(cleanPostText(once).text).toBe(once);
  });
});

describe("parsePastedPosts", () => {
  it("splits on separator lines", () => {
    const r = parsePastedPosts(`${LONG_A}\n---\n${LONG_B}\n***\n${LONG_A} Again, slightly different.`);
    expect(r.posts.map((p) => p.text)).toEqual([LONG_A, LONG_B, `${LONG_A} Again, slightly different.`]);
    expect(r.skipped).toBe(0);
  });

  it("keeps a single post with airy paragraphs whole", () => {
    const one = `${LONG_A}\n\n\n${LONG_B}`;
    expect(parsePastedPosts(one).posts).toHaveLength(1);
  });

  it("splits long pastes on two or more blank lines", () => {
    const block = (n: number) => `${LONG_A} ${"More detail. ".repeat(30)} Post ${n}.`;
    const r = parsePastedPosts([block(1), block(2), block(3)].join("\n\n\n"));
    expect(r.posts).toHaveLength(3);
  });

  it("splits a copied feed on the action bars", () => {
    const feed = [
      "Mara Jensen",
      "• You",
      "Warehouse fixer",
      "1w •",
      LONG_A,
      "42",
      "7 comments",
      "Like Comment Repost Send",
      "Mara Jensen",
      "• You",
      "Warehouse fixer",
      "2d • Edited •",
      LONG_B,
      "…see more",
      "12",
      "Like",
      "Comment",
      "Repost",
      "Send",
    ].join("\n");
    const r = parsePastedPosts(feed);
    expect(r.posts.map((p) => p.text)).toEqual([LONG_A, LONG_B]);
    expect(r.posts[1].truncated).toBe(true);
    expect(r.warnings[0]).toMatch(/cut off/);
  });

  it("de-duplicates and counts short fragments as skipped", () => {
    const r = parsePastedPosts(`${LONG_A}\n---\n${LONG_A}\n---\nToo short.`);
    expect(r.posts).toHaveLength(1);
    expect(r.skipped).toBe(2);
  });

  it("normalizes hashtags copied as hashtag#tag", () => {
    expect(parsePastedPosts(`${LONG_A}\n\nhashtag#AI hashtag#Ops`).posts[0].text).toMatch(/#AI #Ops$/);
  });
});

describe("parseSharesCsv", () => {
  const csv = [
    "﻿Date,ShareLink,ShareCommentary,SharedUrl,MediaUrl,Visibility",
    `2025-01-03 10:00:00 UTC,https://www.linkedin.com/feed/update/urn:li:activity:1,"${LONG_A}\n\nHe said ""nobody asked"". {hashtag|\\#|logistics}",,,PUBLIC`,
    `2025-01-05 09:30:00 UTC,https://www.linkedin.com/feed/update/urn:li:activity:2,,,,PUBLIC`,
    `2025-01-07 08:00:00 UTC,https://www.linkedin.com/feed/update/urn:li:activity:3,"${LONG_B} Thanks @[Joost de Vries](urn:li:person:abc123).",,,CONNECTIONS`,
  ].join("\r\n");

  it("parses multi-line commentary, doubled quotes, little-text markup and dates", () => {
    const r = parseSharesCsv(csv);
    expect(r.posts).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.posts[0].text).toBe(`${LONG_A}\n\nHe said "nobody asked". #logistics`);
    expect(r.posts[0].url).toBe("https://www.linkedin.com/feed/update/urn:li:activity:1");
    expect(r.posts[0].postedAt).toBe("2025-01-03T10:00:00.000Z");
    expect(r.posts[1].text).toBe(`${LONG_B} Thanks Joost de Vries.`);
  });

  it("keeps only web links", () => {
    const r = parseSharesCsv(`Date,ShareLink,ShareCommentary\n2024-01-01,javascript:alert(1),"${LONG_A}"`);
    expect(r.posts[0].url).toBeUndefined();
  });

  it("matches headers by alias, not position or casing", () => {
    const r = parseSharesCsv(`SHARE_COMMENTARY,date\n"${LONG_A}",2024-02-01 12:00:00`);
    expect(r.posts[0].text).toBe(LONG_A);
    expect(r.posts[0].postedAt).toBe("2024-02-01T12:00:00.000Z");
  });

  it("explains what's wrong with the wrong file", () => {
    expect(() => parseSharesCsv("Date,Link,Message\n2024-01-01,x,hello")).toThrow(ImportFormatError);
    expect(() => parseSharesCsv("PK\u0003\u0004binary")).toThrow(/ZIP/);
    expect(() => parseSharesCsv("")).toThrow(/empty/);
    expect(() => parseSharesCsv("Date,ShareLink,ShareCommentary\n2024-01-01,x,")).toThrow(/repost/);
  });
});

describe("parseHelperJson", () => {
  it("reads the helper's posts with counts as strings or numbers", () => {
    const json = JSON.stringify([
      { text: LONG_A, url: "https://www.linkedin.com/feed/update/urn:li:activity:7/", postedAt: "2026-09-17T08:00:00.000Z", reactions: "1,204", comments: 31, reposts: "2", impressions: "12.4K" },
      { text: `${LONG_B} …more`, url: "javascript:alert(1)", reactions: null },
      { text: "" },
    ]);
    const r = parseHelperJson(json);
    expect(r.posts).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.posts[0]).toMatchObject({ reactions: 1204, comments: 31, reposts: 2, impressions: 12400, postedAt: "2026-09-17T08:00:00.000Z" });
    expect(r.posts[1].url).toBeUndefined();
    expect(r.posts[1].truncated).toBe(true);
  });

  it("leaves already-clean texts alone when asked (preview of Shares.csv posts)", () => {
    const text = `${LONG_A}\n\nLike\n\n2026`;
    expect(parseHelperJson(JSON.stringify([{ text }]), { clean: false }).posts[0].text).toBe(text);
    expect(parseHelperJson(JSON.stringify([{ text }])).posts[0].text).not.toContain("Like");
  });

  it("accepts {posts: [...]} and rejects non-JSON", () => {
    expect(parseHelperJson(JSON.stringify({ posts: [{ text: LONG_A }] })).posts).toHaveLength(1);
    expect(() => parseHelperJson("not json")).toThrow(ImportFormatError);
    expect(() => parseHelperJson('{"a":1}')).toThrow(/list of posts/);
  });
});
