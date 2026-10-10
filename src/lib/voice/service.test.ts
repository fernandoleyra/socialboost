import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FetchLike } from "./dma";

/*
 * The LinkedIn (Member Data Portability) import against a throwaway SQLite database and a fake
 * LinkedIn. Model calls are stubbed: embedding answers nothing, so indexing is a no-op.
 */

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-voice-"));
process.env.SOCIALBOOST_DATA_DIR = dataDir;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return { ...actual, chatJson: vi.fn(), embed: vi.fn(async () => null) };
});

type Svc = typeof import("./service");
type Repo = typeof import("@/lib/repo");
type Db = typeof import("@/lib/db");

let svc: Svc;
let repo: Repo;
let db: Db;
let profile: import("@/lib/repo").Profile;

const TOKEN = "AQV-secret-token-1234567890";
const post = (n: number, extra: Record<string, unknown> = {}) => ({
  Date: `2025-02-0${n} 08:30:00`,
  ShareLink: `https://www.linkedin.com/feed/update/urn:li:share:${n}`,
  ShareCommentary: `Post ${n}: on Monday at 7am our night shift found the scanner had been mislabelled for three weeks.`,
  Visibility: "MEMBER_NETWORK",
  ...extra,
});
const repost = { Date: "2025-02-09 08:30:00", ShareLink: "https://www.linkedin.com/feed/update/urn:li:share:9", ShareCommentary: "", SharedUrl: "https://example.com/a" };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const snapshot = (rows: unknown[]) => ({ paging: { start: 0, count: 10, links: [] }, elements: [{ snapshotDomain: "MEMBER_SHARE_INFO", snapshotData: rows }] });
const NO_DATA = { status: 404, message: "No data found for this memberId" };

function linkedIn(pages: unknown[][]): FetchLike {
  return async (url) => {
    const start = Number(new URL(url).searchParams.get("start"));
    return start < pages.length ? json(200, snapshot(pages[start])) : json(404, NO_DATA);
  };
}

beforeAll(async () => {
  repo = await import("@/lib/repo");
  db = await import("@/lib/db");
  svc = await import("./service");
  profile = repo.createProfile({ name: "Ana Torres", headline: "Fractional CFO", language: "en", timezone: "Europe/Madrid" });
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("importFromLinkedIn", () => {
  it("imports own posts from every page, skips bare reposts and repeats, refreshes the fingerprint", async () => {
    const r = await svc.importFromLinkedIn(profile, `Bearer ${TOKEN}`, { fetch: linkedIn([[post(1), post(2), repost], [post(2), post(3)]]) });
    expect(r).toMatchObject({ found: 3, inserted: 3, updated: 0, skipped: 1, pages: 2 });
    expect(r.warnings.some((w) => /reactions or comments/.test(w))).toBe(true);
    expect(r.state.counts.own).toBe(3);
    expect(r.state.profile.stats).not.toBeNull();
    const own = repo.listVoiceSamples(profile.id, "own");
    expect(own.every((s) => s.source === "linkedin")).toBe(true);
    expect(own.map((s) => s.postedAt).sort()).toEqual(["2025-02-01T08:30:00.000Z", "2025-02-02T08:30:00.000Z", "2025-02-03T08:30:00.000Z"]);
    expect(repo.listActivity(profile.id)[0].message).toBe("Imported 3 of your posts from LinkedIn");
  });

  it("skips posts that are already in the library on a second import", async () => {
    const r = await svc.importFromLinkedIn(profile, TOKEN, { fetch: linkedIn([[post(1), post(2), post(3), repost]]) });
    expect(r).toMatchObject({ inserted: 0, skipped: 4, pages: 1 });
    expect(repo.listVoiceSamples(profile.id, "own")).toHaveLength(3);
  });

  it("never stores the token", () => {
    const hits = ["settings", "voice_samples", "voice_profiles", "activity"].flatMap((t) =>
      (db.getDb().prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[]).filter((r) => JSON.stringify(r).includes("secret-token")),
    );
    expect(hits).toEqual([]);
  });

  it("explains a snapshot that isn't ready, a bad token, and an unknown shape", async () => {
    await expect(svc.importFromLinkedIn(profile, TOKEN, { fetch: linkedIn([]) })).rejects.toMatchObject({ status: 404, message: "LinkedIn hasn't sent any posts yet." });
    await expect(svc.importFromLinkedIn(profile, TOKEN, { fetch: async () => json(401, { message: "Invalid access token" }) })).rejects.toMatchObject({ status: 401 });
    await expect(svc.importFromLinkedIn(profile, TOKEN, { fetch: linkedIn([[{ Body: "hello there" }]]) })).rejects.toMatchObject({ status: 502, message: expect.stringContaining("Body") });
    await expect(svc.importFromLinkedIn(profile, "  ", {})).rejects.toMatchObject({ status: 400 });
  });

  it("keeps what came through when LinkedIn fails halfway", async () => {
    let calls = 0;
    const flaky: FetchLike = async () => (calls++ === 0 ? json(200, snapshot([post(4)])) : json(429, { message: "Too many requests" }));
    const r = await svc.importFromLinkedIn(profile, TOKEN, { fetch: flaky });
    expect(r.inserted).toBe(1);
    expect(r.warnings.some((w) => /stopped answering: LinkedIn is limiting/.test(w))).toBe(true);
  });
});

describe("importVoice JSON (import preview)", () => {
  it("labels posts by where they came from", async () => {
    const text = "Last spring a client asked me to cut their reporting from forty pages to one. It took three tries.";
    const r = await svc.importVoice(profile, { kind: "own", format: "json", content: JSON.stringify([{ text }]) });
    expect(r.inserted).toBe(1);
    expect(repo.listVoiceSamples(profile.id, "own").find((s) => s.text === text)?.source).toBe("paste");
  });
});
