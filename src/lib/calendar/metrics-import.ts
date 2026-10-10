/**
 * Metrics CSV import. Pure, unit-tested.
 *
 * Individuals can't read post analytics through the API (research 05 §10), so results come in by
 * hand or as a CSV: a sheet from LinkedIn's creator analytics export (saved as CSV), or anything
 * with a post URL or a date plus impressions / reactions / comments / reposts. Headers are matched
 * by normalized alias, never by position. Rows match posts by LinkedIn URL (any shared post id),
 * else by publish day in the profile's time zone when exactly one post went out that day (±1 day).
 */

import Papa from "papaparse";
import { extractPostIds } from "./linkedin-format";
import { addDays, dayKeyOf, safeTimezone } from "./time";

export type MetricsRow = {
  line: number;
  url: string | null;
  date: string | null;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
};

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES: Record<keyof Omit<MetricsRow, "line">, string[]> = {
  url: ["url", "posturl", "postlink", "link", "sharelink", "permalink", "linkedinurl", "posturn", "urn"],
  date: ["date", "postdate", "publishdate", "publisheddate", "postpublishdate", "publishedat", "createddate", "created", "posted", "postedat", "day"],
  impressions: ["impressions", "views", "postimpressions", "totalimpressions"],
  reactions: ["reactions", "likes", "totalreactions", "reactionscount"],
  comments: ["comments", "totalcomments", "commentscount"],
  reposts: ["reposts", "shares", "reshares", "totalreposts", "repostscount"],
};

/** "1,234" → 1234, "1.2K" → 1200, "3 412" → 3412, "" → null. */
export function parseCount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/[\s  ']/g, "");
  if (!s || s === "-" || s === "–") return null;
  const suffix = /([kmb])$/i.exec(s);
  let mult = 1;
  if (suffix) {
    mult = { k: 1e3, m: 1e6, b: 1e9 }[suffix[1].toLowerCase() as "k" | "m" | "b"];
    s = s.slice(0, -1);
    s = s.replace(",", ".");
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    s = s.replace(/[.,]/g, "");
  } else {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * mult);
}

/**
 * Dates as exported by spreadsheets: ISO, "MM/DD/YYYY" (LinkedIn's US default; DD/MM when the
 * first part is > 12), "DD.MM.YYYY", or an Excel serial day number. Returns a `YYYY-MM-DD` key.
 */
export function parseLooseDate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const valid = (y: number, m: number, d: number) => {
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const a = +m[1];
    const b = +m[2];
    return a > 12 ? valid(y, b, a) : valid(y, a, b);
  }
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(s);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial > 30000 && serial < 80000) {
      const t = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
    }
  }
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export type ParsedMetricsCsv = { rows: MetricsRow[]; headers: string[]; errors: string[] };

type ColumnKey = keyof typeof ALIASES;
type ColumnMap = Record<ColumnKey, number>;
const COLUMN_KEYS = Object.keys(ALIASES) as ColumnKey[];

/**
 * Column positions per table in a header row. LinkedIn's TOP POSTS sheet puts two tables side by
 * side (top posts by engagements, top posts by impressions), each with its own URL column, and the
 * same line holds two different posts. So every URL column starts a table of its own; columns
 * before the first URL column belong to the first table.
 */
function tablesIn(header: string[]): ColumnMap[] {
  const h = header.map((c) => norm(String(c)));
  const urlCols = h.flatMap((x, i) => (ALIASES.url.includes(x) ? [i] : []));
  const bounds = urlCols.length > 1 ? urlCols.map((start, k) => [k === 0 ? 0 : start, urlCols[k + 1] ?? h.length]) : [[0, h.length]];
  return bounds
    .map(([from, to]) => {
      const map = Object.fromEntries(COLUMN_KEYS.map((k) => [k, -1])) as ColumnMap;
      for (let i = from; i < to; i++) {
        const key = COLUMN_KEYS.find((k) => ALIASES[k].includes(h[i]));
        if (key && map[key] < 0) map[key] = i;
      }
      return map;
    })
    .filter((m) => [m.impressions, m.reactions, m.comments, m.reposts].some((x) => x >= 0) && (m.url >= 0 || m.date >= 0));
}

const METRIC_KEYS = ["impressions", "reactions", "comments", "reposts"] as const;

export function parseMetricsCsv(csv: string): ParsedMetricsCsv {
  const text = csv.replace(/^﻿/, "");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  const all = parsed.data.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim()));
  const errors: string[] = [];
  // The header is the first row (within the first 10) that names a URL or date column and at least one metric column.
  let headerAt = -1;
  let tables: ColumnMap[] = [];
  for (let i = 0; i < Math.min(10, all.length); i++) {
    const found = tablesIn(all[i]);
    if (found.length) {
      headerAt = i;
      tables = found;
      break;
    }
  }
  if (headerAt < 0) {
    errors.push("Couldn't find the header row. It needs a post URL or date column and at least one of: impressions, reactions, comments, reposts.");
    return { rows: [], headers: all[0]?.map(String) ?? [], errors };
  }
  const cell = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const rows: MetricsRow[] = [];
  // Side-by-side tables can list the same post twice: merge those by post id, never by line.
  const byPost = new Map<string, MetricsRow>();
  for (let i = headerAt + 1; i < all.length; i++) {
    const r = all[i];
    for (const idx of tables) {
      const row: MetricsRow = {
        line: i + 1,
        url: cell(r, idx.url) || null,
        date: cell(r, idx.date) || null,
        impressions: parseCount(cell(r, idx.impressions)),
        reactions: parseCount(cell(r, idx.reactions)),
        comments: parseCount(cell(r, idx.comments)),
        reposts: parseCount(cell(r, idx.reposts)),
      };
      if (!row.url && !row.date) continue;
      if (METRIC_KEYS.every((k) => row[k] === null)) continue;
      const postKey = tables.length > 1 && row.url ? (extractPostIds(row.url)[0] ?? row.url) : null;
      const seen = postKey ? byPost.get(postKey) : undefined;
      if (seen) {
        for (const k of METRIC_KEYS) if (seen[k] === null) seen[k] = row[k];
        if (!seen.date) seen.date = row.date;
        continue;
      }
      if (postKey) byPost.set(postKey, row);
      rows.push(row);
    }
  }
  if (!rows.length) errors.push("The file has a header but no rows with numbers.");
  return { rows, headers: all[headerAt].map(String), errors };
}

export type MatchablePost = { id: string; linkedinUrl: string | null; linkedinUrn: string | null; publishedAt: string | null };
export type MetricsMatch = { postId: string; row: MetricsRow; by: "url" | "date" };
export type MetricsMiss = { row: MetricsRow; reason: string };

export function matchMetricsRows(rows: MetricsRow[], posts: MatchablePost[], timezone: string): { matches: MetricsMatch[]; unmatched: MetricsMiss[] } {
  const tz = safeTimezone(timezone);
  const published = posts.filter((p) => p.publishedAt);
  const idsOf = new Map(published.map((p) => [p.id, new Set([...extractPostIds(p.linkedinUrn), ...extractPostIds(p.linkedinUrl)])]));
  const byDay = new Map<string, MatchablePost[]>();
  for (const p of published) {
    const key = dayKeyOf(p.publishedAt!, tz);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(p);
  }
  const used = new Set<string>();
  const matches: MetricsMatch[] = [];
  const unmatched: MetricsMiss[] = [];

  for (const row of rows) {
    const rowIds = extractPostIds(row.url);
    if (rowIds.length) {
      const hit = published.find((p) => rowIds.some((id) => idsOf.get(p.id)!.has(id)));
      if (hit) {
        if (used.has(hit.id)) unmatched.push({ row, reason: "Another row already matched this post." });
        else {
          used.add(hit.id);
          matches.push({ postId: hit.id, row, by: "url" });
        }
        continue;
      }
    }
    const key = parseLooseDate(row.date);
    if (!key) {
      unmatched.push({ row, reason: rowIds.length ? "No published post has this URL, and the row has no usable date." : "No post URL or readable date." });
      continue;
    }
    const candidates = (k: string) => (byDay.get(k) ?? []).filter((p) => !used.has(p.id));
    let pool = candidates(key);
    if (pool.length === 0) pool = [...candidates(addDays(key, -1)), ...candidates(addDays(key, 1))];
    if (pool.length === 1) {
      used.add(pool[0].id);
      matches.push({ postId: pool[0].id, row, by: "date" });
    } else if (pool.length === 0) {
      unmatched.push({ row, reason: `No post published around ${key}.` });
    } else {
      unmatched.push({ row, reason: `${pool.length} posts went out around ${key}. Add the post URL to tell them apart.` });
    }
  }
  return { matches, unmatched };
}
