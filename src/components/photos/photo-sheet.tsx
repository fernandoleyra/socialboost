"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { AlertTriangle, BookOpen, Download, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { Button, Chip, Field, Sheet, Switch, Textarea, Typing, api, toast } from "@/components/ui";
import { PHOTO_KIND_LABEL, aspectInfo, formatBytes, type PhotoView } from "@/lib/photo-core";
import { ConfirmSheet } from "./confirm-sheet";
import { MemoryPicker, type PickerMemory } from "./memory-picker";
import { PhotoChecks } from "./photo-checks";
import { PhotoImg } from "./photo-img";
import { photoUrl } from "./upload";

export function formatTakenAt(takenAt: string | null): string | null {
  if (!takenAt) return null;
  try {
    return format(parseISO(takenAt), "d MMM yyyy, HH:mm");
  } catch {
    return null;
  }
}

/** Caption status line: describing… / failed with the model's hint / nothing. */
export function CaptionState({ photo, onRetry, busy }: { photo: PhotoView; onRetry?: () => void; busy?: boolean }) {
  if (busy || photo.meta.captionStatus === "pending") {
    return (
      <span className="flex items-center gap-2 t-footnote text-label-2">
        <Typing /> Describing the photo…
      </span>
    );
  }
  if (photo.meta.captionStatus === "failed") {
    return (
      <span className="flex flex-wrap items-start gap-x-2 gap-y-1 t-footnote text-label-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-sys-orange" />
        <span className="min-w-0 flex-1">Couldn&apos;t describe it automatically. {photo.meta.captionError}</span>
        {onRetry && (
          <button type="button" className="font-semibold text-accent" onClick={onRetry}>
            Try again
          </button>
        )}
      </span>
    );
  }
  return null;
}

/**
 * Photo detail: big preview, AI caption (editable, re-runnable), candid flag, the person's
 * own note, which story it belongs to, advice, and privacy facts.
 */
export function PhotoSheet({
  photo,
  open,
  onClose,
  memories,
  onChanged,
  onDeleted,
  onCreateStory,
}: {
  photo: PhotoView | null;
  open: boolean;
  onClose: () => void;
  memories: PickerMemory[];
  onChanged: (p: PhotoView) => void;
  onDeleted: (id: string) => void;
  onCreateStory?: (p: PhotoView) => void;
}) {
  const [caption, setCaption] = useState("");
  const [note, setNote] = useState("");
  const [recaptioning, setRecaptioning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setCaption(photo?.caption ?? "");
    setNote(photo?.userNote ?? "");
    // Only reset local text when a different photo opens or the model finished a caption.
  }, [photo?.id, photo?.caption, photo?.userNote]);

  if (!photo) return null;

  const patch = async (body: Record<string, unknown>, success?: string) => {
    setSaving(true);
    try {
      const res = await api<{ photo: PhotoView }>(`/api/photos/${photo.id}`, { method: "PATCH", json: body });
      onChanged(res.photo);
      if (success) toast(success);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const recaption = async () => {
    setRecaptioning(true);
    try {
      const res = await api<{ photo: PhotoView }>(`/api/photos/${photo.id}/caption`, { method: "POST" });
      onChanged(res.photo);
      toast("Photo described");
    } catch (e) {
      toast((e as Error).message, "error");
      try {
        onChanged((await api<{ photo: PhotoView }>(`/api/photos/${photo.id}`)).photo);
      } catch {
        /* keep what we have */
      }
    } finally {
      setRecaptioning(false);
    }
  };

  const remove = async () => {
    await api(`/api/photos/${photo.id}`, { method: "DELETE" });
    onDeleted(photo.id);
    toast("Photo deleted");
    onClose();
  };

  const aspect = aspectInfo(photo.width, photo.height);
  const taken = formatTakenAt(photo.meta.takenAt);
  const kind = photo.meta.analysis ? PHOTO_KIND_LABEL[photo.meta.analysis.kind] : null;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        size="lg"
        title={photo.memoryTitle ? `Photo · ${photo.memoryTitle}` : "Photo"}
        footer={
          <>
            <Button variant="destructive" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)} className="mr-auto" aria-label="Delete photo">
              <span className="max-sm:sr-only">Delete</span>
            </Button>
            <a href={photoUrl(photo.id, "full", true)} className="btn btn-glass" download>
              <Download className="size-4" />
              <span className="max-sm:sr-only">Download</span>
            </a>
            {photo.memoryId && (
              <Link href={`/memories?open=${photo.memoryId}`} className="btn btn-tinted">
                <BookOpen className="size-4" />
                Open story
              </Link>
            )}
          </>
        }
      >
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <PhotoImg id={photo.id} size="full" fit="contain" alt={photo.caption || "Photo"} className="max-h-[56vh] w-full rounded-inner" width={photo.width} height={photo.height} />
            <div className="flex flex-wrap gap-1.5">
              {photo.isCandid === true && <Chip tone="green">Candid</Chip>}
              {photo.isCandid === false && <Chip tone="orange">Looks posed</Chip>}
              {kind && <Chip>{kind}</Chip>}
              <Chip>{aspect.label}</Chip>
              {taken && <Chip>{taken}</Chip>}
            </div>
            <PhotoChecks photo={photo} />
          </div>

          <div className="space-y-5">
            <Field label="What the photo shows" hint="Written by your vision model. Edit it if it got something wrong; the writer uses it.">
              <Textarea
                rows={3}
                value={caption}
                placeholder={photo.meta.captionStatus === "pending" ? "Describing…" : "Describe what's in the photo"}
                onChange={(e) => setCaption(e.target.value)}
                onBlur={() => caption.trim() !== photo.caption && patch({ caption })}
              />
            </Field>
            <div className="-mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <CaptionState photo={photo} busy={recaptioning} onRetry={recaption} />
              {!recaptioning && photo.meta.captionStatus !== "pending" && (
                <Button variant="plain" size="sm" icon={<Sparkles className="size-3.5" />} onClick={recaption} className="ml-auto">
                  Describe again
                </Button>
              )}
            </div>

            <div className="card list-group">
              <div className="list-row">
                <span className="flex-1">
                  <span className="block t-subhead font-medium">Candid photo</span>
                  <span className="block t-caption text-label-2">Real and unposed. The kind that makes a post believable.</span>
                </span>
                <Switch label="Candid photo" checked={photo.isCandid === true} onChange={(v) => patch({ isCandid: v })} />
              </div>
            </div>

            <Field label="Your note" hint="The one line you'd tell a friend about this photo. Great raw material for a hook.">
              <Textarea rows={2} value={note} placeholder="Two minutes before we went on stage" onChange={(e) => setNote(e.target.value)} onBlur={() => note.trim() !== photo.userNote && patch({ userNote: note })} />
            </Field>

            <div className="space-y-2">
              <div className="t-footnote font-semibold text-label-2 px-1">Story</div>
              <MemoryPicker
                memories={memories}
                value={photo.memoryId}
                disabled={saving}
                onChange={(id) => id !== photo.memoryId && patch({ memoryId: id }, id ? "Added to the story" : "Removed from the story")}
                onCreateNew={onCreateStory ? () => onCreateStory(photo) : undefined}
              />
            </div>

            <div className="card list-group t-footnote">
              <div className="list-row">
                <span className="flex-1 text-label-2">Size</span>
                <span className="tabular-nums">
                  {photo.width && photo.height ? `${photo.width} × ${photo.height}` : "Unknown"}
                  {photo.meta.originalBytes ? ` · original ${formatBytes(photo.meta.originalBytes)}` : ""}
                </span>
              </div>
              {photo.originalName && (
                <div className="list-row">
                  <span className="flex-1 text-label-2">File</span>
                  <span className="max-w-[60%] truncate">{photo.originalName}</span>
                </div>
              )}
              <div className="list-row">
                <span className="flex-1 text-label-2">Used in posts</span>
                <span className="tabular-nums">{photo.postCount}</span>
              </div>
              <div className="list-row">
                <ShieldCheck className="size-4 shrink-0 text-sys-green" />
                <span className="flex-1 text-label-2">
                  {photo.meta.hadLocation ? "Location and camera data were removed before saving." : "Camera data was removed before saving."}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this photo?"
        confirmLabel="Delete photo"
        body={
          photo.postCount > 0
            ? `It's used in ${photo.postCount === 1 ? "a post" : `${photo.postCount} posts`}. Those posts will keep their text but lose the image. This can't be undone.`
            : "The file is removed from this computer. This can't be undone."
        }
        onConfirm={remove}
      />
    </>
  );
}
