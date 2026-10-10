/**
 * Integration test for the M2 route handlers (strategy, dashboard, export, health) against
 * a throwaway SQLite database. Only the `server-only` guard is mocked.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-m2-"));
process.env.SOCIALBOOST_DATA_DIR = dir;
// A closed port so the health check is deterministic without a running Ollama.
process.env.OLLAMA_BASE_URL = "http://127.0.0.1:9";

type Repo = typeof import("@/lib/repo");
let repo: Repo;
let strategyRoute: typeof import("@/app/api/strategy/route");
let dashboardRoute: typeof import("@/app/api/dashboard/route");
let exportRoute: typeof import("@/app/api/export/route");
let healthRoute: typeof import("@/app/api/system/health/route");

const json = (body: unknown, query = "") =>
  new Request(`http://local/api/strategy${query}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (query = "") => new Request(`http://local/api/strategy${query}`);

beforeAll(async () => {
  repo = await import("@/lib/repo");
  strategyRoute = await import("@/app/api/strategy/route");
  dashboardRoute = await import("@/app/api/dashboard/route");
  exportRoute = await import("@/app/api/export/route");
  healthRoute = await import("@/app/api/system/health/route");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("before onboarding", () => {
  it("asks for a profile", async () => {
    const res = await strategyRoute.GET(get());
    expect(res.status).toBe(409);
    expect((await res.json()).hint).toMatch(/Welcome/);
  });
});

describe("with a profile", () => {
  let profileId = "";

  beforeAll(() => {
    profileId = repo.createProfile({ name: "Jane Doe", language: "es", timezone: "Europe/Madrid" }).id;
  });

  it("starts with no strategy and guides to the positioning interview", async () => {
    expect((await (await strategyRoute.GET(get())).json()).strategy).toBeNull();
    const dash = await (await dashboardRoute.GET()).json();
    expect(dash.firstName).toBe("Jane");
    expect(dash.hasStrategy).toBe(false);
    expect(dash.actions[0]).toMatchObject({ kind: "positioning", href: "/interviews/new?kind=positioning&auto=1" });
    expect(dash.actions.map((a: { kind: string }) => a.kind)).not.toContain("plan");
    expect(dash.week).toHaveLength(7);
  });

  it("saves a partial strategy, normalizes it and keeps the profile language", async () => {
    const res = await strategyRoute.PUT(
      json({
        positioning: "  I help fintech teams ship AI  ",
        pillars: [{ name: "AI in finance", weight: 140, storyPrompts: ["", "First production model"] }, { name: "" }],
        cadence: { postsPerWeek: 3, days: [4, 2, 3], time: "09:15" },
      }),
    );
    expect(res.status).toBe(200);
    const { strategy } = await res.json();
    expect(strategy.positioning).toBe("I help fintech teams ship AI");
    expect(strategy.language).toBe("es");
    expect(strategy.pillars).toHaveLength(1);
    expect(strategy.pillars[0]).toMatchObject({ name: "AI in finance", weight: 100, storyPrompts: ["First production model"], color: "blue" });
    expect(strategy.pillars[0].id).toMatch(/^pl_/);
    expect(strategy.cadence).toEqual({ postsPerWeek: 3, days: [2, 3, 4], time: "09:15" });

    // A second partial update keeps what was stored.
    const again = await (await strategyRoute.PUT(json({ cta: "P.S. Checklist in Featured." }))).json();
    expect(again.strategy.positioning).toBe("I help fintech teams ship AI");
    expect(again.strategy.pillars[0].id).toBe(strategy.pillars[0].id);
    expect(again.strategy.cta).toBe("P.S. Checklist in Featured.");
  });

  it("mirrors an explicit language change onto the profile only", async () => {
    const current = (await (await strategyRoute.GET(get())).json()).strategy;
    await strategyRoute.PUT(json({ ...current, notes: "Full-object autosave" }));
    expect(repo.getProfile(profileId)!.language).toBe("es");
    await strategyRoute.PUT(json({ language: "de" }));
    expect(repo.getProfile(profileId)!.language).toBe("de");
    await strategyRoute.PUT(json({ language: "es" }));
    expect(repo.getProfile(profileId)!.language).toBe("es");
  });

  it("rejects invalid strategy input with a 400", async () => {
    const res = await strategyRoute.PUT(json({ goals: "not a list" }));
    expect(res.status).toBe(400);
    const bad = await strategyRoute.PUT(new Request("http://local/api/strategy", { method: "PUT", body: "{not json" }));
    expect(bad.status).toBe(400);
  });

  it("pins saves to the profile the editor was opened for, even after a switch", async () => {
    const other = repo.createProfile({ name: "Max Muster", language: "de", timezone: "Europe/Berlin" }); // becomes active
    const pinned = `?profileId=${profileId}`;
    // A late autosave from Jane's editor lands after the switch to Max.
    await strategyRoute.PUT(json({ notes: "Jane's late autosave" }, pinned));
    expect(repo.getStrategy(profileId)!.notes).toBe("Jane's late autosave");
    expect(repo.getStrategy(other.id)).toBeNull();
    expect((await (await strategyRoute.GET(get(pinned))).json()).strategy.notes).toBe("Jane's late autosave");
    expect((await strategyRoute.PUT(json({ notes: "x" }, "?profileId=pf_missing"))).status).toBe(404);
    repo.deleteProfile(other.id);
    const { setActiveProfileId } = await import("@/lib/settings");
    setActiveProfileId(profileId);
  });

  it("reflects memories and posts on the dashboard", async () => {
    const strategy = repo.getStrategy(profileId)!;
    const pillar = strategy.pillars[0].id;
    const base = { summary: "", story: "", when: "", place: "", people: [], emotions: [], details: [], quotes: [], lesson: "", tags: [], angles: [], strength: 3 };
    const m1 = repo.createMemory(profileId, { ...base, title: "The 2am outage", pillar });
    repo.createMemory(profileId, { ...base, title: "First hire", pillar });
    repo.createPost({ profileId, memoryId: m1.id, status: "review", body: "We lost a client at 2am.\n\nHere's what I changed." });

    const dash = await (await dashboardRoute.GET()).json();
    expect(dash.hasStrategy).toBe(true);
    expect(dash.stats).toMatchObject({ ready: 2, readyUnused: 1, needPhoto: 2, drafts: 1, inReview: 1 });
    const kinds = dash.actions.map((a: { kind: string }) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(["voice-import", "photos", "story", "review", "plan"]));
    expect(dash.balance[0]).toMatchObject({ name: "AI in finance", ready: 1 });
    expect(dash.activity.some((a: { message: string }) => a.message.includes("The 2am outage"))).toBe(true);
  });

  it("exports the active profile without API keys", async () => {
    repo.createInterview({ profileId, kind: "story", title: "Outage" });
    const res = await exportRoute.GET(new Request("http://local/api/export"));
    expect(res.headers.get("content-disposition")).toMatch(/socialboost-jane-doe-\d{4}-\d{2}-\d{2}\.json/);
    const data = await res.json();
    expect(data).toMatchObject({ app: "socialboost", exportVersion: 1, scope: "active" });
    expect(data.settings).toBeUndefined();
    expect(data.profiles).toHaveLength(1);
    const p = data.profiles[0];
    expect(p.profile.name).toBe("Jane Doe");
    expect(p.memories).toHaveLength(2);
    expect(p.posts[0].versions).toEqual([]);
    expect(p.interviews[0].messages).toEqual([]);
  });

  it("exports everyone with redacted keys, and validates scope", async () => {
    const { saveAISettings, getAISettings } = await import("@/lib/settings");
    const s = getAISettings();
    saveAISettings({ ...s, providers: [...s.providers, { id: "anthropic", kind: "anthropic", label: "Claude", baseUrl: "https://api.anthropic.com", apiKey: "sk-ant-secret" }] });
    const all = await (await exportRoute.GET(new Request("http://local/api/export?scope=all"))).json();
    expect(all.scope).toBe("all");
    expect(JSON.stringify(all)).not.toContain("sk-ant-secret");
    expect(all.settings.ai.providers.find((p: { id: string }) => p.id === "anthropic").apiKey).toBe("(removed)");
    const withKeys = await (await exportRoute.GET(new Request("http://local/api/export?scope=all&secrets=1"))).json();
    expect(JSON.stringify(withKeys)).toContain("sk-ant-secret");
    expect((await exportRoute.GET(new Request("http://local/api/export?scope=nope"))).status).toBe(400);
    saveAISettings(s);
  });

  it("reports an unreachable Ollama with a hint and no false positives", async () => {
    const res = await healthRoute.GET();
    const report = await res.json();
    const ollama = report.providers.find((p: { kind: string }) => p.kind === "ollama");
    expect(ollama.ok).toBe(false);
    expect(ollama.hint).toMatch(/ollama serve/);
    expect(report.summary.ready).toBe(false);
    expect(report.routes.find((r: { task: string }) => r.task === "writer").status).toBe("provider-down");
  });
});

