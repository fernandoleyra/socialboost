"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Archive, ArchiveRestore, BookOpen, Camera, Check, Download, ExternalLink, Images, MessagesSquare, PenLine, Trash2, Unlink } from "lucide-react";
import { Button, Chip, Input, Segmented, Select, Sheet, Spinner, api, cx, toast } from "@/components/ui";
import { ConfirmSheet } from "@/components/photos/confirm-sheet";
import { PhotoChecks } from "@/components/photos/photo-checks";
import { PhotoDropzone } from "@/components/photos/photo-dropzone";
import { PhotoImg } from "@/components/photos/photo-img";
import { CaptionState, formatTakenAt } from "@/components/photos/photo-sheet";
import { PhotoTips } from "@/components/photos/photo-tips";
import { photoUrl, uploadPhoto } from "@/components/photos/upload";
import { ACCEPT_ATTR, type PhotoView } from "@/lib/photo-core";
import { MEMORY_STATUS_LABEL, appendParagraph, findPillar, type DepthTarget, type MemoryListItem } from "@/lib/memory-core";
import type { Memory, PostStatus } from "@/lib/types";
import { AutoTextarea, ListEditor, StrengthDots, TokenInput } from "./fields";
import { StoryDepth, type PillarLite } from "./story-depth";

type PostRef = { id: string; status: PostStatus; scheduledAt: string | null; publishedAt: string | null; linkedinUrl: string | null; updatedAt: string; hook: string };
type Detail = { memory: MemoryListItem; photos: PhotoView[]; posts: PostRef[] };

const DRAFT_KEYS = ["title", "summary", "story", "when", "place", "people", "emotions", "details", "quotes", "lesson", "pillar", "tags", "angles", "status", "strength"] as const;
type DraftKey = (typeof DRAFT_KEYS)[number];
type Draft = Pick<Memory, DraftKey>;

function toDraft(m: Memory): Draft {
  const d = {} as Record<DraftKey, unknown>;
  for (const k of DRAFT_KEYS) d[k] = m[k];
  return d as Draft;
}

function changes(base: Draft, next: Draft): Partial<Draft> {
  const out: Partial<Record<DraftKey, unknown>> = {};
  for (const k of DRAFT_KEYS) if (JSON.stringify(base[k]) !== JSON.stringify(next[k])) out[k] = next[k];
  // A blank title is invalid; hold it back until the person types one.
  if (typeof out.title === "string" && !out.title.trim()) delete out.title;
  return out as Partial<Draft>;
}

const byOldest = (a: PhotoView, b: PhotoView) => a.createdAt.localeCompare(b.createdAt);

export const POST_STATUS_TONE: Record<PostStatus, string> = {
  idea: "gray",
  draft: "blue",
  review: "orange",
  approved: "green",
  scheduled: "indigo",
  published: "teal",
  archived: "gray",
};

function Group({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="t-footnote font-semibold text-label-2 px-1">{label}</div>
      {children}
      {hint && <div className="t-caption text-label-3 px-1">{hint}</div>}
    </div>
  );
}

function fmtDate(iso: string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!iso) return "";
  try {
    return format(parseISO(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z"), pattern);
  } catch {
    return "";
  }
}

/** Inline viewer for one photo of the story. */
function PhotoPanel({ photo, onUnlink, onRecaption }: { photo: PhotoView; onUnlink: () => void; onRecaption: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const taken = formatTakenAt(photo.meta.takenAt);
  return (
    <div className="card grid gap-4 p-3 sm:grid-cols-[220px_minmax(0,1fr)] animate-in">
      <PhotoImg id={photo.id} size="full" fit="contain" className="h-56 w-full rounded-inner sm:h-64" alt={photo.caption || "Photo"} />
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {photo.isCandid === true && <Chip tone="green">Candid</Chip>}
          {photo.isCandid === false && <Chip tone="orange">Looks posed</Chip>}
          {taken && <Chip>Taken {taken}</Chip>}
        </div>
        {photo.caption && <p className="t-subhead">{photo.caption}</p>}
        {photo.userNote && <p className="t-footnote text-label-2">“{photo.userNote}”</p>}
        <CaptionState
          photo={photo}
          busy={busy}
          onRetry={async () => {
            setBusy(true);
            await onRecaption();
            setBusy(false);
          }}
        />
        <PhotoChecks photo={photo} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="glass" icon={<Unlink className="size-3.5" />} onClick={onUnlink}>
            Remove from story
          </Button>
          <a className="btn btn-glass btn-sm" href={photoUrl(photo.id, "full", true)} download>
            <Download className="size-3.5" />
            Download
          </a>
          <Link className="btn btn-plain btn-sm" href={`/photos?open=${photo.id}`}>
            <Images className="size-3.5" />
            Edit in Photos
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Story detail: everything the writer will use, editable with autosave; photos with the
 * always-on photo request; story depth with fill-the-gap probes; posts made from it.
 */
export function MemorySheet({
  memoryId,
  onClose,
  pillars,
  onChanged,
  onDeleted,
}: {
  memoryId: string | null;
  onClose: () => void;
  pillars: PillarLite[];
  onChanged: (m: MemoryListItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quickUploading, setQuickUploading] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const saved = useRef<Draft | null>(null);
  const latest = useRef<Draft | null>(null);
  const currentId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLDivElement>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  latest.current = draft;

  const load = useCallback(async (id: string) => {
    setError(null);
    setDetail(null);
    setDraft(null);
    setSelectedPhoto(null);
    setSaveState("idle");
    setRequestBusy(false);
    try {
      const d = await api<Detail>(`/api/memories/${id}`);
      if (currentId.current !== id) return;
      d.photos.sort(byOldest);
      setDetail(d);
      setDraft(toDraft(d.memory));
      saved.current = toDraft(d.memory);
    } catch (e) {
      if (currentId.current === id) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    currentId.current = memoryId;
    if (memoryId) void load(memoryId);
    else {
      setDetail(null);
      setDraft(null);
      saved.current = null;
    }
  }, [memoryId, load]);

  const save = useCallback(async () => {
    const id = currentId.current;
    const base = saved.current;
    const snapshot = latest.current;
    if (!id || !base || !snapshot) return;
    const diff = changes(base, snapshot);
    if (Object.keys(diff).length === 0) return;
    setSaveState("saving");
    try {
      const res = await api<{ memory: MemoryListItem }>(`/api/memories/${id}`, { method: "PATCH", json: diff });
      if (currentId.current === id) {
        saved.current = { ...base, ...diff };
        setSaveState("saved");
        setDetail((d) => (d ? { ...d, memory: res.memory } : d));
      }
      onChangedRef.current(res.memory);
    } catch (e) {
      if (currentId.current === id) setSaveState("error");
      toast((e as Error).message, "error");
    }
  }, []);

  // Debounced autosave.
  useEffect(() => {
    if (!draft || !saved.current) return;
    if (Object.keys(changes(saved.current, draft)).length === 0) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, save]);

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    void save();
    onClose();
  };

  const set = <K extends DraftKey>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const applyGap = (target: DepthTarget, value: string) => {
    if (!draft) return;
    switch (target) {
      case "when":
      case "place":
      case "lesson":
        set(target, value);
        break;
      case "pillar":
        set("pillar", value);
        break;
      case "storyAppend":
        set("story", appendParagraph(draft.story, value));
        break;
      case "details":
        set("details", [...draft.details, value]);
        break;
      case "quotes":
        set("quotes", [...draft.quotes, value.replace(/^["'“”]+|["'“”]+$/g, "").trim()]);
        break;
      case "photo":
        fileInput.current?.click();
        return;
    }
    toast(target === "pillar" ? "Pillar set" : "Added to the story");
  };

  /* ---------------- photos ---------------- */

  // Photo changes also update the card in the bank (count + cover), so compute outside the state updater.
  const detailRef = useRef<Detail | null>(null);
  detailRef.current = detail;
  const setPhotos = useCallback((update: (ps: PhotoView[]) => PhotoView[]) => {
    const d = detailRef.current;
    if (!d) return;
    const photos = update(d.photos).sort(byOldest);
    const memory = { ...d.memory, photoCount: photos.length, coverPhotoId: photos[0]?.id ?? null };
    const next = { ...d, photos, memory };
    detailRef.current = next;
    setDetail(next);
    onChangedRef.current(memory);
  }, []);

  const addPhoto = useCallback((p: PhotoView) => setPhotos((ps) => [...ps.filter((x) => x.id !== p.id), p]), [setPhotos]);

  const quickUpload = async (files: File[]) => {
    if (!memoryId || !files.length) return;
    setQuickUploading(true);
    photosRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    for (const f of files) {
      try {
        addPhoto(await uploadPhoto(f, { memoryId }));
      } catch (e) {
        toast(`${f.name}: ${(e as Error).message}`, "error");
      }
    }
    setQuickUploading(false);
  };

  // Poll while a fresh photo is still being described by the vision model.
  const pending = detail?.photos.some((p) => p.meta.captionStatus === "pending") ?? false;
  useEffect(() => {
    if (!pending || !memoryId) return;
    const t = setInterval(async () => {
      try {
        const res = await api<{ photos: PhotoView[] }>(`/api/photos?memoryId=${memoryId}`);
        if (currentId.current === memoryId) setPhotos(() => res.photos);
      } catch {
        /* try again next tick */
      }
    }, 3500);
    return () => clearInterval(t);
  }, [pending, memoryId, setPhotos]);

  const unlinkPhoto = async (id: string) => {
    try {
      await api(`/api/photos/${id}`, { method: "PATCH", json: { memoryId: null } });
      setPhotos((ps) => ps.filter((p) => p.id !== id));
      setSelectedPhoto(null);
      toast("Removed from the story. It's still in your Photos.");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const recaption = async (id: string) => {
    try {
      const res = await api<{ photo: PhotoView }>(`/api/photos/${id}/caption`, { method: "POST" });
      setPhotos((ps) => ps.map((p) => (p.id === id ? res.photo : p)));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  /* ---------------- actions ---------------- */

  const remove = async () => {
    if (!memoryId) return;
    await api(`/api/memories/${memoryId}`, { method: "DELETE" });
    saved.current = null;
    onDeleted(memoryId);
    toast("Story deleted");
    onClose();
  };

  const toggleArchive = () => {
    if (!draft) return;
    const archived = draft.status === "archived";
    set("status", archived ? "ready" : "archived");
    toast(archived ? "Back in your Memory Bank" : "Archived. Find it under Archived.");
  };

  const memory = detail?.memory;
  const photos = detail?.photos ?? [];
  // The photo request stays up while it is still uploading, even once the first photo has landed.
  const showRequest = photos.length === 0 || requestBusy;
  const selected = photos.find((p) => p.id === selectedPhoto) ?? null;
  const knownPillar = draft ? findPillar(pillars, draft.pillar) : null;
  const unknownPillar = draft?.pillar && !knownPillar ? draft.pillar : null;

  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : "";

  return (
    <>
      <Sheet
        open={!!memoryId}
        onClose={close}
        size="lg"
        title={
          <span className="flex items-center gap-2.5">
            Story
            {saveLabel && (
              <span className={cx("flex items-center gap-1 t-caption font-medium", saveState === "error" ? "text-sys-red" : "text-label-3")}>
                {saveState === "saving" ? <Spinner className="size-3" /> : saveState === "saved" ? <Check className="size-3" /> : null}
                {saveLabel}
              </span>
            )}
          </span>
        }
        footer={
          memory && draft ? (
            <>
              <Button variant="destructive" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)} className="mr-auto" aria-label="Delete story">
                <span className="max-sm:sr-only">Delete</span>
              </Button>
              <Button variant="glass" icon={draft.status === "archived" ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={toggleArchive} aria-label={draft.status === "archived" ? "Restore" : "Archive"}>
                <span className="max-sm:sr-only">{draft.status === "archived" ? "Restore" : "Archive"}</span>
              </Button>
              <Link href={`/studio/new?memory=${memory.id}`} className="btn btn-primary" onClick={() => void save()}>
                <PenLine className="size-4" />
                Write a post
              </Link>
            </>
          ) : undefined
        }
      >
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void quickUpload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />

        {error && (
          <div className="space-y-3 py-12 text-center">
            <p className="t-subhead text-label-2">{error}</p>
            <Button variant="glass" onClick={() => memoryId && load(memoryId)}>
              Try again
            </Button>
          </div>
        )}

        {!error && (!detail || !draft) && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading story">
            <div className="skeleton h-28 w-full" />
            <div className="skeleton h-10 w-2/3" />
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-40 w-full" />
          </div>
        )}

        {detail && draft && memory && (
          <div className="space-y-7">
            {/* Photos: every story asks for one */}
            {/* Fixed slots (strip, panel, request) so a dropzone with files still queued is never unmounted mid-upload. */}
            <div ref={photosRef} className="space-y-3">
              {photos.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {photos.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPhoto((s) => (s === p.id ? null : p.id))}
                      aria-pressed={p.id === selectedPhoto}
                      aria-label={p.caption || `Photo ${i + 1}`}
                      className={cx(
                        "focus-ring relative h-32 w-[6.4rem] shrink-0 overflow-hidden rounded-inner transition-shadow",
                        p.id === selectedPhoto && "ring-3 ring-accent ring-offset-2 ring-offset-[var(--bg-elevated)]",
                      )}
                    >
                      <PhotoImg id={p.id} className="h-full w-full" />
                      {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">Cover</span>}
                      {p.meta.captionStatus === "pending" && (
                        <span className="absolute inset-x-0 bottom-0 bg-black/45 py-1 text-center text-[10px] font-medium text-white backdrop-blur">Describing…</span>
                      )}
                    </button>
                  ))}
                  {quickUploading && (
                    <span className="grid h-32 w-[6.4rem] shrink-0 place-items-center rounded-inner bg-fill-4" aria-label="Uploading">
                      <Spinner />
                    </span>
                  )}
                  {!showRequest && <PhotoDropzone memoryId={memory.id} variant="tile" className="h-32 w-[6.4rem]" onUploaded={addPhoto} />}
                </div>
              )}
              {selected && <PhotoPanel photo={selected} onUnlink={() => unlinkPhoto(selected.id)} onRecaption={() => recaption(selected.id)} />}
              {showRequest && (
                <div className="space-y-4 rounded-panel p-4 sm:p-5" style={{ background: "color-mix(in srgb, var(--sys-orange) 9%, transparent)" }}>
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ color: "var(--sys-orange)", background: "color-mix(in srgb, var(--sys-orange) 16%, transparent)" }}>
                      <Camera className="size-4.5" />
                    </span>
                    <div>
                      <div className="t-headline">{photos.length === 0 ? "This story needs a photo" : "Adding your photos"}</div>
                      <p className="t-footnote text-label-2">
                        {photos.length === 0
                          ? "Every post goes out with a real photo. One from the moment is best. No photo from back then? Take one this week of the place, an object, or the people involved."
                          : "The rest of your photos are uploading. Keep this open until they're done."}
                      </p>
                    </div>
                  </div>
                  {quickUploading && photos.length === 0 && (
                    <div className="flex items-center gap-2 t-subhead text-label-2" aria-live="polite">
                      <Spinner className="size-4" /> Uploading…
                    </div>
                  )}
                  <PhotoDropzone memoryId={memory.id} variant="panel" onUploaded={addPhoto} onBusyChange={setRequestBusy} title="Drop a photo from this story" />
                  {photos.length === 0 && (
                    <details className="group">
                      <summary className="cursor-pointer t-footnote font-semibold text-accent">What makes a good photo</summary>
                      <PhotoTips className="pt-3" />
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* Title + classification */}
            <div className="space-y-3">
              <Input
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Give this story a short title"
                aria-label="Title"
                className={cx("min-h-[50px] text-[22px]! font-bold tracking-tight", !draft.title.trim() && "border-sys-red!")}
              />
              {!draft.title.trim() && <p className="px-1 t-caption text-sys-red">A story needs a title. Changes are saved once it has one.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Pillar"
                  className="w-auto! min-w-[10rem] max-w-full"
                  value={knownPillar?.id ?? unknownPillar ?? ""}
                  onChange={(e) => set("pillar", e.target.value || null)}
                >
                  <option value="">No pillar</option>
                  {pillars.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  {unknownPillar && <option value={unknownPillar}>{unknownPillar}</option>}
                </Select>
                <Segmented
                  value={draft.status}
                  onChange={(v) => set("status", v)}
                  options={(["raw", "ready", "used"] as const).map((s) => ({ value: s, label: MEMORY_STATUS_LABEL[s] }))}
                />
                <span className="flex items-center gap-1.5 rounded-full bg-fill-4 py-0.5 pl-3 pr-1">
                  <span className="t-caption font-medium text-label-2">Strength</span>
                  <StrengthDots value={draft.strength} onChange={(v) => set("strength", v)} size="md" />
                </span>
              </div>
              {draft.status === "archived" && <p className="px-1 t-footnote text-label-2">Archived. It won&apos;t be suggested for new posts until you restore it.</p>}
            </div>

            <StoryDepth draft={draft} photoCount={photos.length} pillars={pillars} onApply={applyGap} onAddPhoto={() => fileInput.current?.click()} />

            <Group label="The story" hint="In your words. Posts only use facts from this card, so add anything that's missing.">
              <AutoTextarea minRows={6} maxRows={30} value={draft.story} onChange={(e) => set("story", e.target.value)} aria-label="The story" className="li-text text-[15px]!" />
            </Group>

            <Group label="One-line summary">
              <Input value={draft.summary} onChange={(e) => set("summary", e.target.value)} placeholder="What happened and why it matters" aria-label="Summary" />
            </Group>

            <div className="grid gap-4 sm:grid-cols-2">
              <Group label="When">
                <Input value={draft.when} onChange={(e) => set("when", e.target.value)} placeholder="March 2024, a Tuesday morning" aria-label="When" />
              </Group>
              <Group label="Where">
                <Input value={draft.place} onChange={(e) => set("place", e.target.value)} placeholder="Client's office in Munich" aria-label="Where" />
              </Group>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Group label="People" hint="Check they're OK being named, or use a role.">
                <TokenInput label="People" value={draft.people} onChange={(v) => set("people", v)} placeholder="My co-founder Anna, the CFO" />
              </Group>
              <Group label="Feelings">
                <TokenInput label="Feelings" value={draft.emotions} onChange={(v) => set("emotions", v)} placeholder="Nervous, relieved" max={8} />
              </Group>
            </div>

            <Group label="Concrete details" hint="Numbers, objects, what you could see or hear. These make a post believable.">
              <ListEditor value={draft.details} onChange={(v) => set("details", v)} placeholder="Add a detail, e.g. 14 tabs open, all spreadsheets" addLabel="Add detail" />
            </Group>

            <Group label="Exact words" hint="Things someone said or thought, word for word.">
              <ListEditor
                value={draft.quotes}
                onChange={(v) => set("quotes", v)}
                placeholder="Add a line someone said"
                addLabel="Add quote"
                renderItem={(q) => (
                  <blockquote className="border-l-[3px] border-accent py-1 pl-3.5 t-callout font-medium italic">
                    “{q}”
                  </blockquote>
                )}
              />
            </Group>

            <Group label="The lesson">
              <AutoTextarea minRows={2} maxRows={8} value={draft.lesson} onChange={(e) => set("lesson", e.target.value)} placeholder="The one sentence you'd teach a new hire" aria-label="The lesson" />
            </Group>

            <Group label="Post angles" hint="Different ways this story could become a post.">
              <ListEditor value={draft.angles} onChange={(v) => set("angles", v)} placeholder="Add an angle" addLabel="Add angle" />
            </Group>

            <Group label="Tags">
              <TokenInput label="Tags" value={draft.tags} onChange={(v) => set("tags", v.map((t) => t.toLowerCase()))} placeholder="hiring, pricing" max={12} />
            </Group>

            <Group label={`Posts from this story${detail.posts.length ? ` (${detail.posts.length})` : ""}`}>
              {detail.posts.length ? (
                <div className="card list-group">
                  {detail.posts.map((p) => (
                    <Link key={p.id} href={`/studio/${p.id}`} className="list-row hover:bg-fill-4">
                      <Chip tone={POST_STATUS_TONE[p.status]} className="capitalize">
                        {p.status}
                      </Chip>
                      <span className="min-w-0 flex-1 truncate t-subhead">{p.hook || "Untitled idea"}</span>
                      <span className="shrink-0 t-caption text-label-2">{fmtDate(p.publishedAt ?? p.scheduledAt ?? p.updatedAt, "d MMM")}</span>
                      {p.linkedinUrl && <ExternalLink className="size-3.5 shrink-0 text-label-3" />}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="px-1 t-footnote text-label-2">No posts yet. “Write a post” turns this story into a draft in your voice.</p>
              )}
            </Group>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-separator pt-4 t-caption text-label-3">
              <span className="flex items-center gap-1.5">
                <BookOpen className="size-3.5" />
                Added {fmtDate(memory.createdAt)}
              </span>
              {memory.interviewId && (
                <Link href={`/interviews/${memory.interviewId}`} className="flex items-center gap-1.5 text-accent">
                  <MessagesSquare className="size-3.5" />
                  From an interview
                </Link>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this story?"
        confirmLabel="Delete story"
        body={
          <>
            {memory?.postCount ? `${memory.postCount === 1 ? "One post was" : `${memory.postCount} posts were`} made from it; they keep their text. ` : ""}
            Its photos stay in your Photos library. This can&apos;t be undone.
          </>
        }
        onConfirm={remove}
      />
    </>
  );
}
