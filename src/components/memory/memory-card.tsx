"use client";

import { useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Camera, Images, PenLine } from "lucide-react";
import { Chip, Spinner, TONES, cx, toast } from "@/components/ui";
import { PhotoImg } from "@/components/photos/photo-img";
import { uploadPhoto } from "@/components/photos/upload";
import { ACCEPT_ATTR, type PhotoView } from "@/lib/photo-core";
import { MEMORY_STATUS_LABEL, findPillar, needsPhoto, type MemoryListItem } from "@/lib/memory-core";
import { StrengthDots } from "./fields";
import type { PillarLite } from "./story-depth";

function shortDate(sqlOrIso: string): string {
  try {
    return format(parseISO(sqlOrIso.includes("T") ? sqlOrIso : sqlOrIso.replace(" ", "T") + "Z"), "d MMM");
  } catch {
    return "";
  }
}

/**
 * One story in the bank. A story without a photo shows a soft placeholder with an
 * "Add a photo" button that uploads straight to it.
 */
export function MemoryCard({ memory, pillars, onOpen, onPhotoAdded }: { memory: MemoryListItem; pillars: PillarLite[]; onOpen: () => void; onPhotoAdded: (photo: PhotoView) => void }) {
  const pillar = findPillar(pillars, memory.pillar);
  const tone = TONES[pillar?.color ?? "blue"] ?? TONES.blue;
  const missingPhoto = needsPhoto(memory);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      for (const f of files) {
        const photo = await uploadPhoto(f, { memoryId: memory.id });
        onPhotoAdded(photo);
      }
      toast(`Photo added to “${memory.title}”`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <article className={cx("card card-interactive relative flex flex-col overflow-hidden text-left", memory.status === "archived" && "opacity-70")}>
      {/* The whole card opens the story; the "Add a photo" button sits above this layer and stays reachable. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open story: ${memory.title}`}
        className="focus-ring absolute inset-0 z-[1] cursor-pointer rounded-[inherit] focus-visible:[outline-offset:-3px]"
      />
      <div className="relative aspect-[16/10] w-full">
        {memory.coverPhotoId ? (
          <PhotoImg id={memory.coverPhotoId} className="h-full w-full" alt="" />
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-2"
            style={{ background: `linear-gradient(145deg, ${tone.bg}, color-mix(in srgb, var(--sys-orange) 10%, transparent))` }}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                void upload(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              aria-label={uploading ? `Uploading a photo to ${memory.title}` : `Add a photo to ${memory.title}`}
              className="glass-strong focus-ring relative z-[2] flex items-center gap-2 rounded-full px-4 py-2 t-footnote font-semibold transition-transform active:scale-95"
            >
              {uploading ? <Spinner className="size-4" /> : <Camera className="size-4 text-sys-orange" />}
              {uploading ? "Uploading…" : "Add a photo"}
            </button>
          </div>
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {missingPhoto && (
            <Chip tone="orange" className="bg-[var(--bg-elevated)]! shadow-sm">
              <Camera className="size-3" />
              Needs a photo
            </Chip>
          )}
          {memory.status !== "ready" && (
            <span className="rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] font-semibold leading-5 text-white backdrop-blur">{MEMORY_STATUS_LABEL[memory.status]}</span>
          )}
        </div>
        {(memory.photoCount ?? 0) > 1 && (
          <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            <Images className="size-3" />
            {memory.photoCount}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="t-headline line-clamp-2">{memory.title}</h3>
        {memory.summary && <p className="t-subhead text-label-2 line-clamp-2">{memory.summary}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
          {pillar ? <Chip tone={pillar.color}>{pillar.name}</Chip> : memory.pillar ? <Chip>{memory.pillar}</Chip> : null}
          <StrengthDots value={memory.strength} />
          <span className="ml-auto flex items-center gap-2 t-caption text-label-2">
            {memory.postCount > 0 && (
              <span className="flex items-center gap-1" title={`Used in ${memory.postCount} post${memory.postCount === 1 ? "" : "s"}`}>
                <PenLine className="size-3" />
                {memory.postCount}
              </span>
            )}
            <span suppressHydrationWarning>{shortDate(memory.createdAt)}</span>
          </span>
        </div>
      </div>
    </article>
  );
}
