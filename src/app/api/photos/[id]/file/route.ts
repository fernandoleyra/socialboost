import fs from "node:fs/promises";
import { handle, HttpError } from "@/lib/http";
import { getPhoto } from "@/lib/repo";
import { photoFilePath, type PhotoSize } from "@/lib/photos";

export const dynamic = "force-dynamic";

/**
 * GET /api/photos/[id]/file?size=thumb|full[&download=1] → the JPEG.
 * Files never change for a given id, so browsers may cache them forever.
 * Not scoped to the active profile: ids are random, and switching profiles in another tab
 * must not break images that are already on screen.
 */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const size: PhotoSize = sp.get("size") === "thumb" ? "thumb" : "full";
  const photo = getPhoto(id);
  if (!photo) throw new HttpError(404, "Photo not found");

  let data: Buffer;
  let served: PhotoSize = size;
  try {
    data = await fs.readFile(photoFilePath(photo, size));
  } catch {
    if (size !== "thumb") throw new HttpError(404, "The photo file is missing from data/uploads.");
    // A missing thumbnail falls back to the full image.
    try {
      data = await fs.readFile(photoFilePath(photo, "full"));
      served = "full";
    } catch {
      throw new HttpError(404, "The photo file is missing from data/uploads.");
    }
  }

  const etag = `"${photo.id}-${served}-${data.length}"`;
  const headers: Record<string, string> = {
    "content-type": photo.mime || "image/jpeg",
    "cache-control": "private, max-age=31536000, immutable",
    etag,
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  if (sp.get("download") === "1") {
    const base = (photo.originalName || photo.id).replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").slice(0, 80) || photo.id;
    headers["content-disposition"] = `attachment; filename="${base}.jpg"`;
  }
  headers["content-length"] = String(data.length);
  return new Response(new Uint8Array(data), { headers });
});
