/**
 * Integration test for the interview service: real SQLite (temp dir), real prompts and
 * filters, and a fake Ollama server that answers like a sloppy small model (labels, praise,
 * off-target and extra questions, invented quotes).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

vi.mock("server-only", () => ({}));

type Json = Record<string, unknown>;
const calls: { kind: string; body: Json }[] = [];

function structured(schema: { properties?: Record<string, unknown> }): Json {
  const props = Object.keys(schema.properties ?? {});
  if (props.includes("scene")) return { scene: true, people: true, stakes: false, turning: false, details: false, feelings: false, lesson: false };
  if (props.includes("rhythm")) return Object.fromEntries(props.map((k) => [k, false]));
  if (props.includes("story"))
    return {
      title: "Payroll export failed before Christmas",
      summary: "A new accounting system broke payroll in the busy season.",
      story: "I convinced a bakery chain to switch systems. On day three the payroll export failed at 11pm.",
      when: "late October",
      place: "the back office in Valencia",
      people: ["Carmen", "Luis"],
      emotions: ["sick"],
      details: ["140 staff", "11pm"],
      quotes: ["If this breaks before Christmas, we're done with consultants forever", "Innovation is a journey, not a destination."],
      lesson: "Never switch systems in your busiest season.",
      pillar: "Cash flow",
      tags: ["Finance", "#Failure"],
      angles: ["Testing with real data"],
      strength: 4,
    };
  if (props.includes("positioning"))
    return {
      positioning: "I help family business owners see their real cash position.",
      goals: ["Clients", "Speaking"],
      audienceWho: "Second-generation owners in Spain",
      audiencePains: ["Spreadsheets"],
      audienceDesires: ["Clarity"],
      expertise: ["Cash flow"],
      offers: ["Fractional CFO"],
      beliefs: ["Budgets are theatre"],
      contrarianTakes: ["You don't need an ERP"],
      avoidTopics: ["Politics"],
      cta: "",
      postsPerWeek: 3,
      notes: "No emojis.",
    };
  if (props.includes("pillars"))
    return {
      pillars: [
        { name: "Cash flow", description: "Seeing the real cash position.", storyPrompts: ["When did a client misread their cash?"] },
        { name: "Succession", description: "Handing over a family business.", storyPrompts: ["When did a handover go wrong?"] },
        { name: "Modern finance", description: "Upgrading without breaking things.", storyPrompts: [] },
      ],
    };
  return {};
}

function streamedReply(note: string): string {
  if (/No question/.test(note)) return "Great! The midnight call, hands shaking. Did you sleep at all?";
  if (/when it happened and where/.test(note)) return "Interviewer: Got it. How did that make you feel? And then what?";
  return "Sure! Here's my question: That's interesting. What did you want most in that moment, and what could you lose?";
}

let server: http.Server;
let svc: typeof import("./service");
let repo: typeof import("@/lib/repo");
let store: typeof import("./store");
let dataDir: string;

async function read(res: Response): Promise<string> {
  const text = await res.text();
  const nul = text.indexOf("\u0000");
  if (nul >= 0) throw new Error(text.slice(nul + 1));
  return text;
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? (JSON.parse(raw) as Json) : {};
      if (req.url === "/api/embed") {
        calls.push({ kind: "embed", body });
        res.end(JSON.stringify({ embeddings: (body.input as string[]).map(() => [0.1, 0.2, 0.3]) }));
        return;
      }
      if (body.format) {
        calls.push({ kind: "json", body });
        res.end(JSON.stringify({ message: { content: JSON.stringify(structured(body.format as { properties?: Record<string, unknown> })) }, done: true }));
        return;
      }
      calls.push({ kind: "stream", body });
      const msgs = body.messages as { role: string; content: string }[];
      const text = streamedReply(msgs[msgs.length - 1].content);
      res.setHeader("content-type", "application/x-ndjson");
      for (const piece of text.match(/.{1,7}/g) ?? []) res.write(JSON.stringify({ message: { content: piece }, done: false }) + "\n");
      res.end(JSON.stringify({ message: { content: "" }, done: true }) + "\n");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-interview-"));
  process.env.SOCIALBOOST_DATA_DIR = dataDir;
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  repo = await import("@/lib/repo");
  svc = await import("./service");
  store = await import("./store");
});

afterAll(() => {
  server?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("interview service against a fake local model", () => {
  it("runs a story interview: fixed opening, on-target probes, photo protocol, caption, finish", async () => {
    const profile = repo.createProfile({ name: "Ana Torres", headline: "Fractional CFO", language: "en", timezone: "Europe/Madrid" });
    const iv = svc.startInterview(profile, { kind: "story", pillar: undefined, seed: "When did you almost quit?", theme: null, knownStory: null });
    const signal = new AbortController().signal;
    const turn = (content: string, photoIds: string[] = [], intent?: "photo-later") => read(svc.replyStream(profile, iv.id, { content, photoIds, intent }, signal));

    const opening = await turn("");
    expect(opening).toMatch(/^Hi Ana\. Let's capture one real moment/);
    expect(opening.endsWith("When did you almost quit?")).toBe(true);
    expect(calls.filter((c) => c.kind === "stream")).toHaveLength(0); // no model call for the opening

    // Off-target model question (feelings while we need the scene) → replaced by the bank probe.
    const q1 = await turn("We lost our biggest client, a bank we had for three years.");
    expect(q1).toBe("When was this, roughly, and where exactly were you?");

    // On-target question survives; the label, preamble and praise are stripped.
    const q2 = await turn("It was a Monday last March, in the meeting room at their Zurich office.");
    expect(q2).toMatch(/^What did you want most in that moment/);
    expect(q2).not.toMatch(/Sure|interesting/i);

    // The model check (run after replies every few answers) adds coverage the heuristics missed.
    await svc.refreshCoverage(iv.id);
    expect(store.getInterviewState(iv.id).llm?.covered).toEqual(["scene", "people"]);
    expect(svc.loadInterviewView(profile, iv.id).coverage.find((c) => c.key === "people")?.status).toBe("covered");

    expect(await turn("I don't remember")).toContain("?");
    let view = svc.loadInterviewView(profile, iv.id);
    expect(view.messages.filter((m) => m.role === "assistant").every((m) => (m.content.match(/\?/g) ?? []).length <= 1 || m.stage === "opening")).toBe(true);

    // "that's it" → mandatory photo request: reaction (question dropped) + fixed ask.
    const photoAsk = await turn("that's it");
    expect(photoAsk).toBe("The midnight call, hands shaking.\n\nDo you have a photo from that moment, or something close to it? The place, the people, an object or a screenshot all work, and a quick phone photo is perfect.");
    view = svc.loadInterviewView(profile, iv.id);
    expect(view.pendingPhotoRequestId).toBe(view.messages[view.messages.length - 1].id);

    const photo = repo.insertPhoto({ id: "ph_1", profileId: profile.id, memoryId: null, filename: "ph_1.jpg", originalName: "a.jpg", mime: "image/jpeg", width: 4, height: 5, caption: "", userNote: "", isCandid: null });
    const caption = await turn("", [photo.id]);
    expect(caption).toContain("What's the one line you'd tell a friend about this photo?");
    const wrap = await turn("Me in the empty meeting room afterwards.");
    expect(wrap).toContain('Tap "Finish & save"');
    expect(repo.getPhoto(photo.id)?.userNote).toBe("Me in the empty meeting room afterwards.");
    view = svc.loadInterviewView(profile, iv.id);
    expect(view.readyToFinish).toBe(true);
    expect(view.pendingPhotoRequestId).toBeNull();
    expect(view.threadPhotoDone).toBe(true);

    // Empty answer after an assistant turn is rejected; the model check stores coverage.
    expect(() => svc.replyStream(profile, iv.id, { content: "", photoIds: [] }, signal)).toThrow(/Type an answer/);

    const res = await svc.finishInterview(profile, iv.id, { photoIds: [] });
    expect(res.memories).toHaveLength(1);
    const m = res.memories[0];
    expect(m.title).toBe("Payroll export failed before Christmas");
    expect(m.quotes).toEqual([]); // the model's "quotes" were never said by Ana
    expect(m.tags).toEqual(["finance", "failure"]);
    expect(m.photoCount).toBe(1);
    expect(repo.getMemoryEmbedding(m.id)).toEqual([0.1, 0.2, 0.3]);
    expect(repo.getInterview(iv.id)?.status).toBe("completed");
    // The extractor never saw the photo exchange.
    const extract = calls.filter((c) => c.kind === "json").pop()!;
    expect(JSON.stringify(extract.body.messages)).not.toContain("empty meeting room afterwards");
    // Finishing again is idempotent; replying to a closed interview is refused.
    expect((await svc.finishInterview(profile, iv.id, { photoIds: [] })).memories).toHaveLength(1);
    expect(() => svc.replyStream(profile, iv.id, { content: "hi", photoIds: [] }, signal)).toThrow(/already saved/);
  });

  it("runs a positioning interview and builds a strategy with pillars", async () => {
    const profile = repo.getActiveProfile()!;
    const iv = svc.startInterview(profile, { kind: "positioning", pillar: null, seed: null, theme: null, knownStory: null });
    const signal = new AbortController().signal;
    const turn = (content: string) => read(svc.replyStream(profile, iv.id, { content, photoIds: [] }, signal));
    expect(await turn("")).toContain("What do you want LinkedIn to do for you");
    let last = "";
    for (let i = 0; i < 12; i++) {
      last = await turn("Family business owners in Spain should call me when they need a CFO, clients first then speaking.");
      if (last.includes("Finish & build strategy")) break;
    }
    expect(last).toContain('Tap "Finish & build strategy"');

    const res = await svc.finishInterview(profile, iv.id, { photoIds: [] });
    expect(res.strategy?.positioning).toBe("I help family business owners see their real cash position.");
    expect(res.strategy?.pillars.map((p) => p.name)).toEqual(["Cash flow", "Succession", "Modern finance"]);
    expect(res.strategy?.pillars.reduce((s, p) => s + p.weight, 0)).toBe(100);
    expect(res.strategy?.cadence.postsPerWeek).toBe(3);
    expect(repo.getStrategy(profile.id)?.avoidTopics).toEqual(["Politics"]);
  });

  it("targets pillars: auto picks the neediest, null means any topic", () => {
    const profile = repo.getActiveProfile()!;
    const auto = svc.startInterview(profile, { kind: "story", pillar: undefined, seed: null, theme: null, knownStory: null });
    expect(auto.pillar).toBe(repo.getStrategy(profile.id)!.pillars[0].id); // no ready stories anywhere → heaviest pillar
    const any = svc.startInterview(profile, { kind: "story", pillar: null, seed: null, theme: null, knownStory: null });
    expect(any.pillar).toBeNull();
    const known = svc.startInterview(profile, { kind: "story", pillar: null, seed: null, theme: null, knownStory: "The day our CTO quit mid-launch." });
    expect(repo.listMessages(known.id).map((m) => m.role)).toEqual(["user"]);
    // A second positioning interview closes the unfinished one.
    const p1 = svc.startInterview(profile, { kind: "positioning" });
    svc.startInterview(profile, { kind: "positioning" });
    expect(repo.getInterview(p1.id)?.status).toBe("abandoned");
  });
});
