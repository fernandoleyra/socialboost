/**
 * Integration test for M6 (calendar, publishing, insights) route handlers and the scheduler
 * against a throwaway SQLite database. LinkedIn's API is replaced by a fetch stub that checks
 * the requests the way LinkedIn would (headers, little-text escaping, URNs).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-m6-"));
process.env.SOCIALBOOST_DATA_DIR = dir;
process.env.SOCIALBOOST_DISABLE_SCHEDULER = "1";

type Repo = typeof import("@/lib/repo");
let repo: Repo;
let db: typeof import("@/lib/db");
let calendarRoute: typeof import("@/app/api/calendar/route");
let planRoute: typeof import("@/app/api/calendar/plan/route");
let moveRoute: typeof import("@/app/api/calendar/move/route");
let icsRoute: typeof import("@/app/api/calendar/ics/route");
let publishRoute: typeof import("@/app/api/posts/[id]/publish/route");
let metricsRoute: typeof import("@/app/api/posts/[id]/metrics/route");
let insightsRoute: typeof import("@/app/api/insights/route");
let importRoute: typeof import("@/app/api/insights/import/route");
let weightsRoute: typeof import("@/app/api/insights/apply-weights/route");
let linkedinRoute: typeof import("@/app/api/linkedin/route");
let tokenRoute: typeof import("@/app/api/linkedin/token/route");
let connectRoute: typeof import("@/app/api/linkedin/connect/route");
let callbackRoute: typeof import("@/app/api/linkedin/callback/route");
let scheduler: typeof import("@/lib/scheduler");
let profileId: string;

const post = (url: string, body: unknown) => new Request(`http://localhost:3000${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const put = (url: string, body: unknown) => new Request(`http://localhost:3000${url}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (url: string) => new Request(`http://localhost:3000${url}`, { headers: { host: "localhost:3000" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

type LinkedInCall = { url: string; method: string; headers: Record<string, string>; body: unknown };
const liCalls: LinkedInCall[] = [];
let failPostsWith: number | null = null;

const realFetch = globalThis.fetch;
function stubLinkedIn() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init?.body ? "<binary>" : null;
    liCalls.push({ url, method: init?.method ?? "GET", headers, body });
    if (url === "https://api.linkedin.com/v2/userinfo") {
      if (headers.authorization !== "Bearer good-token-000000000000") return new Response("{}", { status: 401 });
      return Response.json({ sub: "abc123", name: "Ana Silva", picture: "https://media.licdn.com/ana.jpg" });
    }
    if (url === "https://www.linkedin.com/oauth/v2/accessToken") return Response.json({ access_token: "good-token-000000000000", expires_in: 5184000 });
    if (url === "https://api.linkedin.com/rest/images?action=initializeUpload") {
      return Response.json({ value: { uploadUrl: "https://www.linkedin.com/dms-uploads/upload-1", image: "urn:li:image:IMG1", uploadUrlExpiresAt: Date.now() + 60_000 } });
    }
    if (url === "https://www.linkedin.com/dms-uploads/upload-1") return new Response(null, { status: 201 });
    if (url === "https://api.linkedin.com/rest/posts") {
      if (failPostsWith) return Response.json({ status: failPostsWith, code: "NONEXISTENT_VERSION", message: "Requested version 202509 is not active" }, { status: failPostsWith });
      return new Response(null, { status: 201, headers: { "x-restli-id": `urn:li:share:7${String(liCalls.length).padStart(18, "0")}` } });
    }
    return realFetch(input, init);
  });
}

beforeAll(async () => {
  repo = await import("@/lib/repo");
  db = await import("@/lib/db");
  calendarRoute = await import("@/app/api/calendar/route");
  planRoute = await import("@/app/api/calendar/plan/route");
  moveRoute = await import("@/app/api/calendar/move/route");
  icsRoute = await import("@/app/api/calendar/ics/route");
  publishRoute = await import("@/app/api/posts/[id]/publish/route");
  metricsRoute = await import("@/app/api/posts/[id]/metrics/route");
  insightsRoute = await import("@/app/api/insights/route");
  importRoute = await import("@/app/api/insights/import/route");
  weightsRoute = await import("@/app/api/insights/apply-weights/route");
  linkedinRoute = await import("@/app/api/linkedin/route");
  tokenRoute = await import("@/app/api/linkedin/token/route");
  connectRoute = await import("@/app/api/linkedin/connect/route");
  callbackRoute = await import("@/app/api/linkedin/callback/route");
  scheduler = await import("@/lib/scheduler");

  const profile = repo.createProfile({ name: "Ana Silva", headline: "Founder", timezone: "Europe/Zurich" });
  profileId = profile.id;
  const { StrategySchema } = await import("@/lib/types");
  repo.saveStrategy(
    profileId,
    StrategySchema.parse({
      pillars: [
        { id: "lessons", name: "Founder lessons", weight: 50, color: "blue" },
        { id: "hiring", name: "Hiring", weight: 50, color: "green" },
      ],
      cadence: { postsPerWeek: 3, days: [2, 3, 4], time: "08:30" },
    }),
  );
  const mem = (title: string, pillar: string, strength = 3) =>
    repo.createMemory(profileId, { title, summary: title, story: `${title}. A real story.`, when: "", place: "", people: [], emotions: [], details: [], quotes: [], lesson: "", pillar, tags: [], angles: [], strength });
  mem("Lost our first client", "lessons", 5);
  mem("The intern who fixed billing", "hiring", 4);
  mem("Why I stopped reading CVs", "hiring", 3);
  mem("Quitting the bank job", "lessons", 2);
  stubLinkedIn();
});

afterAll(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("auto-plan", () => {
  it("previews without writing, then fills open slots with unused stories", async () => {
    const dry = await (await planRoute.POST(post("/api/calendar/plan", { weeks: 2, dryRun: true }))).json();
    expect(dry.preview.openSlots).toBeGreaterThanOrEqual(5);
    expect(dry.preview.items).toHaveLength(4);
    expect(dry.created).toEqual([]);
    expect(repo.listPosts(profileId)).toHaveLength(0);
    // Pillars alternate when possible.
    const pillars = dry.preview.items.map((i: { pillar: string }) => i.pillar);
    for (let i = 1; i < pillars.length; i++) expect(pillars[i]).not.toBe(pillars[i - 1]);

    const res = await planRoute.POST(post("/api/calendar/plan", { weeks: 2 }));
    expect(res.status).toBe(201);
    const real = await res.json();
    expect(real.created).toHaveLength(4);
    const posts = repo.listPosts(profileId);
    expect(posts.every((p) => p.status === "idea" && p.scheduledAt && p.memoryId)).toBe(true);
    // Slots are 08:30 Zurich time.
    expect(real.created[0].time).toBe("08:30");

    // Running it again finds no unused stories.
    const again = await (await planRoute.POST(post("/api/calendar/plan", { weeks: 2, dryRun: true }))).json();
    expect(again.preview.items).toHaveLength(0);
    expect(again.preview.readyStories).toBe(0);
  });

  it("shows posts and open slots on the calendar", async () => {
    const data = await (await calendarRoute.GET(get("/api/calendar"))).json();
    expect(data.timezone).toBe("Europe/Zurich");
    expect(data.posts.length).toBe(4);
    expect(data.posts[0]).toMatchObject({ state: "idea", time: "08:30" });
    expect(data.slots.some((s: { taken: boolean }) => !s.taken)).toBe(true);
    expect(data.icsPath).toMatch(/^\/api\/calendar\/ics\?profile=.+&token=[0-9a-f]{32}$/);
    expect(data.linkedin.connected).toBe(false);
  });
});

describe("moving posts", () => {
  it("keeps ideas as plans, schedules approved posts, refuses the past", async () => {
    const [idea, other] = repo.listPosts(profileId);
    const future = new Date(Date.now() + 9 * 86_400_000).toISOString();
    const moved = await (await moveRoute.POST(post("/api/calendar/move", { postId: idea.id, scheduledAt: future }))).json();
    expect(moved.post.status).toBe("idea");

    repo.updatePost(other.id, { body: "We refunded €84k (in one afternoon).\n\nHere is why.", status: "approved", error: "Old message" });
    const scheduled = await (await moveRoute.POST(post("/api/calendar/move", { postId: other.id, scheduledAt: future }))).json();
    expect(scheduled.post).toMatchObject({ status: "scheduled", state: "scheduled", error: null });

    const past = await moveRoute.POST(post("/api/calendar/move", { postId: idea.id, scheduledAt: new Date(Date.now() - 86_400_000).toISOString() }));
    expect(past.status).toBe(400);

    const off = await (await moveRoute.POST(post("/api/calendar/move", { postId: other.id, scheduledAt: null }))).json();
    expect(off.post).toMatchObject({ status: "approved", scheduledAt: null });
  });
});

describe("calendar feed", () => {
  it("serves an iCalendar feed only with the right key", async () => {
    const data = await (await calendarRoute.GET(get("/api/calendar"))).json();
    const ok = await icsRoute.GET(get(data.icsPath));
    expect(ok.headers.get("content-type")).toMatch(/text\/calendar/);
    const text = await ok.text();
    expect(text).toContain("BEGIN:VEVENT");
    expect(text).toContain("http://localhost:3000/studio/");
    const bad = await icsRoute.GET(get(data.icsPath.replace(/token=\w+/, "token=nope")));
    expect(bad.status).toBe(404);
    // Links made before `token` existed carried the secret in `key`.
    expect((await icsRoute.GET(get(data.icsPath.replace("token=", "key=")))).status).toBe(200);
    const rotated = await (await icsRoute.POST()).json();
    expect(rotated.path).not.toBe(data.icsPath);
    expect((await icsRoute.GET(get(data.icsPath))).status).toBe(404);
  });

  it("never puts a password-derived value in the feed link", async () => {
    process.env.SOCIALBOOST_PASSWORD = "correct horse";
    try {
      const data = await (await calendarRoute.GET(get("/api/calendar"))).json();
      const url = new URL(data.icsPath, "http://localhost:3000");
      expect(url.searchParams.has("key")).toBe(false);
      expect(url.searchParams.get("token")).toMatch(/^[0-9a-f]{32}$/);
      expect((await icsRoute.GET(get(data.icsPath))).status).toBe(200);
    } finally {
      delete process.env.SOCIALBOOST_PASSWORD;
    }
  });
});

describe("LinkedIn", () => {
  it("saves app config without echoing the secret and builds the authorize redirect", async () => {
    const res = await (await linkedinRoute.PUT(put("/api/linkedin", { clientId: "client-1", clientSecret: "s3cret" }))).json();
    expect(res.config).toMatchObject({ clientId: "client-1", hasSecret: true, ready: true, apiVersion: "202609", redirectUri: "http://localhost:3000/api/linkedin/callback" });
    expect(JSON.stringify(res)).not.toContain("s3cret");
    const bad = await linkedinRoute.PUT(put("/api/linkedin", { apiVersion: "2026-09" }));
    expect(bad.status).toBe(400);

    const redirect = await connectRoute.GET(get("/api/linkedin/connect"));
    const location = redirect.headers.get("location")!;
    expect(location).toMatch(/^https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization\?response_type=code&client_id=client-1/);
    const state = new URL(location).searchParams.get("state")!;

    const wrong = await callbackRoute.GET(get(`/api/linkedin/callback?code=abc&state=forged`));
    expect(wrong.headers.get("location")).toMatch(/settings\/linkedin\?error=/);

    // The forged attempt didn't consume the real state? It did: states are single-use, so start again.
    const again = new URL((await connectRoute.GET(get("/api/linkedin/connect"))).headers.get("location")!).searchParams.get("state")!;
    expect(again).not.toBe(state);
    const back = await callbackRoute.GET(get(`/api/linkedin/callback?code=abc&state=${again}`));
    expect(back.headers.get("location")).toBe("http://localhost:3000/settings/linkedin?connected=1");
    const tokenCall = liCalls.find((c) => c.url.endsWith("/oauth/v2/accessToken"))!;
    expect(tokenCall.body).toMatchObject({ grant_type: "authorization_code", code: "abc", client_id: "client-1", client_secret: "s3cret" });

    const status = await (await linkedinRoute.GET(get("/api/linkedin"))).json();
    expect(status.account).toMatchObject({ memberUrn: "urn:li:person:abc123", name: "Ana Silva", expired: false });
    expect(status.account.daysLeft).toBeGreaterThanOrEqual(59);
  });

  it("rejects a bad pasted token", async () => {
    const res = await tokenRoute.POST(post("/api/linkedin/token", { token: "bad-token-000000000000000" }));
    expect(res.status).toBe(400);
  });

  it("publishes an approved post with its photo, escaping reserved characters", async () => {
    const target = repo.listPosts(profileId).find((p) => p.status === "approved")!;
    const photoId = "ph_test";
    await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#88aaff" } }).jpeg().toFile(path.join(db.UPLOAD_DIR, `${photoId}.jpg`));
    repo.insertPhoto({ id: photoId, profileId, memoryId: target.memoryId, filename: `${photoId}.jpg`, originalName: "x.jpg", mime: "image/jpeg", width: 800, height: 1000, caption: "A whiteboard full of numbers", userNote: "", isCandid: true });
    repo.updatePost(target.id, { photoId });

    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const pending = publishRoute.POST(post(`/api/posts/${target.id}/publish`, {}), ctx(target.id));
      let settled = false;
      void pending.finally(() => (settled = true));
      // File reads and sharp are real I/O; keep nudging the fake clock until the 4 s image wait passes.
      while (!settled) {
        await vi.advanceTimersByTimeAsync(1000);
        await new Promise((r) => setImmediate(r));
      }
      const res = await pending;
      expect(res.status).toBe(200);
      const { post: published } = await res.json();
      expect(published.status).toBe("published");
      expect(published.linkedinUrn).toMatch(/^urn:li:share:\d+$/);
      expect(published.linkedinUrl).toBe(`https://www.linkedin.com/feed/update/${published.linkedinUrn}/`);
    } finally {
      vi.useRealTimers();
    }
    const create = liCalls.find((c) => c.url === "https://api.linkedin.com/rest/posts")!;
    expect(create.headers["linkedin-version"]).toBe("202609");
    expect(create.headers["x-restli-protocol-version"]).toBe("2.0.0");
    expect(create.body).toMatchObject({
      author: "urn:li:person:abc123",
      commentary: "We refunded €84k \\(in one afternoon\\).\n\nHere is why.",
      content: { media: { id: "urn:li:image:IMG1", altText: "A whiteboard full of numbers" } },
      lifecycleState: "PUBLISHED",
      visibility: "PUBLIC",
    });
    const upload = liCalls.find((c) => c.url.includes("dms-uploads"))!;
    expect(upload.headers.authorization).toBe("Bearer good-token-000000000000");
    expect(repo.getMemory(target.memoryId!)!.status).toBe("used");

    const again = await publishRoute.POST(post(`/api/posts/${target.id}/publish`, {}), ctx(target.id));
    expect(again.status).toBe(409);
  });

  it("refuses to publish drafts and records API failures on the post", async () => {
    const idea = repo.listPosts(profileId).find((p) => p.status === "idea")!;
    expect((await publishRoute.POST(post(`/api/posts/${idea.id}/publish`, {}), ctx(idea.id))).status).toBe(409);

    repo.updatePost(idea.id, { body: "A short approved post.", status: "approved", photoId: null });
    failPostsWith = 426;
    const res = await publishRoute.POST(post(`/api/posts/${idea.id}/publish`, {}), ctx(idea.id));
    failPostsWith = null;
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/retired API version/);
    const after = repo.getPost(idea.id)!;
    expect(after.status).toBe("approved");
    expect(after.error).toMatch(/retired/);

    // A 5xx on create may still have posted: park it for a human instead of allowing a blind retry.
    failPostsWith = 503;
    const ambiguous = await publishRoute.POST(post(`/api/posts/${idea.id}/publish`, {}), ctx(idea.id));
    failPostsWith = null;
    expect(ambiguous.status).toBe(504);
    expect(repo.getPost(idea.id)!.error).toMatch(/didn't confirm/);
    expect((await publishRoute.POST(post(`/api/posts/${idea.id}/publish`, {}), ctx(idea.id))).status).toBe(409);
    repo.updatePost(idea.id, { error: null });
  });
});

describe("scheduler", () => {
  it("publishes due posts once, marks long-missed ones, and leaves others alone", async () => {
    const [a, b] = repo.listPosts(profileId).filter((p) => p.status === "idea");
    const now = new Date();
    repo.updatePost(a.id, { body: "Due now.", status: "scheduled", scheduledAt: new Date(now.getTime() - 60_000).toISOString(), error: null });
    repo.updatePost(b.id, { body: "Missed while asleep.", status: "scheduled", scheduledAt: new Date(now.getTime() - 5 * 3600_000).toISOString(), error: null });
    const res = await scheduler.schedulerTick(now);
    expect(res).toMatchObject({ published: 1, missed: 1 });
    expect(repo.getPost(a.id)!.status).toBe("published");
    expect(repo.getPost(b.id)!).toMatchObject({ status: "scheduled" });
    expect(repo.getPost(b.id)!.error).toMatch(/missed its time/);
    // Same slot isn't retried on the next tick.
    expect(await scheduler.schedulerTick(now)).toMatchObject({ published: 0, missed: 0 });
  });
});

describe("posted by hand, metrics and insights", () => {
  it("marks posts as posted with a LinkedIn link and stores results", async () => {
    const leftover = repo.listPosts(profileId).find((p) => p.status === "scheduled" || p.status === "approved")!;
    const bad = await publishRoute.POST(post(`/api/posts/${leftover.id}/publish`, { manual: true, url: "https://example.com/x" }), ctx(leftover.id));
    expect(bad.status).toBe(400);
    const res = await (
      await publishRoute.POST(post(`/api/posts/${leftover.id}/publish`, { manual: true, url: "https://www.linkedin.com/posts/ana_x-activity-7333333333333333333-AbCd" }), ctx(leftover.id))
    ).json();
    expect(res.post).toMatchObject({ status: "published", linkedinUrn: "urn:li:activity:7333333333333333333", error: null });

    const m = await (await metricsRoute.PUT(put(`/api/posts/${leftover.id}/metrics`, { impressions: 1200, reactions: 48, comments: 9 }), ctx(leftover.id))).json();
    expect(m.post).toMatchObject({ impressions: 1200, reactions: 48, comments: 9, reposts: null });
    expect(m.post.metricsUpdatedAt).toBeTruthy();

    const notPublished = repo.createPost({ profileId, body: "x", status: "draft" });
    expect((await metricsRoute.PUT(put(`/api/posts/${notPublished.id}/metrics`, { reactions: 1 }), ctx(notPublished.id))).status).toBe(409);
  });

  it("imports results from a CSV by link", async () => {
    const published = repo.listPosts(profileId, { status: "published" });
    const withUrn = published.find((p) => p.linkedinUrn?.startsWith("urn:li:share"))!;
    const csv = `Post URL,Date,Impressions,Reactions,Comments,Reposts\nhttps://www.linkedin.com/feed/update/${withUrn.linkedinUrn}/,,"2,400",96,14,3\nhttps://www.linkedin.com/feed/update/urn:li:activity:7000000000000000000/,,10,1,0,0`;
    const dry = await (await importRoute.POST(post("/api/insights/import", { csv, dryRun: true }))).json();
    expect(dry.matches).toHaveLength(1);
    expect(dry.unmatched).toHaveLength(1);
    expect(dry.applied).toBe(0);
    expect(repo.getPost(withUrn.id)!.reactions).toBeNull();
    const real = await (await importRoute.POST(post("/api/insights/import", { csv, dryRun: false }))).json();
    expect(real.applied).toBe(1);
    expect(repo.getPost(withUrn.id)!).toMatchObject({ impressions: 2400, reactions: 96, comments: 14, reposts: 3 });
  });

  it("aggregates insights and refuses weights until there's enough data", async () => {
    const data = await (await insightsRoute.GET()).json();
    expect(data.insights.totals.published).toBe(3);
    expect(data.insights.totals.measured).toBe(2);
    expect(data.insights.weights.ready).toBe(false);
    const res = await weightsRoute.POST(post("/api/insights/apply-weights", {}));
    expect(res.status).toBe(409);
    const manual = await (await weightsRoute.POST(post("/api/insights/apply-weights", { weights: { lessons: 60, hiring: 40 } }))).json();
    expect(manual.strategy.pillars.map((p: { weight: number }) => p.weight)).toEqual([60, 40]);
    expect((await weightsRoute.POST(post("/api/insights/apply-weights", { weights: { ghost: 10 } }))).status).toBe(400);
  });
});
