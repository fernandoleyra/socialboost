"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Images, Library, Link2 } from "lucide-react";
import { Chip, EmptyState, PageHeader, Segmented, Typing, api, cx } from "@/components/ui";
import { AddMemorySheet } from "@/components/memory/add-memory-sheet";
import type { PillarLite } from "@/components/memory/story-depth";
import { photoChecks, type PhotoView } from "@/lib/photo-core";
import type { MemoryListItem } from "@/lib/memory-core";
import type { PickerMemory } from "./memory-picker";
import { PhotoDropzone } from "./photo-dropzone";
import { PhotoImg } from "./photo-img";
import { PhotoSheet } from "./photo-sheet";
import { PhotoTips } from "./photo-tips";

export type LibraryMemory = { id: string; title: string; status: string };
type Filter = "all" | "unassigned" | "linked";

function PhotoCard({ photo, onOpen }: { photo: PhotoView; onOpen: () => void }) {
  const pending = photo.meta.captionStatus === "pending";
  const textWarning = photoChecks(photo, photo.meta).some((c) => c.id === "text");
  return (
    <button type="button" onClick={onOpen} className="card card-interactive focus-ring mb-4 block w-full break-inside-avoid overflow-hidden text-left">
      <PhotoImg id={photo.id} width={photo.width} height={photo.height} alt={photo.caption} className="w-full" />
      <div className="space-y-2 p-3">
        {pending ? (
          <span className="flex items-center gap-2 t-footnote text-label-2">
            <Typing />
            Describing…
          </span>
        ) : photo.caption ? (
          <p className="t-footnote line-clamp-3">{photo.caption}</p>
        ) : (
          <p className="t-footnote text-label-3">{photo.userNote || "No description yet"}</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {photo.isCandid === true && <Chip tone="green">Candid</Chip>}
          {photo.isCandid === false && <Chip tone="orange">Posed</Chip>}
          {textWarning && (
            <Chip tone="yellow">
              <AlertTriangle className="size-3" />
              Check text
            </Chip>
          )}
          {photo.memoryTitle ? (
            <Chip tone="blue" className="max-w-full">
              <Library className="size-3 shrink-0" />
              <span className="min-w-0 truncate">{photo.memoryTitle}</span>
            </Chip>
          ) : (
            <Chip>
              <Link2 className="size-3" />
              Not in a story
            </Chip>
          )}
        </div>
      </div>
    </button>
  );
}

function SegmentLabel({ label, count }: { label: string; count: number }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      {count > 0 && <span className="tabular-nums text-label-3">{count}</span>}
    </span>
  );
}

/** The photo library: bulk upload, captions from the vision model, linking photos to stories. */
export function PhotoLibrary({
  initialPhotos,
  memories: initialMemories,
  pillars,
  openId,
  initialFilter,
}: {
  initialPhotos: PhotoView[];
  memories: LibraryMemory[];
  pillars: PillarLite[];
  openId: string | null;
  initialFilter: Filter;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [memories, setMemories] = useState(initialMemories);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [open, setOpen] = useState<string | null>(openId);
  const [storyFrom, setStoryFrom] = useState<PhotoView | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ photos: PhotoView[] }>("/api/photos");
      setPhotos(res.photos);
    } catch {
      /* keep showing what we have; the next action will surface errors */
    }
  }, []);

  // Captions arrive in the background; poll while any photo is still being described.
  const pending = photos.some((p) => p.meta.captionStatus === "pending");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(refresh, 3500);
    return () => clearInterval(t);
  }, [pending, refresh]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (open) params.set("open", open);
    const qs = params.toString();
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname);
  }, [filter, open]);

  // Story list for the picker, with photo counts and covers derived from the library itself.
  const pickerMemories: PickerMemory[] = useMemo(() => {
    const byMemory = new Map<string, PhotoView[]>();
    for (const p of photos) if (p.memoryId) byMemory.set(p.memoryId, [...(byMemory.get(p.memoryId) ?? []), p]);
    return memories.map((m) => {
      const own = (byMemory.get(m.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return { id: m.id, title: m.title, status: m.status, photoCount: own.length, coverPhotoId: own[0]?.id ?? null };
    });
  }, [memories, photos]);

  const unassigned = photos.filter((p) => !p.memoryId).length;
  const shown = photos.filter((p) => (filter === "unassigned" ? !p.memoryId : filter === "linked" ? !!p.memoryId : true));
  const current = photos.find((p) => p.id === open) ?? null;

  const replace = (p: PhotoView) => setPhotos((ps) => ps.map((x) => (x.id === p.id ? p : x)));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Photos"
        title="Your photos"
        subtitle="Real, candid photos are what make a story believable. Drop in phone photos from real moments, then link each one to the story it belongs to."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <PhotoDropzone variant="hero" acceptPaste onUploaded={(p) => setPhotos((ps) => [p, ...ps.filter((x) => x.id !== p.id)])} />
        <aside className="glass space-y-4 rounded-panel p-5">
          <div className="t-headline">What works on LinkedIn</div>
          <PhotoTips limit={5} />
        </aside>
      </div>

      {photos.length === 0 ? (
        <EmptyState
          icon={<Images />}
          title="No photos yet"
          body="Start with a few from your camera roll: the meeting room, the whiteboard, the event, the people you worked with. Candid beats polished. We describe each one and check it looks real."
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
              <Segmented
                value={filter}
                onChange={setFilter}
                className="w-max whitespace-nowrap"
                options={[
                  { value: "all", label: <SegmentLabel label="All" count={photos.length} /> },
                  { value: "unassigned", label: <SegmentLabel label="Not in a story" count={unassigned} /> },
                  { value: "linked", label: <SegmentLabel label="In a story" count={photos.length - unassigned} /> },
                ]}
              />
            </div>
            {unassigned > 0 && filter !== "unassigned" && (
              <p className="t-footnote text-label-2">
                {unassigned === 1 ? "1 photo isn't" : `${unassigned} photos aren't`} linked to a story yet. Open one to link it.
              </p>
            )}
          </div>
          {shown.length === 0 ? (
            <EmptyState
              icon={<Link2 />}
              title={filter === "unassigned" ? "Every photo is in a story" : "No photos linked to stories yet"}
              body={filter === "unassigned" ? "Nice. New uploads land here until you link them." : "Open a photo and choose the story it belongs to."}
            />
          ) : (
            <div className={cx("columns-1 gap-4 min-[420px]:columns-2 md:columns-3 xl:columns-4")}>
              {shown.map((p) => (
                <PhotoCard key={p.id} photo={p} onOpen={() => setOpen(p.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      <PhotoSheet
        photo={current}
        open={!!current && !storyFrom}
        onClose={() => setOpen(null)}
        memories={pickerMemories}
        onChanged={replace}
        onDeleted={(id) => {
          setPhotos((ps) => ps.filter((p) => p.id !== id));
          setOpen(null);
        }}
        onCreateStory={(p) => setStoryFrom(p)}
      />

      <AddMemorySheet
        open={!!storyFrom}
        onClose={() => {
          setStoryFrom(null);
          void refresh();
        }}
        pillars={pillars}
        initialPhotos={storyFrom ? [storyFrom] : []}
        onCreated={(m: MemoryListItem) => {
          setMemories((ms) => (ms.some((x) => x.id === m.id) ? ms.map((x) => (x.id === m.id ? { ...x, title: m.title } : x)) : [{ id: m.id, title: m.title, status: m.status }, ...ms]));
          if (storyFrom) setPhotos((ps) => ps.map((p) => (p.id === storyFrom.id ? { ...p, memoryId: m.id, memoryTitle: m.title } : p)));
        }}
      />
    </div>
  );
}
