import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { UPLOAD_DIR, getDb, newId, logActivity, nowIso } from "./db";
import { HttpError } from "./http";
import { LLMError, chatJson } from "./llm";
import { deletePhotoRow, getMemory, getPhoto, insertPhoto, listPhotos, updatePhoto } from "./repo";
import type { Photo } from "./types";
import {
  FULL_MAX_EDGE,
  MAX_UPLOAD_BYTES,
  THUMB_EDGE,
  VISION_MAX_EDGE,
  VISION_PROMPT,
  VISION_SYSTEM,
  VisionResultSchema,
  cleanCaption,
  formatBytes,
  parsePhotoMeta,
  readExifSummary,
  sniffImageType,
  type PhotoMeta,
  type PhotoView,
} from "./photo-core";

/**
 * Photo pipeline: validate → auto-rotate, strip metadata, resize → JPEG on disk →
 * row in `photos` → caption + candid check by the vision model in the background.
 *
 * Files in data/uploads:
 *   <id>.jpg          full size, long edge <= 2048, JPEG q85, sRGB, no EXIF/GPS
 *   <id>_thumb.jpg    short edge 512 for grids
 *   <id>.meta.json    sidecar (capture date, vision analysis, caption status)
 */

export type PhotoSize = "full" | "thumb";

const SAFE_FILENAME = /^[A-Za-z0-9_-]+\.jpg$/;

function fullPath(photo: Pick<Photo, "id" | "filename">): string {
  const name = SAFE_FILENAME.test(photo.filename) ? photo.filename : `${photo.id.replace(/[^A-Za-z0-9_-]/g, "")}.jpg`;
  return path.join(UPLOAD_DIR, name);
}

export function photoFilePath(photo: Pick<Photo, "id" | "filename">, size: PhotoSize): string {
  const full = fullPath(photo);
  return size === "thumb" ? full.replace(/\.jpg$/, "_thumb.jpg") : full;
}

function metaPath(id: string): string {
  return path.join(UPLOAD_DIR, `${id.replace(/[^A-Za-z0-9_-]/g, "")}.meta.json`);
}

export function readPhotoMeta(id: string): PhotoMeta {
  try {
    return parsePhotoMeta(JSON.parse(fs.readFileSync(metaPath(id), "utf8")));
  } catch {
    // Photos added by other means (or before sidecars existed) simply have no extra facts.
    return parsePhotoMeta({ captionStatus: "done" });
  }
}

function writePhotoMeta(id: string, meta: PhotoMeta) {
  const file = metaPath(id);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(meta));
  fs.renameSync(tmp, file);
}

function updatePhotoMeta(id: string, patch: Partial<PhotoMeta>): PhotoMeta {
  const next = { ...readPhotoMeta(id), ...patch };
  writePhotoMeta(id, next);
  return next;
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

function usage(profileId: string): { titles: Map<string, string>; posts: Map<string, number> } {
  const db = getDb();
  const titles = new Map(
    (db.prepare(`SELECT id, title FROM memories WHERE profile_id = ?`).all(profileId) as { id: string; title: string }[]).map((r) => [r.id, r.title]),
  );
  const posts = new Map(
    (db.prepare(`SELECT photo_id, COUNT(*) AS n FROM posts WHERE profile_id = ? AND photo_id IS NOT NULL GROUP BY photo_id`).all(profileId) as { photo_id: string; n: number }[]).map((r) => [
      r.photo_id,
      r.n,
    ]),
  );
  return { titles, posts };
}

function toView(photo: Photo, u: ReturnType<typeof usage>, resume = true): PhotoView {
  const meta = readPhotoMeta(photo.id);
  if (resume && meta.captionStatus === "pending") resumeCaption(photo.id);
  return {
    ...photo,
    meta,
    memoryTitle: photo.memoryId ? (u.titles.get(photo.memoryId) ?? null) : null,
    postCount: u.posts.get(photo.id) ?? 0,
  };
}

/** `resume: false` when the caller schedules the caption itself (fresh uploads use after()). */
export function photoView(photo: Photo, opts: { resume?: boolean } = {}): PhotoView {
  return toView(photo, usage(photo.profileId), opts.resume ?? true);
}

/** Read a JSON request body; malformed JSON is the client's mistake (400), not a server error. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "The request body isn't valid JSON.");
  }
}

export function listPhotoViews(profileId: string, opts: { memoryId?: string | null; unassigned?: boolean } = {}): PhotoView[] {
  const u = usage(profileId);
  return listPhotos(profileId, opts).map((p) => toView(p, u));
}

/** The photo, if it belongs to this profile — otherwise a 404 (never leak across profiles). */
export function requireOwnedPhoto(profileId: string, id: string): Photo {
  const photo = getPhoto(id);
  if (!photo || photo.profileId !== profileId) throw new HttpError(404, "Photo not found", "It may have been deleted.");
  return photo;
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

export async function processUpload(profileId: string, file: File, opts: { memoryId?: string | null; note?: string } = {}): Promise<Photo> {
  if (file.size === 0) throw new HttpError(400, "That file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, `That photo is ${formatBytes(file.size)}. The limit is 25 MB.`, "Export a smaller copy, or share it from your phone at a lower size.");
  }
  const memory = opts.memoryId ? getMemory(opts.memoryId) : null;
  if (opts.memoryId && (!memory || memory.profileId !== profileId)) throw new HttpError(404, "That story no longer exists.", "Refresh the page and try again.");

  const input = Buffer.from(await file.arrayBuffer());
  const kind = sniffImageType(input);
  if (!kind) throw new HttpError(415, "That file isn't a photo we can read.", "Use a JPEG, PNG, WebP or HEIC photo.");

  let full: { data: Buffer; info: { width: number; height: number } };
  let thumb: Buffer;
  let exif = { takenAt: null as string | null, hadLocation: false };
  try {
    const metadata = await sharp(input, { failOn: "error" }).metadata();
    exif = readExifSummary(metadata.exif);
    full = await sharp(input, { failOn: "error" })
      .rotate() // apply EXIF orientation before the metadata is dropped
      .resize({ width: FULL_MAX_EDGE, height: FULL_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    thumb = await sharp(full.data)
      .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "outside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch {
    if (kind === "heic") {
      throw new HttpError(
        415,
        "This HEIC photo can't be decoded on this machine.",
        "On iPhone, pick Settings → Camera → Formats → Most Compatible, or share the photo as JPEG. Safari and the Photos app usually convert it for you.",
      );
    }
    throw new HttpError(415, "We couldn't read that image.", "It may be damaged. Export it again as JPEG and retry.");
  }

  const id = newId("ph");
  const filename = `${id}.jpg`;
  const photoStub = { id, filename };
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const written: string[] = [];
  try {
    fs.writeFileSync(photoFilePath(photoStub, "full"), full.data);
    written.push(photoFilePath(photoStub, "full"));
    fs.writeFileSync(photoFilePath(photoStub, "thumb"), thumb);
    written.push(photoFilePath(photoStub, "thumb"));
    writePhotoMeta(
      id,
      parsePhotoMeta({
        takenAt: exif.takenAt,
        hadLocation: exif.hadLocation,
        originalBytes: file.size,
        sourceType: kind,
        captionStatus: "pending",
      }),
    );
    written.push(metaPath(id));
    const photo = insertPhoto({
      id,
      profileId,
      memoryId: memory?.id ?? null,
      filename,
      originalName: (file.name || "photo").slice(0, 200),
      mime: "image/jpeg",
      width: full.info.width,
      height: full.info.height,
      caption: "",
      userNote: (opts.note ?? "").trim().slice(0, 1000),
      isCandid: null,
    });
    if (memory) logActivity("photo", `Added a photo to “${memory.title}”`, { profileId, refId: memory.id });
    return photo;
  } catch (err) {
    for (const f of written) fs.rmSync(f, { force: true });
    throw err;
  }
}

/** Remove the row and every file that belongs to the photo. */
export function deletePhoto(photo: Photo) {
  deletePhotoRow(photo.id);
  for (const f of [photoFilePath(photo, "full"), photoFilePath(photo, "thumb"), metaPath(photo.id)]) fs.rmSync(f, { force: true });
}

/**
 * Delete every photo of a profile, files included. Call it BEFORE deleting the profile:
 * the ON DELETE CASCADE removes the rows but would leave the JPEGs in data/uploads.
 */
export function deleteProfilePhotos(profileId: string): number {
  const all = listPhotos(profileId);
  for (const p of all) deletePhoto(p);
  return all.length;
}

/* ------------------------------------------------------------------ */
/* Edits that must respect captions written by the person              */
/* ------------------------------------------------------------------ */

export function editPhoto(photo: Photo, patch: { memoryId?: string | null; caption?: string; userNote?: string; isCandid?: boolean | null }): Photo {
  if (patch.memoryId) {
    const memory = getMemory(patch.memoryId);
    if (!memory || memory.profileId !== photo.profileId) throw new HttpError(404, "That story no longer exists.");
  }
  const next = updatePhoto(photo.id, {
    ...(patch.memoryId !== undefined ? { memoryId: patch.memoryId } : {}),
    ...(patch.caption !== undefined ? { caption: patch.caption.trim() } : {}),
    ...(patch.userNote !== undefined ? { userNote: patch.userNote.trim() } : {}),
    ...(patch.isCandid !== undefined ? { isCandid: patch.isCandid } : {}),
  });
  if (patch.caption !== undefined || patch.isCandid !== undefined) {
    updatePhotoMeta(photo.id, {
      ...(patch.caption !== undefined ? { captionSource: "user", captionStatus: "done", captionError: "" } : {}),
      ...(patch.isCandid !== undefined ? { candidSource: "user" } : {}),
    });
  }
  if (patch.memoryId && patch.memoryId !== photo.memoryId) {
    const memory = getMemory(patch.memoryId);
    if (memory) logActivity("photo", `Added a photo to “${memory.title}”`, { profileId: photo.profileId, refId: memory.id });
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Vision captions                                                     */
/* ------------------------------------------------------------------ */

async function visionImage(photo: Photo): Promise<string> {
  const buf = await sharp(photoFilePath(photo, "full"))
    .resize({ width: VISION_MAX_EDGE, height: VISION_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return buf.toString("base64");
}

function describeError(err: unknown): string {
  if (err instanceof LLMError) return [err.message, err.hint].filter(Boolean).join(" ");
  return err instanceof Error ? err.message : String(err);
}

/**
 * Ask the vision model for a literal caption, candid-vs-staged verdict and a few facts
 * (kind, people count, readable text). `auto` runs (right after upload) never overwrite a
 * caption or candid flag the person set while the model was working; explicit re-runs do.
 */
export async function captionPhoto(id: string, opts: { auto?: boolean } = {}): Promise<Photo | null> {
  const photo = getPhoto(id);
  if (!photo) return null;
  if (!opts.auto) updatePhotoMeta(id, { captionStatus: "pending", captionError: "" });
  try {
    const data = await visionImage(photo);
    const result = await chatJson(VisionResultSchema, {
      task: "vision",
      system: VISION_SYSTEM,
      messages: [{ role: "user", content: VISION_PROMPT, images: [{ data, mime: "image/jpeg" }] }],
      temperature: 0.1,
      maxTokens: 400,
    });
    const fresh = getPhoto(id);
    if (!fresh) return null; // deleted while the model was thinking
    const meta = readPhotoMeta(id);
    const keepCaption = opts.auto && meta.captionSource === "user";
    const keepCandid = opts.auto && meta.candidSource === "user";
    const caption = cleanCaption(result.description);
    const next = updatePhoto(id, {
      ...(keepCaption || !caption ? {} : { caption }),
      ...(keepCandid ? {} : { isCandid: result.candid }),
    });
    updatePhotoMeta(id, {
      analysis: { kind: result.kind, people: result.people, visibleText: result.visibleText },
      captionStatus: "done",
      captionError: "",
      captionedAt: nowIso(),
      ...(keepCaption ? {} : { captionSource: "ai" as const }),
      ...(keepCandid ? {} : { candidSource: "ai" as const }),
    });
    return next;
  } catch (err) {
    if (getPhoto(id)) updatePhotoMeta(id, { captionStatus: "failed", captionError: describeError(err).slice(0, 400) });
    if (!opts.auto) throw err;
    return getPhoto(id);
  }
}

/*
 * One caption at a time per server process: a bulk upload of 30 photos should not fire 30
 * concurrent requests at a local vision model. The chain and the set of queued ids live on
 * globalThis so dev hot-reloads don't fork them.
 */
const g = globalThis as unknown as { __sbCaptionChain?: Promise<unknown>; __sbCaptionQueued?: Set<string> };

export function queueCaption(id: string): Promise<void> {
  const queued = (g.__sbCaptionQueued ??= new Set());
  if (queued.has(id)) return (g.__sbCaptionChain ?? Promise.resolve()).then(() => undefined);
  queued.add(id);
  const run = (g.__sbCaptionChain ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => captionPhoto(id, { auto: true }))
    .catch((err) => console.error(`[photos] caption ${id} failed:`, err))
    .finally(() => queued.delete(id));
  g.__sbCaptionChain = run;
  return run.then(() => undefined);
}

/** A photo still marked pending but not queued (e.g. the server restarted mid-caption) gets re-queued. */
function resumeCaption(id: string) {
  if (g.__sbCaptionQueued?.has(id)) return;
  void queueCaption(id);
}

/** Explicit "describe again": runs now, throws model errors so the UI can show the hint. */
export async function recaptionPhoto(id: string): Promise<Photo | null> {
  const queued = (g.__sbCaptionQueued ??= new Set());
  const mine = !queued.has(id);
  queued.add(id);
  try {
    return await captionPhoto(id, { auto: false });
  } finally {
    if (mine) queued.delete(id);
  }
}
