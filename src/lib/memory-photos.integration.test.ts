import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StrategySchema } from "./types";

/*
 * Exercises the real photo pipeline (sharp + SQLite + sidecar files) and the Memory Bank
 * service against a throwaway data directory. Model calls are stubbed.
 */

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-m3-"));
process.env.SOCIALBOOST_DATA_DIR = dataDir;

vi.mock("server-only", () => ({}));
vi.mock("./llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./llm")>();
  return { ...actual, chatJson: vi.fn(), embed: vi.fn() };
});

type Llm = typeof import("./llm");
type Photos = typeof import("./photos");
type MemorySvc = typeof import("./memory");
type Repo = typeof import("./repo");

let llm: Llm;
let photos: Photos;
let memory: MemorySvc;
let repo: Repo;
let profileId: string;

/** A 3000×2000 JPEG stored sideways (EXIF orientation 6) with a capture date and GPS block. */
async function phoneJpeg(): Promise<File> {
  const buf = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#7fa7ff" } })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: "TestPhone" },
      IFD2: { DateTimeOriginal: "2025:03:14 09:12:30" },
      IFD3: { GPSLatitudeRef: "N" },
    })
    .toBuffer();
  return new File([new Uint8Array(buf)], "IMG_0042.JPG", { type: "image/jpeg" });
}

beforeAll(async () => {
  llm = await import("./llm");
  photos = await import("./photos");
  memory = await import("./memory");
  repo = await import("./repo");
  profileId = repo.createProfile({ name: "Test Person" }).id;
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("photo pipeline", () => {
  it("auto-rotates, resizes, strips metadata and records the capture date", async () => {
    const photo = await photos.processUpload(profileId, await phoneJpeg(), { note: "Right before the demo" });
    expect(photo.width).toBe(1365);
    expect(photo.height).toBe(2048);
    expect(photo.userNote).toBe("Right before the demo");

    const full = photos.photoFilePath(photo, "full");
    const thumb = photos.photoFilePath(photo, "thumb");
    expect(fs.existsSync(full)).toBe(true);
    const fullMeta = await sharp(full).metadata();
    expect(fullMeta.exif).toBeUndefined();
    expect(fullMeta.orientation).toBeUndefined();
    const thumbMeta = await sharp(thumb).metadata();
    expect(Math.min(thumbMeta.width!, thumbMeta.height!)).toBe(512);

    const meta = photos.readPhotoMeta(photo.id);
    expect(meta.takenAt).toBe("2025-03-14T09:12:30");
    expect(meta.hadLocation).toBe(true);
    expect(meta.captionStatus).toBe("pending");
  });

  it("rejects files that aren't images", async () => {
    const pdf = new File([new TextEncoder().encode("%PDF-1.7 not a photo at all")], "doc.pdf", { type: "application/pdf" });
    await expect(photos.processUpload(profileId, pdf)).rejects.toMatchObject({ status: 415 });
  });

  it("captions with the vision model and keeps a caption the person wrote meanwhile", async () => {
    const photo = await photos.processUpload(profileId, await phoneJpeg());
    vi.mocked(llm.chatJson).mockResolvedValueOnce({ description: "a man holds a coffee on a train", candid: true, kind: "selfie", people: 1, visibleText: false });
    const captioned = await photos.captionPhoto(photo.id, { auto: true });
    expect(captioned?.caption).toBe("A man holds a coffee on a train.");
    expect(captioned?.isCandid).toBe(true);
    expect(photos.readPhotoMeta(photo.id)).toMatchObject({ captionStatus: "done", analysis: { kind: "selfie", people: 1 } });

    photos.editPhoto(captioned!, { caption: "Me on the 7:04 to Zürich" });
    vi.mocked(llm.chatJson).mockResolvedValueOnce({ description: "a train", candid: false, kind: "place", people: 0, visibleText: false });
    const again = await photos.captionPhoto(photo.id, { auto: true });
    expect(again?.caption).toBe("Me on the 7:04 to Zürich");
    expect(again?.isCandid).toBe(false);
  });

  it("records model failures with the hint instead of throwing on automatic runs", async () => {
    const photo = await photos.processUpload(profileId, await phoneJpeg());
    vi.mocked(llm.chatJson).mockRejectedValueOnce(new llm.LLMError("No model is configured for the \"vision\" task.", "Open Settings → Models."));
    await photos.captionPhoto(photo.id, { auto: true });
    const meta = photos.readPhotoMeta(photo.id);
    expect(meta.captionStatus).toBe("failed");
    expect(meta.captionError).toContain("Settings → Models");
  });

  it("treats a malformed JSON body as a 400, not a server error", async () => {
    const bad = new Request("http://localhost/api/photos/x", { method: "PATCH", body: "{memoryId:", headers: { "content-type": "application/json" } });
    await expect(photos.readJsonBody(bad)).rejects.toMatchObject({ status: 400 });
    const good = new Request("http://localhost/api/photos/x", { method: "PATCH", body: '{"caption":"ok"}' });
    await expect(photos.readJsonBody(good)).resolves.toEqual({ caption: "ok" });
  });

  it("removes a profile's photo files so deleting the profile leaves nothing behind", async () => {
    const other = repo.createProfile({ name: "Second Person" }).id;
    const photo = await photos.processUpload(other, await phoneJpeg());
    const full = photos.photoFilePath(photo, "full");
    expect(photos.deleteProfilePhotos(other)).toBe(1);
    expect(fs.existsSync(full)).toBe(false);
    expect(repo.listPhotos(other)).toEqual([]);
    repo.deleteProfile(other);
  });

  it("deletes the row and every file", async () => {
    const photo = await photos.processUpload(profileId, await phoneJpeg());
    const files = [photos.photoFilePath(photo, "full"), photos.photoFilePath(photo, "thumb")];
    photos.deletePhoto(photo);
    expect(repo.getPhoto(photo.id)).toBeNull();
    for (const f of files) expect(fs.existsSync(f)).toBe(false);
  });
});

describe("memory service", () => {
  it("creates a hand-written story, keeps only verbatim quotes and links photos", async () => {
    const photo = await photos.processUpload(profileId, await phoneJpeg());
    const story =
      "Last March our biggest client called at 6pm on a Friday. She said: \"We're moving everything in-house.\" I was standing in the kitchen of our old office. Since then we call every client monthly.";
    vi.mocked(llm.chatJson).mockResolvedValueOnce({
      title: "The Friday call",
      summary: "Our biggest client left, and it changed how we work.",
      when: "Last March",
      place: "our old office",
      people: ["our biggest client"],
      emotions: ["shocked"],
      details: ["6pm on a Friday"],
      quotes: ["We're moving everything in-house.", "We are leaving you for good."],
      lesson: "Talk to clients before they decide.",
      tags: ["Clients"],
      angles: ["What losing a client taught me"],
      strength: 4,
      pillar: null,
    });
    vi.mocked(llm.embed).mockResolvedValueOnce([[1, 0, 0]]);
    const { memory: m, warning } = await memory.createManualMemory(profileId, { story, photoIds: [photo.id], enrich: true });
    expect(warning).toBeUndefined();
    expect(m.title).toBe("The Friday call");
    expect(m.story).toBe(story);
    expect(m.quotes).toEqual(["We're moving everything in-house."]);
    expect(m.tags).toEqual(["clients"]);
    expect(m.photoCount).toBe(1);
    expect(m.coverPhotoId).toBe(photo.id);
  });

  it("saves the story as written when the model is unavailable", async () => {
    vi.mocked(llm.chatJson).mockRejectedValueOnce(new llm.LLMError("Couldn't reach Ollama.", "Start it with `ollama serve`."));
    vi.mocked(llm.embed).mockResolvedValueOnce(null);
    const { memory: m, warning } = await memory.createManualMemory(profileId, {
      story: "We shipped the ugly version first. Three customers paid for it the same week, before we had a logo.",
      enrich: true,
    });
    expect(warning).toContain("ollama serve");
    expect(m.title).toBe("We shipped the ugly version first");
    expect(m.strength).toBeGreaterThanOrEqual(1);
  });

  it("searches by keyword without embeddings and by meaning with them", async () => {
    vi.mocked(llm.embed).mockResolvedValue(null);
    const kw = await memory.queryMemories(profileId, { q: "client" });
    expect(kw.mode).toBe("keyword");
    expect(kw.memories[0].title).toBe("The Friday call");

    // Query vector points at the first memory; the second has no vector and gets one on the fly.
    vi.mocked(llm.embed).mockImplementation(async (texts: string[]) => texts.map((t) => (t.includes("ugly") ? [0, 1, 0] : [1, 0, 0])));
    const sem = await memory.searchMemories(profileId, "losing a customer", 5);
    expect(sem[0].title).toBe("The Friday call");
    expect(sem[0].score).toBeGreaterThan(sem[1]?.score ?? 0);
    vi.mocked(llm.embed).mockReset();
  });

  it("maps a pillar given by name to its id and clears a blank pillar on edit", async () => {
    repo.saveStrategy(profileId, StrategySchema.parse({ pillars: [{ id: "pl_ops", name: "Operations" }] }));
    vi.mocked(llm.embed).mockResolvedValue(null);
    const { memory: m } = await memory.createManualMemory(profileId, {
      story: "Our Monday stand-up used to take 45 minutes. We moved it to a shared doc and it now takes eight.",
      pillar: "operations",
      enrich: false,
    });
    expect(m.pillar).toBe("pl_ops");
    const cleared = await memory.patchMemory(m, { pillar: "  " });
    expect(cleared.pillar).toBeNull();
    repo.deleteMemory(m.id);
    vi.mocked(llm.embed).mockReset();
  });

  it("filters needs-photo and re-embeds only when text changes", async () => {
    const res = await memory.queryMemories(profileId, { filter: "needs-photo" });
    expect(res.memories.map((m) => m.title)).toEqual(["We shipped the ugly version first"]);
    expect(res.counts["needs-photo"]).toBe(1);

    const target = res.memories[0];
    vi.mocked(llm.embed).mockResolvedValue([[0, 0, 1]]);
    await memory.patchMemory(repo.getMemory(target.id)!, { strength: 5 });
    expect(llm.embed).not.toHaveBeenCalled();
    await memory.patchMemory(repo.getMemory(target.id)!, { lesson: "Ship before you're ready." });
    expect(llm.embed).toHaveBeenCalledTimes(1);
    expect(repo.getMemoryEmbedding(target.id)).toEqual([0, 0, 1]);
  });

  it("puts a story's first photo on its unfinished posts, never on approved ones", async () => {
    const m = repo.createMemory(profileId, {
      title: "The empty booth",
      summary: "",
      story: "Nobody came to our booth for the first two hours.",
      when: "",
      place: "",
      people: [],
      emotions: [],
      details: [],
      quotes: [],
      lesson: "",
      pillar: null,
      tags: [],
      angles: [],
      strength: 3,
    });
    const planned = repo.createPost({ profileId, memoryId: m.id, status: "idea", scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
    const approved = repo.createPost({ profileId, memoryId: m.id, status: "approved", body: "Nobody came to our booth." });

    const first = await photos.processUpload(profileId, await phoneJpeg(), { memoryId: m.id });
    expect(repo.getPost(planned.id)!.photoId).toBe(first.id);
    expect(repo.getPost(approved.id)!.photoId).toBeNull();

    // Only the first photo is adopted: a post whose photo was removed on purpose stays without one.
    repo.updatePost(planned.id, { photoId: null });
    const loose = await photos.processUpload(profileId, await phoneJpeg());
    photos.editPhoto(loose, { memoryId: m.id });
    expect(repo.getPost(planned.id)!.photoId).toBeNull();
  });

  it("frees a deleted story's empty planned slots and keeps posts that have text", () => {
    const m = repo.createMemory(profileId, {
      title: "The late train",
      summary: "",
      story: "The 7:12 to Basel was cancelled and I pitched from the platform.",
      when: "",
      place: "",
      people: [],
      emotions: [],
      details: [],
      quotes: [],
      lesson: "",
      pillar: null,
      tags: [],
      angles: [],
      strength: 3,
    });
    const slot = new Date(Date.now() + 86_400_000).toISOString();
    const planned = repo.createPost({ profileId, memoryId: m.id, status: "idea", scheduledAt: slot });
    const written = repo.createPost({ profileId, memoryId: m.id, status: "idea", body: "I pitched from a train platform." });
    const draft = repo.createPost({ profileId, memoryId: m.id, status: "draft", body: "The 7:12 to Basel was cancelled." });
    expect(memory.memoryPosts(profileId, m.id).filter((p) => p.placeholder).map((p) => p.id)).toEqual([planned.id]);

    expect(memory.deleteMemoryAndPlaceholders(profileId, m.id)).toBe(1);
    expect(repo.getMemory(m.id)).toBeNull();
    expect(repo.getPost(planned.id)).toBeNull();
    expect(repo.getPost(written.id)).toMatchObject({ memoryId: null, body: "I pitched from a train platform." });
    expect(repo.getPost(draft.id)).toMatchObject({ memoryId: null, status: "draft" });
  });
});
