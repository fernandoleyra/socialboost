import fs from "node:fs/promises";
import { handle, HttpError } from "@/lib/http";
import { getPhoto } from "@/lib/repo";
import { photoFilePath, type PhotoSize } from "@/lib/photos";
import type { Photo } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The file for the requested size; a missing thumbnail falls back to the full image. */
async function locate(photo: Photo, size: PhotoSize): Promise<{ file: string; served: PhotoSize; bytes: number; mtimeMs: number }> {
  for (const s of size === "thumb" ? (["thumb", "full"] as const) : (["full"] as const)) {
    const file = photoFilePath(photo, s);
    try {
      const st = await fs.stat(file);
      if (st.isFile()) return { file, served: s, bytes: st.size, mtimeMs: st.mtimeMs };
    } catch {
      /* try the next size */
    }
  }
  throw new HttpError(404, "The photo file is missing from data/uploads.");
}

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

  const { file, served, bytes, mtimeMs } = await locate(photo, size);
  const etag = `"${photo.id}-${served}-${bytes}-${Math.round(mtimeMs)}"`;
  const headers: Record<string, string> = {
    "content-type": photo.mime || "image/jpeg",
    "cache-control": "private, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    etag,
  };
  // Revalidation never needs the bytes.
  if (req.headers.get("if-none-match")?.split(",").some((t) => t.trim().replace(/^W\//, "") === etag)) {
    return new Response(null, { status: 304, headers });
  }
  if (sp.get("download") === "1") {
    const base = (photo.originalName || photo.id).replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_").slice(0, 80) || photo.id;
    headers["content-disposition"] = `attachment; filename="${base}.jpg"`;
  }
  const data = await fs.readFile(file).catch(() => {
    throw new HttpError(404, "The photo file is missing from data/uploads.");
  });
  headers["content-length"] = String(data.length);
  return new Response(new Uint8Array(data), { headers });
});
