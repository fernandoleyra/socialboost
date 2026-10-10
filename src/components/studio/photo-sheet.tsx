"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { Button, Chip, Sheet, cx } from "@/components/ui";
import { imageFilesFrom } from "@/components/photos/upload";
import type { PhotoLite } from "@/lib/factory/types";
import { ACCEPT_ATTR } from "@/lib/photo-core";
import { photoSrc } from "./shared";

/**
 * Client-side guard before uploading. Size is left to the Photos uploader, which shrinks
 * oversized photos in the browser; the Photos API validates again.
 */
export function photoProblem(file: File): string | null {
  return imageFilesFrom([file]).length ? null : `${file.name} isn't a photo. Use JPEG, PNG, WebP or HEIC.`;
}

export function PhotoDrop({ onFile, uploading, compact }: { onFile: (f: File) => void; uploading: boolean; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cx("grid place-items-center rounded-card border-2 border-dashed text-center transition-colors", compact ? "px-4 py-5" : "px-6 py-8", over ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-separator")}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <div className="flex flex-col items-center gap-2">
        {uploading ? <Loader2 className="size-6 animate-spin text-label-2" /> : <ImagePlus className="size-6 text-label-2" />}
        <div className="t-subhead font-semibold">{uploading ? "Uploading…" : "Drop a photo here"}</div>
        {!compact && <div className="t-caption text-label-2 max-w-xs">Portrait (hold your phone upright), natural light, you in the frame if it's your story. No filters.</div>}
        <Button size="sm" variant="glass" onClick={() => input.current?.click()} disabled={uploading}>
          Choose a photo
        </Button>
      </div>
    </div>
  );
}

function Grid({ photos, selectedId, onSelect, disabled }: { photos: PhotoLite[]; selectedId: string | null; onSelect: (id: string) => void; disabled: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((p) => {
        const sel = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(p.id)}
            className={cx("group relative aspect-[4/5] overflow-hidden rounded-inner bg-fill-4 focus-ring", sel && "ring-[3px] ring-[var(--accent)]")}
            title={p.caption || p.userNote || "Photo"}
            aria-pressed={sel}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc(p.id)} alt={p.caption || "Photo"} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
            {sel && (
              <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-[var(--accent)] text-white">
                <Check className="size-3.5" />
              </span>
            )}
            {p.isCandid && (
              <span className="absolute bottom-1.5 left-1.5">
                <Chip tone="green" className="glass-strong !h-5 !px-1.5 !text-[10px]">
                  <Sparkles className="size-2.5" />
                  Candid
                </Chip>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PhotoSheet({
  open,
  onClose,
  memoryPhotos,
  libraryPhotos,
  selectedId,
  hasMemory,
  uploading,
  saving,
  onSelect,
  onUpload,
}: {
  open: boolean;
  onClose: () => void;
  memoryPhotos: PhotoLite[];
  libraryPhotos: PhotoLite[];
  selectedId: string | null;
  hasMemory: boolean;
  uploading: boolean;
  saving: boolean;
  onSelect: (id: string | null) => void;
  onUpload: (f: File) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Photo for this post"
      size="lg"
      footer={
        selectedId ? (
          <Button variant="destructive" size="sm" onClick={() => onSelect(null)} disabled={saving}>
            Post without a photo
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <p className="t-subhead text-label-2">Real photos from the moment are proof the story happened, and image posts reach more people than text alone. Never use AI-generated pictures of yourself.</p>
        <PhotoDrop onFile={onUpload} uploading={uploading} />
        {hasMemory && (
          <section className="space-y-2">
            <h3 className="t-subhead font-semibold">From this story</h3>
            {memoryPhotos.length ? (
              <Grid photos={memoryPhotos} selectedId={selectedId} onSelect={onSelect} disabled={saving || uploading} />
            ) : (
              <p className="t-footnote text-label-2">No photos attached to this story yet. Whatever you upload here is added to it.</p>
            )}
          </section>
        )}
        {libraryPhotos.length > 0 && (
          <section className="space-y-2">
            <h3 className="t-subhead font-semibold">Your library</h3>
            <Grid photos={libraryPhotos} selectedId={selectedId} onSelect={onSelect} disabled={saving || uploading} />
          </section>
        )}
      </div>
    </Sheet>
  );
}
