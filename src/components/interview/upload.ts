"use client";

import type { Photo } from "@/lib/types";

export const PHOTO_ACCEPT = "image/*,.heic,.heif";

export function photoUrl(id: string, size: "thumb" | "full" = "thumb") {
  return `/api/photos/${encodeURIComponent(id)}/file?size=${size}`;
}

/**
 * Upload one photo to the Photos module (POST /api/photos, multipart) with progress.
 * XHR instead of fetch because fetch has no upload progress events.
 */
export function uploadPhoto(file: File, opts: { memoryId?: string; note?: string; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file, file.name);
    if (opts.memoryId) form.append("memoryId", opts.memoryId);
    if (opts.note) form.append("note", opts.note);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/photos");
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: { photo?: Photo; error?: string; hint?: string } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.photo) return resolve(data.photo);
      const msg = data?.error ?? `Upload failed (${xhr.status})`;
      reject(new Error(data?.hint ? `${msg} — ${data.hint}` : msg));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

export function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|avif)$/i.test(f.name));
}
