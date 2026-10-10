import { describe, expect, it } from "vitest";
import { matchMetricsRows, parseCount, parseLooseDate, parseMetricsCsv } from "./metrics-import";

describe("parseCount", () => {
  it.each([
    ["1,234", 1234],
    ["1.234", 1234],
    ["3 412", 3412],
    ["1.2K", 1200],
    ["2,5k", 2500],
    ["17", 17],
    ["", null],
    ["-", null],
    ["abc", null],
  ])("%s → %s", (raw, n) => {
    expect(parseCount(raw)).toBe(n);
  });
});

describe("parseLooseDate", () => {
  it.each([
    ["2026-10-06", "2026-10-06"],
    ["2026-10-06T07:00:00Z", "2026-10-06"],
    ["10/06/2026", "2026-10-06"],
    ["13/10/2026", "2026-10-13"],
    ["06.10.2026", "2026-10-06"],
    ["46301", "2026-10-06"],
    ["not a date", null],
    ["2026-02-30", null],
  ])("%s → %s", (raw, key) => {
    expect(parseLooseDate(raw)).toBe(key);
  });
});

describe("parseMetricsCsv", () => {
  it("finds the header by alias, even below a title row", () => {
    const csv = [
      "Top posts,,,",
      "Post URL,Post publish date,Impressions,Reactions,Comments,Reposts",
      "https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/,10/06/2026,\"1,204\",48,9,2",
      ",,,,,",
      "https://www.linkedin.com/feed/update/urn:li:activity:7999999999999999999/,10/08/2026,800,,,",
    ].join("\n");
    const parsed = parseMetricsCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ date: "10/06/2026", impressions: 1204, reactions: 48, comments: 9, reposts: 2, line: 3 });
    expect(parsed.rows[1]).toMatchObject({ impressions: 800, reactions: null });
  });

  it("explains a file it can't read", () => {
    expect(parseMetricsCsv("name,age\nAna,40").errors[0]).toMatch(/header row/);
    expect(parseMetricsCsv("Date,Reactions\n").errors[0]).toMatch(/no rows/);
  });
});

describe("matchMetricsRows", () => {
  const posts = [
    { id: "p1", linkedinUrn: "urn:li:share:7123456789012345678", linkedinUrl: null, publishedAt: "2026-10-06T06:30:00Z" },
    { id: "p2", linkedinUrn: null, linkedinUrl: "https://www.linkedin.com/feed/update/urn:li:activity:7222222222222222222/", publishedAt: "2026-10-08T06:30:00Z" },
    { id: "p3", linkedinUrn: null, linkedinUrl: null, publishedAt: "2026-10-01T06:30:00Z" },
    { id: "p4", linkedinUrn: null, linkedinUrl: null, publishedAt: "2026-10-01T15:30:00Z" },
    { id: "p5", linkedinUrn: null, linkedinUrl: null, publishedAt: null },
  ];
  const row = (over: Partial<{ url: string | null; date: string | null }>, line = 2) => ({ line, url: null, date: null, impressions: 100, reactions: 5, comments: 1, reposts: 0, ...over });

  it("matches by any shared post id, then by unique publish day", () => {
    const res = matchMetricsRows(
      [
        row({ url: "https://www.linkedin.com/posts/ana_x-share-7123456789012345678-abc" }),
        row({ url: "https://www.linkedin.com/feed/update/urn:li:activity:7222222222222222222/" }),
        row({ date: "2026-10-07" }), // p2's neighbour day is taken by p2 already → none left
        row({ date: "2026-10-01" }),
        row({ date: "garbage" }),
      ],
      posts,
      "Europe/Zurich",
    );
    expect(res.matches.map((m) => [m.postId, m.by])).toEqual([
      ["p1", "url"],
      ["p2", "url"],
    ]);
    expect(res.unmatched.map((u) => u.reason)).toEqual([
      "No post published around 2026-10-07.",
      "2 posts went out around 2026-10-01. Add the post URL to tell them apart.",
      "No post URL or readable date.",
    ]);
  });

  it("matches a neighbouring day when the export is a day off", () => {
    const res = matchMetricsRows([row({ date: "2026-10-09" })], posts, "UTC");
    expect(res.matches[0]).toMatchObject({ postId: "p2", by: "date" });
  });

  it("never matches the same post twice", () => {
    const res = matchMetricsRows([row({ date: "2026-10-06" }), row({ date: "2026-10-06" })], posts, "UTC");
    expect(res.matches).toHaveLength(1);
    expect(res.unmatched).toHaveLength(1);
  });
});
