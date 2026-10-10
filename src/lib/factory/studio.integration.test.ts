/**
 * Integration test for the Studio (M5) route handlers against a throwaway SQLite database.
 * The local model is replaced by a fetch stub that answers like Ollama's /api/chat, including the
 * bad habits of small models (preambles, "Hook:" labels, out-of-range scores).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-m5-"));
process.env.SOCIALBOOST_DATA_DIR = dir;
process.env.SOCIALBOOST_DISABLE_SCHEDULER = "1";

let repo: typeof import("@/lib/repo");
let postsRoute: typeof import("@/app/api/posts/route");
let postRoute: typeof import("@/app/api/posts/[id]/route");
let versionsRoute: typeof import("@/app/api/posts/[id]/versions/route");
let lintRoute: typeof import("@/app/api/posts/[id]/lint/route");
let anglesRoute: typeof import("@/app/api/studio/angles/route");
let draftRoute: typeof import("@/app/api/studio/draft/route");
let critiqueRoute: typeof import("@/app/api/studio/critique/route");
let reviseRoute: typeof import("@/app/api/studio/revise/route");
let autopilotRoute: typeof import("@/app/api/studio/autopilot/route");
let memoryId: string;

const req = (method: string, url: string, body?: unknown) =>
  new Request(`http://localhost:3000${url}`, { method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const DRAFT =
  "Sure! Here's your LinkedIn post:\n\nHook: At 7:40 in the Basel office, our biggest client said \"Did you check the proxy?\"\n\nWe had spent 3 days on the bug. I had told the team it was the database.\n\nIt took 20 minutes once we looked at the proxy. I stopped guessing in front of clients after that.\n\nClose: When did a client spot the fix before you did?\n\nLet me know if you'd like any changes!";
const REVISED = "At 7:40 in the Basel office, our client asked one question.\n\n\"Did you check the proxy?\"\n\n3 days of debugging, fixed in 20 minutes.";

const calls: { system: string; format: boolean; stream: boolean }[] = [];

function ollamaStub() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/embed")) return new Response("no embedding model", { status: 404 });
    if (!url.endsWith("/api/chat")) throw new Error(`Unexpected fetch: ${url}`);
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[]; stream: boolean; format?: unknown };
    const system = body.messages.find((m) => m.role === "system")?.content ?? "";
    calls.push({ system, format: !!body.format, stream: body.stream });
    let content: string;
    if (/plan LinkedIn posts/.test(system)) {
      content = JSON.stringify({
        angles: [
          { hook: "Hook: At 7:40 our biggest client found the bug.", hookType: "scene", structureId: "scene-lesson", takeaway: "Look at the boring layer first.", whyItWorks: "A real scene." },
          { hook: '"Did you check the proxy?"', hookType: "dialogue", structureId: "mistake-fix", takeaway: "Say I don't know.", whyItWorks: "Dialogue." },
          { hook: "3 days on a bug that took 20 minutes.", hookType: "number", structureId: "before-after", takeaway: "Ask early.", whyItWorks: "Numbers." },
        ],
      });
    } else if (/strict LinkedIn editor/.test(system)) {
      // Small models sometimes score outside 1-10.
      content = JSON.stringify({ humanness: 0, specificity: 11, voiceMatch: 7.4, hook: 8, issues: [], suggestions: ["Name the client's team."] });
    } else {
      const task = body.messages[body.messages.length - 1].content;
      content = task.includes("Here is the current post:") ? REVISED : DRAFT;
    }
    if (!body.stream) return Response.json({ message: { role: "assistant", content }, done: true });
    const pieces = content.match(/[\s\S]{1,24}/g) ?? [];
    const ndjson = pieces.map((p) => JSON.stringify({ message: { role: "assistant", content: p }, done: false })).join("\n") + "\n" + JSON.stringify({ done: true }) + "\n";
    return new Response(ndjson, { headers: { "content-type": "application/x-ndjson" } });
  });
}

beforeAll(async () => {
  repo = await import("@/lib/repo");
  postsRoute = await import("@/app/api/posts/route");
  postRoute = await import("@/app/api/posts/[id]/route");
  versionsRoute = await import("@/app/api/posts/[id]/versions/route");
  lintRoute = await import("@/app/api/posts/[id]/lint/route");
  anglesRoute = await import("@/app/api/studio/angles/route");
  draftRoute = await import("@/app/api/studio/draft/route");
  critiqueRoute = await import("@/app/api/studio/critique/route");
  reviseRoute = await import("@/app/api/studio/revise/route");
  autopilotRoute = await import("@/app/api/studio/autopilot/route");

  const profile = repo.createProfile({ name: "Ana Ruiz", headline: "CTO", timezone: "Europe/Zurich" });
  const { StrategySchema } = await import("@/lib/types");
  repo.saveStrategy(profile.id, StrategySchema.parse({ positioning: "I help teams ship", pillars: [{ id: "eng", name: "Engineering", weight: 100, color: "blue" }] }));
  repo.saveVoiceProfile(profile.id, { stats: null, guide: { summary: "", tone: [], hookPatterns: [], structure: [], formatting: [], vocabulary: [], signatureMoves: [], neverDoes: [] }, manualRules: ["Don't say 'folks'"] });
  memoryId = repo.createMemory(profile.id, {
    title: "The proxy bug",
    summary: "Our biggest client found the bug.",
    story: "At 7:40 in the Basel office our biggest client asked: Did you check the proxy? We had spent 3 days on the bug. I had told the team it was the database. It took 20 minutes once we looked at the proxy.",
    when: "March",
    place: "Basel office",
    people: ["our biggest client"],
    emotions: ["embarrassed"],
    details: ["3 days", "20 minutes", "7:40"],
    quotes: ["Did you check the proxy?"],
    lesson: "Stop guessing in front of clients.",
    pillar: "eng",
    tags: [],
    angles: [],
    strength: 4,
  }).id;
  ollamaStub();
});

afterAll(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function readStream(res: Response): Promise<string> {
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(text).not.toContain("\u0000");
  return text;
}

describe("studio flow", () => {
  let postId: string;

  it("creates an idea from a memory and reuses an untouched one", async () => {
    const res = await postsRoute.POST(req("POST", "/api/posts", { memoryId, reuseEmpty: true }));
    expect(res.status).toBe(201);
    const { post } = await res.json();
    expect(post).toMatchObject({ status: "idea", memoryId, pillar: "eng", body: "" });
    postId = post.id;
    const again = await (await postsRoute.POST(req("POST", "/api/posts", { memoryId, reuseEmpty: true }))).json();
    expect(again).toMatchObject({ reused: true, post: { id: postId } });
  });

  it("suggests angles with structured output and cleans the hooks", async () => {
    const { angles, post } = await (await anglesRoute.POST(req("POST", "/api/studio/angles", { postId }))).json();
    expect(angles).toHaveLength(3);
    expect(angles[0].hook).toBe("At 7:40 our biggest client found the bug.");
    expect(angles[1].hook).toBe('"Did you check the proxy?"');
    expect(JSON.parse(post.angle).options).toHaveLength(3);
    expect(calls.at(-1)).toMatchObject({ format: true });
  });

  it("streams a draft, then saves it cleaned, linted and versioned", async () => {
    const streamed = await readStream(await draftRoute.POST(req("POST", "/api/studio/draft", { postId, angleIndex: 0 })));
    expect(streamed).toContain("Here's your LinkedIn post");
    expect(calls.at(-1)).toMatchObject({ stream: true, format: false });
    const post = repo.getPost(postId)!;
    expect(post.status).toBe("draft");
    expect(post.body.startsWith("At 7:40 in the Basel office")).toBe(true);
    expect(post.body).not.toMatch(/Hook:|Close:|Let me know|Here's your/);
    expect(post.body.trim().endsWith("When did a client spot the fix before you did?")).toBe(true);
    expect(post.quality?.lint.some((i) => i.rule === "unverified-number")).toBe(false);
    expect(JSON.parse(post.angle).selected.structureId).toBe("scene-lesson");
    expect(repo.listPostVersions(postId)[0]).toMatchObject({ source: "ai" });
  });

  it("critiques with scores clamped to 1-10", async () => {
    const res = await critiqueRoute.POST(req("POST", "/api/studio/critique", { postId }));
    expect(res.status).toBe(200);
    const { critique, gate } = await res.json();
    expect(critique).toMatchObject({ humanness: 1, specificity: 10, voiceMatch: 7, hook: 8 });
    expect(gate.ready).toBe(false);
  });

  it("flags the user's never-say words and invented numbers", async () => {
    const { lint } = await (await lintRoute.POST(req("POST", `/api/posts/${postId}/lint`, { text: "Hey folks, we saved 45 hours on that bug in Basel." }), ctx(postId))).json();
    const rules = lint.map((i: { rule: string }) => i.rule);
    expect(rules).toContain("never-say");
    expect(rules).toContain("unverified-number");
    // Checking other text never overwrites the stored post.
    expect(repo.getPost(postId)!.body).toContain("Basel office");
  });

  it("validates status changes and scheduling", async () => {
    const patch = (body: unknown) => postRoute.PATCH(req("PATCH", `/api/posts/${postId}`, body), ctx(postId));
    expect((await patch({ status: "published" })).status).toBe(400);
    expect((await patch({ status: "scheduled", scheduledAt: "2020-01-01T08:00:00Z" })).status).toBe(400);
    expect((await patch({ status: "approved" })).status).toBe(200);
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const scheduled = await (await patch({ status: "scheduled", scheduledAt: future })).json();
    expect(scheduled.post).toMatchObject({ status: "scheduled", scheduledAt: future });
    // Moving a scheduled post into the past would make the scheduler publish it at once.
    expect((await patch({ scheduledAt: "2020-01-01T08:00:00Z" })).status).toBe(400);
    expect((await patch({ scheduledAt: null })).status).toBe(400);
    expect(repo.getPost(postId)!.scheduledAt).toBe(future);
  });

  it("revises a scheduled post back into review and keeps the old text restorable", async () => {
    const before = repo.getPost(postId)!.body;
    await readStream(await reviseRoute.POST(req("POST", "/api/studio/revise", { postId, preset: "shorter" })));
    const post = repo.getPost(postId)!;
    expect(post.body).toBe(REVISED);
    expect(post.status).toBe("review");
    const { versions } = await (await versionsRoute.GET(req("GET", `/api/posts/${postId}/versions`), ctx(postId))).json();
    const old = versions.find((v: { body: string }) => v.body === before);
    expect(old).toBeTruthy();
    const restored = await (await versionsRoute.POST(req("POST", `/api/posts/${postId}/versions`, { versionId: old.id }), ctx(postId))).json();
    expect(restored.post.body).toBe(before);
    expect(repo.listPostVersions(postId)[0]).toMatchObject({ source: "human" });
    expect(repo.listPostVersions(postId)[0].note).toMatch(/^Restored the version from /);
  });

  it("saves a hand edit as one coalesced version", async () => {
    const patch = (body: string) => postRoute.PATCH(req("PATCH", `/api/posts/${postId}`, { body }), ctx(postId));
    const n = repo.listPostVersions(postId).length;
    await patch("At 7:40 in the Basel office our client asked one question.");
    await patch("At 7:40 in the Basel office our biggest client asked one question.");
    expect(repo.listPostVersions(postId).length).toBe(n);
    expect(repo.listPostVersions(postId)[0].body).toBe("At 7:40 in the Basel office our biggest client asked one question.");
  });

  it("runs autopilot end to end for a planned idea", async () => {
    const { post: idea } = await (await postsRoute.POST(req("POST", "/api/posts", { memoryId }))).json();
    const res = await autopilotRoute.POST(req("POST", "/api/studio/autopilot", { postId: idea.id }));
    expect(res.status).toBe(200);
    const { post, steps } = await res.json();
    expect(steps.slice(0, 3)).toEqual(["angles", "draft", "critique"]);
    expect(post.body).toBeTruthy();
    expect(["draft", "review"]).toContain(post.status);
    // A second run doesn't silently overwrite the draft.
    expect((await autopilotRoute.POST(req("POST", "/api/studio/autopilot", { postId: idea.id }))).status).toBe(409);
  });

  it("queues an approved post for the date the calendar planned it on", async () => {
    const slot = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const { post: planned } = await (await postsRoute.POST(req("POST", "/api/posts", { memoryId, scheduledAt: slot }))).json();
    const patch = (body: unknown) => postRoute.PATCH(req("PATCH", `/api/posts/${planned.id}`, body), ctx(planned.id));
    await patch({ body: "At 7:40 in the Basel office our biggest client asked one question." });
    const { post } = await (await patch({ status: "approved" })).json();
    expect(post).toMatchObject({ status: "scheduled", scheduledAt: slot });
    // Unscheduling keeps it approved and off the calendar.
    expect((await (await patch({ status: "approved", scheduledAt: null })).json()).post).toMatchObject({ status: "approved", scheduledAt: null });
  });

  it("never serves another profile's post", async () => {
    const other = repo.createProfile({ name: "Someone Else" });
    const res = await postRoute.GET(req("GET", `/api/posts/${postId}`), ctx(postId));
    expect(res.status).toBe(404);
    expect(other.id).toBeTruthy();
  });
});
