/**
 * Cross-module contract: a post approved and scheduled in the Studio (PATCH /api/posts/[id]) shows
 * on the Calendar, is flagged Due without a LinkedIn connection, is published by the scheduler with
 * one, and the story is marked used. Rescheduling clears stale publish messages. Throwaway SQLite;
 * LinkedIn's Posts API is a fetch stub.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-lifecycle-"));
process.env.SOCIALBOOST_DATA_DIR = dir;
process.env.SOCIALBOOST_DISABLE_SCHEDULER = "1";

let repo: typeof import("@/lib/repo");
let postsRoute: typeof import("@/app/api/posts/route");
let postRoute: typeof import("@/app/api/posts/[id]/route");
let calendarRoute: typeof import("@/app/api/calendar/route");
let calendar: typeof import("@/lib/calendar/service");
let format: typeof import("@/lib/calendar/linkedin-format");
let time: typeof import("@/lib/calendar/time");
let linkedin: typeof import("@/lib/linkedin");
let scheduler: typeof import("@/lib/scheduler");
let profile: import("@/lib/repo").Profile;

const HOUR = 3_600_000;
const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://localhost:3000${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, body: unknown) => postRoute.PATCH(req("PATCH", `/api/posts/${id}`, body), ctx(id));

const sent: { url: string; body: { commentary?: string } }[] = [];

beforeAll(async () => {
  repo = await import("@/lib/repo");
  postsRoute = await import("@/app/api/posts/route");
  postRoute = await import("@/app/api/posts/[id]/route");
  calendarRoute = await import("@/app/api/calendar/route");
  calendar = await import("@/lib/calendar/service");
  format = await import("@/lib/calendar/linkedin-format");
  time = await import("@/lib/calendar/time");
  linkedin = await import("@/lib/linkedin");
  scheduler = await import("@/lib/scheduler");

  profile = repo.createProfile({ name: "Ana Silva", timezone: "Europe/Madrid" });
  const { StrategySchema } = await import("@/lib/types");
  repo.saveStrategy(profile.id, StrategySchema.parse({ pillars: [{ id: "lessons", name: "Lessons", weight: 100, color: "blue" }], cadence: { postsPerWeek: 3, days: [2, 3, 4], time: "08:30" } }));

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url !== "https://api.linkedin.com/rest/posts") throw new Error(`Unexpected request to ${url}`);
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:7000000000000000001" } });
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

function story(title: string) {
  return repo.createMemory(profile.id, { title, summary: title, story: `${title}. A real story with a real ending.`, when: "", place: "", people: [], emotions: [], details: [], quotes: [], lesson: "", pillar: "lessons", tags: [], angles: [], strength: 4 });
}

async function draftFrom(memoryId: string, extra: Record<string, unknown> = {}) {
  const created = await postsRoute.POST(req("POST", "/api/posts", { memoryId, ...extra }));
  expect(created.status).toBe(201);
  const { post } = await created.json();
  const edited = await (await patch(post.id, { body: "We lost our biggest client on a Tuesday.\n\nHere is what I changed after that." })).json();
  expect(edited.post.status).toBe("draft");
  return edited.post as import("@/lib/types").Post;
}

describe("Studio → Calendar → scheduler", () => {
  let postId = "";
  let memoryId = "";
  const at = new Date(Date.now() + 3 * 24 * HOUR);
  at.setUTCMinutes(0, 0, 0);

  it("approves and schedules from the editor, and the Calendar shows it", async () => {
    memoryId = story("Losing our biggest client").id;
    const draft = await draftFrom(memoryId);
    postId = draft.id;

    const approved = await (await patch(postId, { status: "approved" })).json();
    expect(approved.post.status).toBe("approved");
    expect(approved.post.approvedAt).toBeTruthy();

    const scheduled = await (await patch(postId, { status: "scheduled", scheduledAt: at.toISOString() })).json();
    expect(scheduled.post).toMatchObject({ status: "scheduled", scheduledAt: at.toISOString() });

    const day = time.dayKeyOf(at, profile.timezone);
    const res = await calendarRoute.GET(req("GET", `/api/calendar?from=${day}&to=${time.addDays(day, 1)}`));
    const data = await res.json();
    expect(data.posts.map((p: { id: string; state: string }) => [p.id, p.state])).toContainEqual([postId, "scheduled"]);
  });

  it("is Due once its time passes while LinkedIn isn't connected", async () => {
    const later = new Date(at.getTime() + 60_000);
    expect(await scheduler.schedulerTick(later)).toMatchObject({ published: 0, waiting: 1 });
    const data = calendar.getCalendarData(profile, calendar.resolveRange(null, null, profile.timezone, later), later);
    expect(data.due.map((p) => [p.id, p.state])).toContainEqual([postId, "due"]);
    expect(repo.getPost(postId)!.status).toBe("scheduled");
  });

  it("clears stale publish messages when the editor reschedules or unschedules", async () => {
    const next = new Date(at.getTime() + 24 * HOUR).toISOString();
    repo.updatePost(postId, { error: format.MISSED_MESSAGE });
    expect((await (await patch(postId, { status: "scheduled", scheduledAt: next })).json()).post).toMatchObject({ scheduledAt: next, error: null });

    repo.updatePost(postId, { error: format.VERIFY_MESSAGE });
    expect((await (await patch(postId, { status: "approved", scheduledAt: null })).json()).post).toMatchObject({ status: "approved", scheduledAt: null, error: null });

    // Saving text alone keeps the message: nothing about the publish changed.
    repo.updatePost(postId, { error: "LinkedIn had a problem on their side (503)." });
    expect((await (await patch(postId, { pillar: "lessons" })).json()).post.error).toMatch(/503/);

    // While a publish is in flight nothing moves.
    repo.updatePost(postId, { error: format.publishingMarker(new Date()) });
    const busy = await patch(postId, { status: "scheduled", scheduledAt: at.toISOString() });
    expect(busy.status).toBe(409);
    repo.updatePost(postId, { error: null });

    expect((await (await patch(postId, { status: "scheduled", scheduledAt: at.toISOString() })).json()).post.status).toBe("scheduled");
  });

  it("publishes on schedule when LinkedIn is connected and marks the story used", async () => {
    linkedin.saveLinkedInAccount(profile.id, { memberUrn: "urn:li:person:abc", name: "Ana Silva", picture: "", accessToken: "token-0000000000000000", expiresAt: new Date(Date.now() + 30 * 24 * HOUR).toISOString() });
    expect(await scheduler.schedulerTick(new Date(at.getTime() + 60_000))).toMatchObject({ published: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].body.commentary).toContain("We lost our biggest client on a Tuesday.");
    const post = repo.getPost(postId)!;
    expect(post).toMatchObject({ status: "published", error: null, linkedinUrn: "urn:li:share:7000000000000000001" });
    expect(post.approvedAt).toBeTruthy();
    expect(repo.getMemory(memoryId)!.status).toBe("used");
  });

  it("queues a post planned for a future day when it is approved", async () => {
    const planned = new Date(Date.now() + 5 * 24 * HOUR).toISOString();
    const draft = await draftFrom(story("The intern who fixed billing").id, { scheduledAt: planned });
    expect(draft.scheduledAt).toBe(planned);
    const approved = await (await patch(draft.id, { status: "approved" })).json();
    expect(approved.post).toMatchObject({ status: "scheduled", scheduledAt: planned });
  });

  it("stores structured angles and angle JSON in the shape every reader expects", async () => {
    const draft = await draftFrom(story("Quitting the bank job").id);
    const legacy = JSON.stringify({ v: 1, selected: { hook: "I quit on a Monday.", hookType: "SCENE", structureId: "mistake_fix", takeaway: "", whyItWorks: "" }, options: [] });
    const stored = (await (await patch(draft.id, { angle: legacy })).json()).post.angle;
    expect(JSON.parse(stored).selected).toMatchObject({ hook: "I quit on a Monday.", hookType: "scene", structureId: "mistake-fix" });

    const note = (await (await patch(draft.id, { angle: "Keep it short" })).json()).post.angle;
    expect(JSON.parse(note)).toMatchObject({ note: "Keep it short", selected: { structureId: "mistake-fix" } });
  });
});
