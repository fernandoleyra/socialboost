/**
 * Render smoke test: the M2 pages server-render without throwing against a seeded
 * throwaway database. Next's router and the `server-only` guard are mocked.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({
  default: ({ href, children, prefetch: _prefetch, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean }) => React.createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, refresh() {} }),
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-render-"));
process.env.SOCIALBOOST_DATA_DIR = dir;

let repo: typeof import("@/lib/repo");
const text = (html: string) => html.replace(/<!-- -->/g, "");

beforeAll(async () => {
  repo = await import("@/lib/repo");
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("M2 pages render", () => {
  it("welcome: first run, adding a person, redirect once a profile exists", async () => {
    const { WelcomeFlow } = await import("@/app/welcome/welcome-flow");
    expect(renderToString(React.createElement(WelcomeFlow, { adding: false }))).toContain("Your stories. Your voice. Your photos.");
    expect(renderToString(React.createElement(WelcomeFlow, { adding: true }))).toContain("Who are we writing for next?");
    const Page = (await import("@/app/welcome/page")).default;
    expect(renderToString(await Page({ searchParams: Promise.resolve({}) }))).toContain("Get started");
    repo.createProfile({ name: "Fernando Garcia", timezone: "Europe/Madrid", language: "es" });
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT /");
    expect(renderToString(await Page({ searchParams: Promise.resolve({ new: "1" }) }))).toContain("Who are we writing for next?");
  });

  it("today: empty, then populated", async () => {
    const Page = (await import("@/app/(app)/page")).default;
    expect(text(renderToString(Page()))).toContain("Find your angle");

    const p = repo.getActiveProfile()!;
    const { StrategySchema } = await import("@/lib/types");
    repo.saveStrategy(
      p.id,
      StrategySchema.parse({
        positioning: "I help agencies ship AI products",
        pillars: [
          { id: "a", name: "AI in agencies", weight: 50, color: "blue" },
          { id: "b", name: "Founder lessons", weight: 50, color: "purple" },
        ],
      }),
    );
    const base = { summary: "", story: "", when: "", place: "", people: [], emotions: [], details: [], quotes: [], lesson: "", tags: [], angles: [], strength: 3 };
    const m = repo.createMemory(p.id, { ...base, title: "The pitch we lost", pillar: "a" });
    repo.createMemory(p.id, { ...base, title: "First hire", pillar: "b" });
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    repo.createPost({ profileId: p.id, memoryId: m.id, status: "approved", scheduledAt: soon, pillar: "a", body: "We lost a pitch on Tuesday.\n\nThen this happened." });
    repo.createPost({ profileId: p.id, status: "review", body: "Draft in review" });

    const html = text(renderToString(Page()));
    expect(html).toContain("Good");
    expect(html).toContain("We lost a pitch on Tuesday.");
    expect(html).toContain("A draft is waiting for you");
    expect(html).toContain("Pillar balance");
    expect(html).toContain("New memory: First hire");
  });

  it("strategy: editor and empty state", async () => {
    const Page = (await import("@/app/(app)/strategy/page")).default;
    const html = text(renderToString(Page()));
    expect(html).toContain("I help agencies ship AI products");
    expect(html).toContain("Posting rhythm");
    const { StrategyEditor } = await import("@/components/strategy/strategy-editor");
    const empty = renderToString(React.createElement(StrategyEditor, { profileId: "pf_test", initial: null, language: "en", timezone: "UTC", storyCounts: {}, activePositioningId: null }));
    expect(empty).toContain("No strategy yet");
  });

  it("settings", async () => {
    const Page = (await import("@/app/(app)/settings/page")).default;
    const html = text(renderToString(Page()));
    expect(html).toContain("Who does what");
    expect(html).toContain("Export Fernando Garcia");
    expect(html).toContain("Recommended");
  });
});
