import { MAX_UPLOAD_BYTES, formatBytes, isHeicName, type PhotoView } from "@/lib/photo-core";

/** URL of a stored photo. Thumbs for grids, full for sheets and downloads. */
export function photoUrl(id: string, size: "thumb" | "full" = "thumb", download = false): string {
  return `/api/photos/${encodeURIComponent(id)}/file?size=${size}${download ? "&download=1" : ""}`;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/** Decode in the browser and re-encode as JPEG (HEIC on Safari, or oversized photos). */
async function reencode(file: File, maxEdge: number, quality: number): Promise<File | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return null;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return null;
  }
}

type UploadOptions = {
  memoryId?: string | null;
  note?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

function send(file: File, opts: UploadOptions): Promise<PhotoView> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file, file.name);
    if (opts.memoryId) form.append("memoryId", opts.memoryId);
    if (opts.note) form.append("note", opts.note);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/photos");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: { photo?: PhotoView; error?: string; hint?: string } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.photo) {
        opts.onProgress?.(1);
        resolve(data.photo);
        return;
      }
      const msg = data?.error ?? `Upload failed (${xhr.status}).`;
      reject(new UploadError(data?.hint ? `${msg} — ${data.hint}` : msg, xhr.status));
    };
    xhr.onerror = () => reject(new UploadError("Network error while uploading. Is SocialBoost still running?", 0));
    xhr.onabort = () => reject(new UploadError("Upload cancelled.", 0));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/**
 * Upload one photo to POST /api/photos with progress.
 * - Oversized photos are downscaled in the browser first (when it can decode them).
 * - HEIC goes to the server as-is (keeps the capture date); if this machine's image library
 *   can't decode HEIC, the browser converts it to JPEG and we retry (works in Safari).
 */
export async function uploadPhoto(file: File, opts: UploadOptions = {}): Promise<PhotoView> {
  let f = file;
  if (f.size > MAX_UPLOAD_BYTES) {
    const smaller = await reencode(f, 4096, 0.88);
    if (!smaller || smaller.size > MAX_UPLOAD_BYTES) throw new UploadError(`${file.name} is ${formatBytes(file.size)}. The limit is 25 MB.`, 413);
    f = smaller;
  }
  try {
    return await send(f, opts);
  } catch (err) {
    if (err instanceof UploadError && err.status === 415 && isHeicName(file.name, file.type)) {
      const jpg = await reencode(file, 4096, 0.92);
      if (jpg) return send(jpg, opts);
    }
    throw err;
  }
}

/** Keep only files that look like images (by type or extension). */
export function imageFilesFrom(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(f.name));
}
