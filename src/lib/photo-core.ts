import { z } from "zod";
import type { Photo } from "./types";

/**
 * Pure photo logic shared by the server (upload pipeline, vision captions) and the
 * client (library UI, checks). No Node or DB imports here so it can be unit-tested
 * and bundled for the browser.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Long edge of the stored full-size JPEG. */
export const FULL_MAX_EDGE = 2048;
/** Short edge of the stored thumbnail (crisp grid covers at 2x). */
export const THUMB_EDGE = 512;
/** Long edge of the copy sent to the vision model. Small models do not benefit from more. */
export const VISION_MAX_EDGE = 768;

export const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif"];
/** Value for <input accept>. HEIC is listed explicitly because some browsers don't map it to image/*. */
export const ACCEPT_ATTR = "image/*,.heic,.heif";

export type ImageKind = "jpeg" | "png" | "webp" | "heic" | "avif";

function ascii(b: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);

/** Identify an image by its magic bytes. Never trust the browser-supplied MIME type. */
export function sniffImageType(b: Uint8Array): ImageKind | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "webp";
  if (ascii(b, 4, 8) === "ftyp") {
    const boxSize = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    const brands = [ascii(b, 8, 12)];
    // Compatible brands follow the major brand (4 bytes) and minor version (4 bytes).
    for (let off = 16; off + 4 <= Math.min(boxSize, b.length, 64); off += 4) brands.push(ascii(b, off, off + 4));
    if (brands.some((x) => x === "avif" || x === "avis")) return "avif";
    if (brands.some((x) => HEIC_BRANDS.has(x))) return "heic";
    if (brands.includes("mif1") || brands.includes("msf1")) return "heic";
  }
  return null;
}

export function isHeicName(name: string, type = ""): boolean {
  return /\.(heic|heif)$/i.test(name) || /image\/hei[cf]/i.test(type);
}

/* ------------------------------------------------------------------ */
/* EXIF (read before we strip it)                                      */
/* ------------------------------------------------------------------ */

const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;

/**
 * Pull the capture date and whether GPS data was present out of a raw EXIF block
 * (as returned by sharp's metadata().exif, with or without the "Exif\0\0" prefix).
 * Returns a local timestamp "YYYY-MM-DDTHH:MM:SS" (EXIF has no time zone).
 */
export function readExifSummary(input: Uint8Array | null | undefined): { takenAt: string | null; hadLocation: boolean } {
  const none = { takenAt: null, hadLocation: false };
  if (!input || input.length < 14) return none;
  let base = 0;
  if (ascii(input, 0, 4) === "Exif") base = 6;
  const order = ascii(input, base, base + 2);
  if (order !== "II" && order !== "MM") return none;
  const le = order === "II";
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const u16 = (off: number) => (off + 2 <= input.length ? view.getUint16(off, le) : -1);
  const u32 = (off: number) => (off + 4 <= input.length ? view.getUint32(off, le) : -1);
  if (u16(base + 2) !== 42) return none;

  type Entry = { tag: number; type: number; count: number; valueOff: number };
  const readIfd = (rel: number): Entry[] => {
    const at = base + rel;
    const n = u16(at);
    if (rel <= 0 || n <= 0 || n > 512) return [];
    const out: Entry[] = [];
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > input.length) break;
      out.push({ tag: u16(e), type: u16(e + 2), count: u32(e + 4), valueOff: e + 8 });
    }
    return out;
  };
  const readAscii = (e: Entry): string => {
    if (e.type !== 2 || e.count <= 0) return "";
    const start = e.count <= 4 ? e.valueOff : base + u32(e.valueOff);
    if (start < 0 || start + e.count > input.length) return "";
    return ascii(input, start, start + e.count).replace(/\0+$/, "");
  };

  const ifd0 = readIfd(u32(base + 4));
  let date = "";
  let hadLocation = false;
  const exifPtr = ifd0.find((e) => e.tag === TAG_EXIF_IFD);
  if (exifPtr) {
    const original = readIfd(u32(exifPtr.valueOff)).find((e) => e.tag === TAG_DATETIME_ORIGINAL);
    if (original) date = readAscii(original);
  }
  if (!date) {
    const dt = ifd0.find((e) => e.tag === TAG_DATETIME);
    if (dt) date = readAscii(dt);
  }
  const gps = ifd0.find((e) => e.tag === TAG_GPS_IFD);
  if (gps) hadLocation = readIfd(u32(gps.valueOff)).length > 0;

  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(date);
  if (!m) return { takenAt: null, hadLocation };
  const [, y, mo, d, h, mi, s] = m;
  const year = Number(y);
  if (year < 1900 || year > 2100 || Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return { takenAt: null, hadLocation };
  return { takenAt: `${y}-${mo}-${d}T${h}:${mi}:${s}`, hadLocation };
}

/* ------------------------------------------------------------------ */
/* Vision analysis                                                      */
/* ------------------------------------------------------------------ */

export const PHOTO_KINDS = ["selfie", "people", "place", "object", "screen", "document", "headshot", "graphic", "other"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  selfie: "Selfie",
  people: "People",
  place: "Place",
  object: "Object",
  screen: "Screen",
  document: "Document",
  headshot: "Headshot",
  graphic: "Graphic",
  other: "Photo",
};

/** What we ask the vision model for. `.catch` keeps small models' near-misses usable. */
export const VisionResultSchema = z.object({
  description: z.string(),
  candid: z.boolean(),
  kind: z.enum(PHOTO_KINDS).catch("other"),
  people: z.number().int().min(0).max(500).catch(0),
  visibleText: z.boolean().catch(false),
});
export type VisionResult = z.infer<typeof VisionResultSchema>;

export const VISION_SYSTEM =
  "You look at one photo and describe it for a LinkedIn ghostwriter. Be literal: only describe what is visible. Never guess names, companies or places you cannot read in the photo.";

export const VISION_PROMPT = `Describe this photo.

Rules:
1. description: 1-2 short sentences. Say who or what is in it, what is happening, and the setting. Example: "A man takes a selfie on a train, holding a menu with a woman's photo on the cover. A coffee cup sits on the table."
2. candid: true if it looks like a real, unposed or casual phone photo. false if it looks like a studio portrait, a stock photo, a staged marketing shot, or a graphic.
3. kind: one of selfie, people, place, object, screen, document, headshot, graphic, other.
4. people: how many people are visible. 0 if none.
5. visibleText: true if readable text is visible (screens, slides, whiteboards, documents, name badges).`;

/** Tidy a model-written caption: one paragraph, no wrapping quotes, max ~2 sentences. */
export function cleanCaption(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/^(description|caption)\s*:\s*/i, "").replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (!t) return "";
  const sentences = t.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 2) t = sentences.slice(0, 2).join("").trim();
  if (t.length > 320) {
    t = t.slice(0, 320);
    const cut = t.lastIndexOf(" ");
    t = (cut > 200 ? t.slice(0, cut) : t).replace(/[,;:\s]+$/, "") + "…";
  }
  if (!/[.!?…]$/.test(t)) t += ".";
  return t[0].toUpperCase() + t.slice(1);
}

/* ------------------------------------------------------------------ */
/* Sidecar metadata                                                    */
/* ------------------------------------------------------------------ */

export const CAPTION_STATUSES = ["pending", "done", "failed"] as const;
export type CaptionStatus = (typeof CAPTION_STATUSES)[number];

/**
 * Extra facts about a photo that the photos table has no column for. Stored next to the
 * image as `<id>.meta.json`, so backing up data/ keeps it and deleting the photo removes it.
 */
export const PhotoMetaSchema = z.object({
  takenAt: z.string().nullable().default(null),
  hadLocation: z.boolean().default(false),
  originalBytes: z.number().default(0),
  sourceType: z.string().default(""),
  analysis: z
    .object({
      kind: z.enum(PHOTO_KINDS).catch("other"),
      people: z.number().catch(0),
      visibleText: z.boolean().catch(false),
    })
    .nullable()
    .default(null),
  captionStatus: z.enum(CAPTION_STATUSES).catch("failed").default("pending"),
  captionError: z.string().default(""),
  captionedAt: z.string().nullable().default(null),
  /** Set when the person edited the caption / candid flag themselves; automatic runs keep their choice. */
  captionSource: z.enum(["ai", "user"]).nullable().default(null),
  candidSource: z.enum(["ai", "user"]).nullable().default(null),
});
export type PhotoMeta = z.infer<typeof PhotoMetaSchema>;

export function parsePhotoMeta(raw: unknown): PhotoMeta {
  const parsed = PhotoMetaSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : PhotoMetaSchema.parse({ captionStatus: "failed", captionError: "Photo details were unreadable." });
}

/** What the photo APIs return: the row plus sidecar meta and where it is used. */
export type PhotoView = Photo & {
  meta: PhotoMeta;
  memoryTitle: string | null;
  postCount: number;
};

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                */
/* ------------------------------------------------------------------ */

export function aspectInfo(width: number | null, height: number | null): { label: string; orientation: "portrait" | "landscape" | "square" | "unknown"; ratio: number | null } {
  if (!width || !height) return { label: "Unknown size", orientation: "unknown", ratio: null };
  const r = width / height;
  const near = (target: number) => Math.abs(r - target) / target < 0.03;
  const named: [number, string][] = [
    [4 / 5, "Portrait 4:5"],
    [3 / 4, "Portrait 3:4"],
    [2 / 3, "Portrait 2:3"],
    [9 / 16, "Portrait 9:16"],
    [1, "Square"],
    [5 / 4, "Landscape 5:4"],
    [4 / 3, "Landscape 4:3"],
    [3 / 2, "Landscape 3:2"],
    [16 / 9, "Landscape 16:9"],
  ];
  const orientation = near(1) ? "square" : r < 1 ? "portrait" : "landscape";
  const hit = named.find(([t]) => near(t));
  return { label: hit ? hit[1] : orientation === "portrait" ? "Portrait" : "Landscape", orientation, ratio: r };
}

export type PhotoCheck = { id: string; tone: "green" | "orange" | "yellow" | "blue" | "gray"; title: string; body: string };

/**
 * Deterministic advice for one photo, grounded in what works on LinkedIn: real candid
 * phone photos at the scene, portrait framing, consent from people in frame, and no
 * confidential text on screens or whiteboards.
 */
export function photoChecks(p: Pick<Photo, "width" | "height" | "isCandid">, meta: Pick<PhotoMeta, "analysis">): PhotoCheck[] {
  const out: PhotoCheck[] = [];
  const a = meta.analysis;
  if (a?.kind === "graphic") {
    out.push({ id: "graphic", tone: "orange", title: "A graphic, not a photo", body: "Posts with a real photo from the moment usually do better than graphics. Use one if you have it." });
  } else if (a?.kind === "headshot") {
    out.push({ id: "headshot", tone: "orange", title: "Polished headshot", body: "Fine for opinion posts. For a story, a phone photo from the moment itself reads as more real." });
  } else if (p.isCandid === false) {
    out.push({ id: "posed", tone: "orange", title: "Looks posed or stock", body: "Readers trust phone photos from the real moment. If you have one from the scene, use that instead." });
  } else if (p.isCandid === true) {
    out.push({
      id: "candid",
      tone: "green",
      title: a?.kind === "selfie" ? "Candid selfie" : "Looks candid",
      body: a?.kind === "selfie" ? "A selfie at the place it happened is the format that tends to work best." : "Real and unpolished. This is what makes a story believable.",
    });
  }
  if (a && (a.visibleText || a.kind === "screen" || a.kind === "document")) {
    out.push({ id: "text", tone: "yellow", title: "Readable text in the photo", body: "Zoom in and check nothing confidential shows: client names, numbers, messages, badges." });
  }
  if (a && a.people >= 2) {
    out.push({ id: "consent", tone: "blue", title: `${a.people} people in the photo`, body: "Make sure everyone in it is happy to appear on LinkedIn." });
  }
  const short = p.width && p.height ? Math.min(p.width, p.height) : null;
  if (short !== null && short < 600) {
    out.push({ id: "lowres", tone: "orange", title: "Low resolution", body: "It may look blurry in the feed. Use the original from your phone if you can." });
  }
  const { orientation } = aspectInfo(p.width, p.height);
  if (orientation === "landscape") {
    out.push({ id: "landscape", tone: "gray", title: "Landscape photo", body: "Portrait (4:5) photos fill more of the mobile feed. Crop it if it still reads well." });
  }
  return out;
}

/** Practical photo guidance shown wherever we ask for a photo. */
export const PHOTO_TIPS: { title: string; body: string }[] = [
  { title: "The real moment beats a polished one", body: "A phone photo from where it happened, even if it's imperfect." },
  { title: "No photo from back then?", body: "Take one this week: the place, the object, or the people involved (ask them first)." },
  { title: "Hold your phone upright", body: "Portrait photos fill more of the feed. Natural light, no filters." },
  { title: "Put yourself in the frame", body: "If the story is about you, show your face. Ask a colleague to snap you mid-conversation." },
  { title: "Screens and whiteboards are fine", body: "Just check nothing confidential is readable." },
  { title: "Old prints count", body: "For origin stories, a phone photo of a printed photo works." },
  { title: "Never AI-generated", body: "LinkedIn is cracking down on synthetic images, and readers notice." },
];

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
