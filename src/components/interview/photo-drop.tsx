"use client";

import { useRef, useState, type DragEvent } from "react";
import { Camera, Clock, Lightbulb, Loader2 } from "lucide-react";
import { Button, cx, toast } from "@/components/ui";
import { PHOTO_TIPS } from "@/lib/interview/bank";
import type { Photo } from "@/lib/types";
import { PHOTO_ACCEPT, imageFiles, uploadPhoto } from "./upload";

/**
 * Drag-and-drop / click-to-pick photo zone. Uploads every picked file to the Photos module
 * (optionally straight onto a memory) and reports the stored photos when all are done.
 */
export function PhotoDrop({
  memoryId,
  onUploaded,
  title = "Add a photo from this story",
  subtitle = "Drop it here or tap to choose. The place, the people, an object, a screenshot.",
  compact,
  disabled,
}: {
  memoryId?: string;
  onUploaded: (photos: Photo[]) => void | Promise<void>;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const upload = async (files: File[]) => {
    if (!files.length || progress !== null) return;
    setProgress(0);
    const parts = files.map(() => 0);
    const done: Photo[] = [];
    try {
      for (const [i, file] of files.entries()) {
        done.push(
          await uploadPhoto(file, {
            memoryId,
            onProgress: (p) => {
              parts[i] = p;
              setProgress(parts.reduce((a, b) => a + b, 0) / files.length);
            },
          }),
        );
      }
      await onUploaded(done);
    } catch (err) {
      toast((err as Error).message, "error");
      if (done.length) await onUploaded(done);
    } finally {
      setProgress(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) void upload(imageFiles(e.dataTransfer.files));
  };

  const busy = progress !== null;
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || busy}
      onClick={() => !disabled && !busy && input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && !busy && (e.preventDefault(), input.current?.click())}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cx(
        "focus-ring flex cursor-pointer items-center gap-4 rounded-[20px] border-[1.5px] border-dashed transition-colors",
        compact ? "p-3" : "p-5",
        dragging ? "border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-[color:var(--label-4)] bg-fill-4 hover:bg-fill-3",
        (disabled || busy) && "cursor-default opacity-80",
      )}
    >
      <span className={cx("grid shrink-0 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--sys-orange)_16%,transparent)] text-sys-orange", compact ? "size-10" : "size-12")}>
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block t-subhead font-semibold">{busy ? `Uploading… ${Math.round((progress ?? 0) * 100)}%` : title}</span>
        {!compact && <span className="mt-0.5 block t-footnote text-label-2">{subtitle}</span>}
        {busy && (
          <span className="mt-2 block h-1 overflow-hidden rounded-full bg-fill-3">
            <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(6, (progress ?? 0) * 100)}%` }} />
          </span>
        )}
      </span>
      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void upload(imageFiles(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** The inline card the chat shows when the interviewer asks for a photo. */
export function PhotoRequestCard({ requestId, onPhotos, onLater, busy }: { requestId: string; onPhotos: (ids: string[]) => Promise<void>; onLater: () => void; busy: boolean }) {
  // Deterministic per request so server and client render the same tip.
  const tip = PHOTO_TIPS[[...requestId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PHOTO_TIPS.length];
  return (
    <div className="ml-10 max-w-[560px] space-y-3 rounded-[24px] glass p-3 animate-pop">
      <PhotoDrop disabled={busy} onUploaded={(photos) => onPhotos(photos.map((p) => p.id))} />
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="flex min-w-0 items-start gap-1.5 t-caption text-label-2">
          <Lightbulb className="mt-px size-3.5 shrink-0 text-sys-yellow" />
          <span>{tip}</span>
        </p>
        <Button size="sm" variant="plain" icon={<Clock className="size-3.5" />} onClick={onLater} disabled={busy}>
          Remind me later
        </Button>
      </div>
    </div>
  );
}
