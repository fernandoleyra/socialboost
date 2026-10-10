"use client";

import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, Plus, RotateCcw, X } from "lucide-react";
import { Button, IconButton, Meter, Spinner, cx, toast } from "@/components/ui";
import { ACCEPT_ATTR, formatBytes, type PhotoView } from "@/lib/photo-core";
import { imageFilesFrom, uploadPhoto } from "./upload";

type Item = {
  key: string;
  file: File;
  preview: string | null;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

export type DropzoneVariant = "hero" | "panel" | "tile";

/**
 * Drag & drop / click / paste photo uploader with a per-file progress list.
 * Uploads run one at a time so a local vision model isn't flooded with captions.
 *  - hero:  big zone for the Photos library (also accepts pasted images)
 *  - panel: medium zone for "this story needs a photo"
 *  - tile:  square "+" tile at the end of a photo strip
 */
export function PhotoDropzone({
  memoryId = null,
  multiple = true,
  variant = "panel",
  title,
  subtitle,
  icon,
  onUploaded,
  acceptPaste = false,
  className,
}: {
  memoryId?: string | null;
  multiple?: boolean;
  variant?: DropzoneVariant;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  onUploaded?: (photo: PhotoView) => void;
  acceptPaste?: boolean;
  className?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const running = useRef(false);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;
  const keySeq = useRef(0);

  const enqueue = useCallback(
    (files: File[]) => {
      const imgs = imageFilesFrom(files);
      if (imgs.length === 0) {
        if (files.length) toast("Those files aren't photos. Use JPEG, PNG, WebP or HEIC.", "error");
        return;
      }
      const picked = multiple ? imgs : imgs.slice(0, 1);
      setItems((xs) => [
        ...xs,
        ...picked.map((file) => ({
          key: `u${++keySeq.current}`,
          file,
          preview: /^image\/(jpeg|png|webp|gif|avif)$/.test(file.type) ? URL.createObjectURL(file) : null,
          progress: 0,
          status: "queued" as const,
        })),
      ]);
    },
    [multiple],
  );

  // Work through the queue one file at a time.
  useEffect(() => {
    if (running.current) return;
    const next = items.find((i) => i.status === "queued");
    if (!next) return;
    running.current = true;
    const patch = (p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === next.key ? { ...x, ...p } : x)));
    patch({ status: "uploading", progress: 0.02 });
    uploadPhoto(next.file, { memoryId, onProgress: (f) => patch({ progress: Math.max(0.02, f * 0.92) }) })
      .then((photo) => {
        patch({ status: "done", progress: 1 });
        onUploadedRef.current?.(photo);
        setTimeout(() => setItems((xs) => xs.filter((x) => x.key !== next.key || x.status !== "done")), 2500);
      })
      .catch((err: Error) => {
        patch({ status: "error", error: err.message });
        toast(`${next.file.name}: ${err.message}`, "error");
      })
      .finally(() => {
        running.current = false;
        // Nudge the effect to pick the next queued file.
        setItems((xs) => [...xs]);
      });
  }, [items, memoryId]);

  // Release preview URLs when items go away.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const live = new Set(items.map((i) => i.preview).filter(Boolean) as string[]);
    for (const url of previews.current) if (!live.has(url)) URL.revokeObjectURL(url);
    previews.current = live;
  }, [items]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  useEffect(() => {
    if (!acceptPaste) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        enqueue(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptPaste, enqueue]);

  const open = () => inputRef.current?.click();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };
  const dragProps = {
    onDragEnter: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      enqueue(Array.from(e.dataTransfer.files));
    },
  };

  const input = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={ACCEPT_ATTR}
      multiple={multiple}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        enqueue(Array.from(e.target.files ?? []));
        e.target.value = "";
      }}
    />
  );
  const busy = items.some((i) => i.status === "uploading" || i.status === "queued");

  if (variant === "tile") {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={multiple ? "Add photos" : "Add a photo"}
        onClick={open}
        onKeyDown={onKey}
        {...dragProps}
        className={cx(
          "focus-ring grid shrink-0 cursor-pointer place-items-center rounded-inner border-2 border-dashed text-label-2 transition-colors",
          dragging ? "border-accent bg-fill-3 text-accent" : "border-separator hover:bg-fill-4",
          className,
        )}
      >
        {input}
        {busy ? (
          <span className="flex flex-col items-center gap-1.5 t-caption">
            <Spinner className="size-5" />
            {Math.round((items.find((i) => i.status === "uploading")?.progress ?? 0) * 100)}%
          </span>
        ) : (
          <span className="flex flex-col items-center gap-1 t-caption font-medium">
            <Plus className="size-5" />
            Add
          </span>
        )}
      </div>
    );
  }

  const hero = variant === "hero";
  return (
    <div className={cx("space-y-3", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label={multiple ? "Upload photos" : "Upload a photo"}
        onClick={open}
        onKeyDown={onKey}
        {...dragProps}
        className={cx(
          "focus-ring relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-panel border-2 border-dashed text-center transition-all",
          hero ? "glass px-6 py-12 sm:py-14" : "px-5 py-8",
          dragging ? "scale-[1.01] border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-separator hover:border-label-3",
        )}
      >
        {input}
        <span
          className={cx("grid place-items-center rounded-full", hero ? "size-16" : "size-12")}
          style={{ color: "var(--sys-orange)", background: "color-mix(in srgb, var(--sys-orange) 14%, transparent)" }}
        >
          {icon ?? (hero ? <ImagePlus className="size-7" /> : <Camera className="size-6" />)}
        </span>
        <span className="space-y-1">
          <span className={cx("block", hero ? "t-title-3" : "t-headline")}>{title ?? (dragging ? "Drop to upload" : multiple ? "Drop photos here" : "Drop a photo here")}</span>
          <span className="block t-subhead text-label-2 max-w-md">
            {subtitle ?? (
              <>
                or click to choose{acceptPaste ? ", or paste" : ""}. JPEG, PNG, WebP or HEIC, up to 25 MB.
              </>
            )}
          </span>
        </span>
        <Button
          type="button"
          variant={hero ? "primary" : "tinted"}
          size={hero ? "md" : "sm"}
          icon={<ImagePlus className="size-4" />}
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          {multiple ? "Choose photos" : "Choose a photo"}
        </Button>
      </div>

      {items.length > 0 && (
        <ul className="card list-group" aria-live="polite">
          {items.map((it) => (
            <li key={it.key} className="list-row">
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-fill-3">
                {it.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="size-4 text-label-3" />
                )}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate t-subhead font-medium">{it.file.name}</span>
                  <span className="shrink-0 t-caption text-label-2 tabular-nums">
                    {it.status === "queued" && "Waiting"}
                    {it.status === "uploading" && `${Math.round(it.progress * 100)}%`}
                    {it.status === "done" && "Uploaded"}
                    {it.status === "error" && formatBytes(it.file.size)}
                  </span>
                </span>
                {it.status === "error" ? (
                  <span className="block t-caption text-sys-red">{it.error}</span>
                ) : (
                  <Meter value={it.progress} color={it.status === "done" ? "var(--sys-green)" : undefined} />
                )}
              </span>
              {it.status === "done" && <CheckCircle2 className="size-5 shrink-0 text-sys-green" />}
              {it.status === "error" && (
                <span className="flex shrink-0 items-center">
                  <AlertTriangle className="size-4 text-sys-red" aria-hidden />
                  <IconButton label="Retry" onClick={() => setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, status: "queued", progress: 0, error: undefined } : x)))}>
                    <RotateCcw className="size-4" />
                  </IconButton>
                  <IconButton label="Dismiss" onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}>
                    <X className="size-4" />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
