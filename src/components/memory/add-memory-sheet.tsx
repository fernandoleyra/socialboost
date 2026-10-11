"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button, Field, Input, Select, Sheet, Switch, Typing, api, toast } from "@/components/ui";
import { PhotoDropzone } from "@/components/photos/photo-dropzone";
import { PhotoImg } from "@/components/photos/photo-img";
import { PhotoTips } from "@/components/photos/photo-tips";
import type { PhotoView } from "@/lib/photo-core";
import type { MemoryListItem } from "@/lib/memory-core";
import { AutoTextarea } from "./fields";
import type { PillarLite } from "./story-depth";

/**
 * Add a story by hand. Step 1: write it (optionally let the extractor pull out people,
 * numbers, quotes and the lesson). Step 2: the photo request every story gets.
 */
export function AddMemorySheet({
  open,
  onClose,
  pillars,
  initialPhotos = [],
  onCreated,
  onOpenStory,
}: {
  open: boolean;
  onClose: () => void;
  pillars: PillarLite[];
  /** Photos to attach (when starting a story from a photo in the library). */
  initialPhotos?: PhotoView[];
  onCreated: (m: MemoryListItem) => void;
  onOpenStory?: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [pillar, setPillar] = useState("");
  const [when, setWhen] = useState("");
  const [place, setPlace] = useState("");
  const [enrich, setEnrich] = useState(true);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<MemoryListItem | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoView[]>([]);
  // Read when the sheet opens; later changes to the prop's identity don't reset the form.
  const initialRef = useRef(initialPhotos);
  initialRef.current = initialPhotos;
  /** Start from a blank form on the next open: true at first and after a story was saved. */
  const resetNext = useRef(true);
  const draftEmpty = useRef(true);
  draftEmpty.current = !story.trim() && !title.trim();

  // A story typed and then closed by a stray tap or Esc is still here when the sheet reopens.
  useEffect(() => {
    if (!open) return;
    setSaving(false);
    if (resetNext.current || draftEmpty.current) {
      resetNext.current = false;
      setTitle("");
      setStory("");
      setPillar("");
      setWhen("");
      setPlace("");
      setCreated(null);
      setWarning(null);
      setPhotos(initialRef.current);
    } else {
      // Opened again from another photo: add it to the draft.
      setPhotos((ps) => [...ps, ...initialRef.current.filter((p) => !ps.some((x) => x.id === p.id))]);
    }
  }, [open]);

  const tooShort = story.trim().length < 40;

  const save = async () => {
    if (tooShort || saving) return;
    setSaving(true);
    try {
      const res = await api<{ memory: MemoryListItem; warning?: string }>("/api/memories", {
        method: "POST",
        json: {
          story,
          ...(title.trim() ? { title: title.trim() } : {}),
          ...(pillar ? { pillar } : {}),
          ...(when.trim() ? { when: when.trim() } : {}),
          ...(place.trim() ? { place: place.trim() } : {}),
          photoIds: photos.map((p) => p.id),
          enrich,
        },
      });
      const memory = { ...res.memory, postCount: 0 };
      resetNext.current = true;
      setCreated(memory);
      setWarning(res.warning ?? null);
      onCreated(memory);
      toast("Saved to your Memory Bank");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  const onUploaded = (p: PhotoView) => {
    setPhotos((ps) => [...ps, p]);
    if (created) {
      const next = { ...created, photoCount: (created.photoCount ?? 0) + 1, coverPhotoId: created.coverPhotoId ?? p.id };
      setCreated(next);
      onCreated(next);
    }
  };

  if (created) {
    const hasPhoto = photos.length > 0;
    return (
      <Sheet
        open={open}
        onClose={onClose}
        size="md"
        title="Saved to your Memory Bank"
        footer={
          <>
            {!hasPhoto && (
              <Button variant="glass" onClick={onClose} className="mr-auto">
                Remind me later
              </Button>
            )}
            {onOpenStory && (
              <Button variant="glass" onClick={() => onOpenStory(created.id)}>
                Open story
              </Button>
            )}
            <Button variant="primary" onClick={onClose} disabled={!hasPhoto}>
              Done
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-sys-green" />
            <div className="min-w-0">
              <div className="t-headline">{created.title}</div>
              {created.summary && <p className="t-footnote text-label-2">{created.summary}</p>}
              {warning && <p className="mt-1 t-caption text-sys-orange">{warning}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <div className="t-title-3">{hasPhoto ? "Photo attached" : "Now add a photo"}</div>
            <p className="t-subhead text-label-2">
              {hasPhoto
                ? "Add more if you have them. The first one becomes the post's photo."
                : "Every post goes out with a real photo. One from that moment is best. If you don't have one, “Remind me later” keeps the story flagged until you add it."}
            </p>
          </div>
          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((p) => (
                <PhotoImg key={p.id} id={p.id} className="h-24 w-20 shrink-0 rounded-inner" alt={p.caption} />
              ))}
            </div>
          )}
          <PhotoDropzone memoryId={created.id} variant="panel" onUploaded={onUploaded} title={hasPhoto ? "Drop another photo" : "Drop a photo from this story"} />
          {!hasPhoto && <PhotoTips limit={4} />}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={saving ? () => undefined : onClose}
      size="md"
      title="Add a story"
      footer={
        <>
          <Button variant="glass" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={tooShort}>
            Save story
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="t-subhead text-label-2">
          Write it the way you'd tell a friend. Start with the moment: where you were, who was there, what was said, what changed. Real details beat polish.
        </p>
        <Field label="Title" hint="Optional. We'll suggest one.">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The client who fired us on a Friday" disabled={saving} />
        </Field>
        <Field label="What happened">
          <AutoTextarea
            minRows={7}
            maxRows={18}
            value={story}
            onChange={(e) => setStory(e.target.value)}
            disabled={saving}
            placeholder="Last March, at 6pm on a Friday, our biggest client called. “We're moving everything in-house.” I was standing in the kitchen of our old office…"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When">
            <Input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="March 2024" disabled={saving} />
          </Field>
          <Field label="Where">
            <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Our old office in Berlin" disabled={saving} />
          </Field>
        </div>
        {pillars.length > 0 && (
          <Field label="Pillar">
            <Select value={pillar} onChange={(e) => setPillar(e.target.value)} disabled={saving}>
              <option value="">{enrich ? "Let AI choose" : "No pillar"}</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="card list-group">
          <div className="list-row">
            <Sparkles className="size-4.5 shrink-0 text-accent" />
            <span className="flex-1">
              <span className="block t-subhead font-medium">Pull out the details for me</span>
              <span className="block t-caption text-label-2">People, numbers, exact quotes, the lesson and post angles. Your story text stays exactly as you wrote it.</span>
            </span>
            <Switch label="Pull out the details for me" checked={enrich} onChange={setEnrich} />
          </div>
        </div>
        {photos.length > 0 && (
          <div className="flex items-center gap-3">
            <PhotoImg id={photos[0].id} className="size-14 shrink-0 rounded-inner" />
            <span className="t-footnote text-label-2">{photos.length === 1 ? "This photo will be attached." : `${photos.length} photos will be attached.`}</span>
          </div>
        )}
        {saving && (
          <div className="flex items-center gap-3 t-footnote text-label-2" aria-live="polite">
            <Typing />
            {enrich ? "Reading your story and pulling out the details. Local models can take up to a minute." : "Saving…"}
          </div>
        )}
        {tooShort && story.length > 0 && <p className="t-caption text-label-3 px-1">Keep going: a couple of sentences at least.</p>}
      </div>
    </Sheet>
  );
}
