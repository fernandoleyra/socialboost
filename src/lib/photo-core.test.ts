import { describe, expect, it } from "vitest";
import { VisionResultSchema, aspectInfo, cleanCaption, isHeicName, parsePhotoMeta, photoChecks, readExifSummary, sniffImageType } from "./photo-core";

const bytes = (...parts: (string | number[])[]) => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") for (const c of p) out.push(c.charCodeAt(0));
    else out.push(...p);
  }
  while (out.length < 16) out.push(0);
  return new Uint8Array(out);
};

describe("sniffImageType", () => {
  it("recognises common photo formats by magic bytes", () => {
    expect(sniffImageType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffImageType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(sniffImageType(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("webp");
  });

  it("tells HEIC from AVIF using the ftyp brands", () => {
    expect(sniffImageType(bytes([0, 0, 0, 24], "ftypheic", [0, 0, 0, 0], "mif1heic"))).toBe("heic");
    expect(sniffImageType(bytes([0, 0, 0, 24], "ftypmif1", [0, 0, 0, 0], "mif1heic"))).toBe("heic");
    expect(sniffImageType(bytes([0, 0, 0, 28], "ftypavif", [0, 0, 0, 0], "avifmif1miaf"))).toBe("avif");
    expect(sniffImageType(bytes([0, 0, 0, 24], "ftypmif1", [0, 0, 0, 0], "mif1avif"))).toBe("avif");
  });

  it("rejects non-images and short input", () => {
    expect(sniffImageType(bytes("GIF89a"))).toBeNull();
    expect(sniffImageType(bytes("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(bytes([0, 0, 0, 24], "ftypisom"))).toBeNull();
  });

  it("detects HEIC by name or type", () => {
    expect(isHeicName("IMG_0042.HEIC")).toBe(true);
    expect(isHeicName("photo", "image/heif")).toBe(true);
    expect(isHeicName("photo.jpg", "image/jpeg")).toBe(false);
  });
});

/** Build a minimal TIFF/EXIF block like phones write. */
function buildExif(opts: { le?: boolean; date?: string; where?: "exif" | "ifd0"; gps?: boolean; prefix?: boolean }) {
  const { le = true, date = "2025:03:14 09:12:30", where = "exif", gps = false, prefix = true } = opts;
  const buf = new ArrayBuffer(256);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const put = (off: number, s: string) => [...s].forEach((c, i) => (u8[off + i] = c.charCodeAt(0)));
  put(0, le ? "II" : "MM");
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le);
  const ifd0 = 8;
  const entries: [number, number, number, number][] = []; // tag, type, count, value
  const strOff = 200;
  const exifOff = 120;
  const gpsOff = 160;
  if (where === "ifd0") entries.push([0x0132, 2, 20, strOff]);
  if (where === "exif") entries.push([0x8769, 4, 1, exifOff]);
  if (gps) entries.push([0x8825, 4, 1, gpsOff]);
  v.setUint16(ifd0, entries.length, le);
  entries.forEach(([tag, type, count, value], i) => {
    const e = ifd0 + 2 + i * 12;
    v.setUint16(e, tag, le);
    v.setUint16(e + 2, type, le);
    v.setUint32(e + 4, count, le);
    v.setUint32(e + 8, value, le);
  });
  if (where === "exif") {
    v.setUint16(exifOff, 1, le);
    v.setUint16(exifOff + 2, 0x9003, le);
    v.setUint16(exifOff + 4, 2, le);
    v.setUint32(exifOff + 6, 20, le);
    v.setUint32(exifOff + 10, strOff, le);
  }
  if (gps) {
    v.setUint16(gpsOff, 1, le);
    v.setUint16(gpsOff + 2, 0x0000, le);
    v.setUint16(gpsOff + 4, 1, le);
    v.setUint32(gpsOff + 6, 4, le);
  }
  put(strOff, date + "\0");
  const tiff = new Uint8Array(buf);
  if (!prefix) return tiff;
  const out = new Uint8Array(tiff.length + 6);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0]);
  out.set(tiff, 6);
  return out;
}

describe("readExifSummary", () => {
  it("reads DateTimeOriginal from the Exif IFD (little endian, with Exif prefix)", () => {
    expect(readExifSummary(buildExif({}))).toEqual({ takenAt: "2025-03-14T09:12:30", hadLocation: false });
  });

  it("handles big-endian blocks without prefix and flags GPS data", () => {
    expect(readExifSummary(buildExif({ le: false, prefix: false, gps: true, date: "2019:12:01 18:00:05" }))).toEqual({ takenAt: "2019-12-01T18:00:05", hadLocation: true });
  });

  it("falls back to IFD0 DateTime", () => {
    expect(readExifSummary(buildExif({ where: "ifd0", date: "2023:07:04 12:00:00" })).takenAt).toBe("2023-07-04T12:00:00");
  });

  it("ignores blank or invalid dates and garbage input", () => {
    expect(readExifSummary(buildExif({ date: "0000:00:00 00:00:00" })).takenAt).toBeNull();
    expect(readExifSummary(new Uint8Array(40))).toEqual({ takenAt: null, hadLocation: false });
    expect(readExifSummary(null)).toEqual({ takenAt: null, hadLocation: false });
  });
});

describe("cleanCaption", () => {
  it("strips labels and quotes, keeps two sentences, ends with a period", () => {
    expect(cleanCaption('Description: "a man takes a selfie on a train"')).toBe("A man takes a selfie on a train.");
    expect(cleanCaption("One. Two. Three. Four.")).toBe("One. Two.");
    expect(cleanCaption("   ")).toBe("");
  });

  it("caps very long captions at a word boundary", () => {
    const long = "word ".repeat(120);
    const out = cleanCaption(long);
    expect(out.length).toBeLessThanOrEqual(322);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("VisionResultSchema", () => {
  it("keeps small-model near misses usable", () => {
    const r = VisionResultSchema.parse({ description: "x", candid: true, kind: "selfie photo", people: "two", visibleText: "maybe" });
    expect(r).toEqual({ description: "x", candid: true, kind: "other", people: 0, visibleText: false });
  });
});

describe("parsePhotoMeta", () => {
  it("fills defaults and survives junk", () => {
    expect(parsePhotoMeta({}).captionStatus).toBe("pending");
    expect(parsePhotoMeta({ captionStatus: "weird" }).captionStatus).toBe("failed");
    expect(parsePhotoMeta(null).analysis).toBeNull();
  });
});

describe("aspectInfo", () => {
  it("names common photo shapes", () => {
    expect(aspectInfo(1080, 1350).label).toBe("Portrait 4:5");
    expect(aspectInfo(1536, 2048).label).toBe("Portrait 3:4");
    expect(aspectInfo(2048, 1152).label).toBe("Landscape 16:9");
    expect(aspectInfo(1000, 1000).orientation).toBe("square");
    expect(aspectInfo(null, 10).orientation).toBe("unknown");
  });
});

describe("photoChecks", () => {
  const meta = (analysis: { kind: "selfie" | "screen" | "headshot" | "people" | "graphic"; people: number; visibleText: boolean } | null) => ({ analysis });

  it("praises candid selfies", () => {
    const ids = photoChecks({ width: 1536, height: 2048, isCandid: true }, meta({ kind: "selfie", people: 1, visibleText: false })).map((c) => c.id);
    expect(ids).toEqual(["candid"]);
  });

  it("flags posed photos, readable text, consent, low resolution and landscape framing", () => {
    const ids = photoChecks({ width: 800, height: 500, isCandid: false }, meta({ kind: "screen", people: 3, visibleText: true })).map((c) => c.id);
    expect(ids).toEqual(["posed", "text", "consent", "lowres", "landscape"]);
  });

  it("calls out headshots and graphics specifically", () => {
    expect(photoChecks({ width: 2000, height: 2000, isCandid: false }, meta({ kind: "headshot", people: 1, visibleText: false }))[0].id).toBe("headshot");
    expect(photoChecks({ width: 2000, height: 2000, isCandid: false }, meta({ kind: "graphic", people: 0, visibleText: false }))[0].id).toBe("graphic");
  });

  it("says nothing about candidness before the vision model ran", () => {
    expect(photoChecks({ width: 1536, height: 2048, isCandid: null }, meta(null))).toEqual([]);
  });
});
