"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { ArrowUp, ImagePlus, Loader2, Mic, Square, X, AlertTriangle } from "lucide-react";
import { cx, toast } from "@/components/ui";
import type { Photo } from "@/lib/types";
import { imageFilesFrom, uploadPhoto } from "@/components/photos/upload";
import { ACCEPT_ATTR } from "@/lib/photo-core";
import { useDictation } from "./use-dictation";

type Attachment = { key: string; preview: string; progress: number; photo?: Photo; error?: string };

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Matches the reply API's limit; longer answers are better split into a few messages. */
const MAX_ANSWER_CHARS = 8000;

/**
 * The floating glass composer: autosizing textarea (Enter sends, Shift+Enter newline),
 * photo attachments (button, drag & drop, paste) and voice answers.
 */
export function Composer({
  busy,
  disabled,
  allowPhotos = true,
  lang,
  placeholder,
  focusKey,
  onSend,
  onStop,
}: {
  busy: boolean;
  disabled?: boolean;
  /** Story interviews take photos; the positioning interview doesn't need them. */
  allowPhotos?: boolean;
  lang: string;
  placeholder: string;
  focusKey?: number;
  onSend: (content: string, photoIds: string[]) => Promise<boolean>;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const keyRef = useRef(0);

  const dictation = useDictation({
    lang,
    onText: (t) => setText((cur) => (cur.trim() ? `${cur.replace(/\s+$/, "")} ${t}` : t)),
    onInterim: setInterim,
  });

  // Autosize the textarea to its content (max ~8 lines, then scroll).
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  useEffect(() => {
    if (focusKey) area.current?.focus();
  }, [focusKey]);

  // Release object URLs when attachments go away.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const live = new Set(attachments.map((a) => a.preview));
    for (const url of previews.current) if (!live.has(url)) URL.revokeObjectURL(url);
    previews.current = live;
  }, [attachments]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const addFiles = (files: File[]) => {
    if (!files.length || !allowPhotos) return;
    if (attachments.length + files.length > 6) {
      toast("Up to 6 photos per answer.", "info");
      files = files.slice(0, Math.max(0, 6 - attachments.length));
    }
    for (const file of files) {
      const key = `a${++keyRef.current}`;
      const preview = URL.createObjectURL(file);
      setAttachments((xs) => [...xs, { key, preview, progress: 0 }]);
      uploadPhoto(file, { onProgress: (p) => setAttachments((xs) => xs.map((a) => (a.key === key ? { ...a, progress: p } : a))) })
        .then((photo) => setAttachments((xs) => xs.map((a) => (a.key === key ? { ...a, photo, progress: 1 } : a))))
        .catch((err: Error) => {
          setAttachments((xs) => xs.map((a) => (a.key === key ? { ...a, error: err.message } : a)));
          toast(err.message, "error");
        });
    }
  };

  const uploading = attachments.some((a) => !a.photo && !a.error);
  const ready = attachments.filter((a) => a.photo).map((a) => a.photo!.id);
  const tooLong = text.trim().length > MAX_ANSWER_CHARS;
  const canSend = !busy && !disabled && !sending && !uploading && (text.trim().length > 0 || ready.length > 0);

  const send = async () => {
    if (!canSend) return;
    if (tooLong) {
      toast(`That answer is over ${MAX_ANSWER_CHARS.toLocaleString("en-US")} characters. Send the first part now and the rest in your next message.`, "info");
      return;
    }
    if (dictation.status === "recording") dictation.stop();
    setSending(true);
    const accepted = await onSend(text.trim(), ready);
    setSending(false);
    if (accepted) {
      setText("");
      setAttachments([]);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) addFiles(imageFilesFrom(e.dataTransfer.files));
  };

  const onPaste = (e: ClipboardEvent) => {
    if (!allowPhotos) return;
    const files = imageFilesFrom(Array.from(e.clipboardData.files));
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const recording = dictation.status === "recording";
  const transcribing = dictation.status === "transcribing";

  return (
    <div
      className={cx("glass rounded-[28px] p-2 transition-shadow", dragging && "ring-2 ring-[color:var(--accent)]")}
      onDragOver={(e) => {
        if (allowPhotos && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-2 pt-1 pb-2">
          {attachments.map((a) => (
            <div key={a.key} className="relative size-16 shrink-0 overflow-hidden rounded-[14px] bg-fill-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.preview} alt="" className={cx("size-full object-cover", !a.photo && "opacity-60")} />
              {!a.photo && !a.error && (
                <div className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-black/25">
                  <span className="block h-full rounded-full bg-white transition-[width]" style={{ width: `${Math.max(8, a.progress * 100)}%` }} />
                </div>
              )}
              {a.error && (
                <div className="absolute inset-0 grid place-items-center bg-black/45 text-white" title={a.error}>
                  <AlertTriangle className="size-5" />
                </div>
              )}
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => setAttachments((xs) => xs.filter((x) => x.key !== a.key))}
                className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(recording || transcribing || interim) && (
        <div className="flex items-center gap-2 px-3 pb-1.5 t-footnote text-label-2" aria-live="polite">
          {recording && <span className="size-2 animate-pulse rounded-full bg-sys-red" />}
          {transcribing && <Loader2 className="size-3.5 animate-spin" />}
          <span className="truncate">
            {transcribing ? "Transcribing your answer…" : interim ? interim : `Listening… ${fmtTime(dictation.seconds)} — tap the mic to stop`}
          </span>
        </div>
      )}

      {tooLong && (
        <p className="px-3 pb-1.5 t-footnote text-sys-orange" role="status">
          {text.trim().length.toLocaleString("en-US")} / {MAX_ANSWER_CHARS.toLocaleString("en-US")} characters. Split this into two messages.
        </p>
      )}

      <div className={cx("flex items-end gap-1", !allowPhotos && "pl-2")}>
        {allowPhotos && (
          <>
            <button
              type="button"
              className="icon-btn focus-ring shrink-0 text-label-2"
              aria-label="Add photos"
              title="Add photos"
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus className="size-5" />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              hidden
              onChange={(e) => {
                addFiles(imageFilesFrom(e.target.files));
                e.target.value = "";
              }}
            />
          </>
        )}
        <label className="sr-only" htmlFor="interview-answer">
          Your answer
        </label>
        <textarea
          id="interview-answer"
          ref={area}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={placeholder}
          className="max-h-[220px] min-h-[36px] flex-1 resize-none bg-transparent px-1.5 py-[7px] t-body outline-none placeholder:text-label-3"
        />
        {dictation.mode !== "none" && dictation.mode !== "checking" && (
          <button
            type="button"
            className={cx("icon-btn focus-ring shrink-0", recording ? "bg-sys-red text-white hover:bg-sys-red" : "text-label-2")}
            aria-label={recording ? "Stop recording" : "Answer by voice"}
            title={recording ? "Stop recording" : dictation.mode === "server" ? "Answer by voice (transcribed on your server)" : "Answer by voice (browser dictation)"}
            aria-pressed={recording}
            disabled={disabled || transcribing || busy}
            onClick={() => (recording ? dictation.stop() : dictation.start())}
          >
            {transcribing ? <Loader2 className="size-5 animate-spin" /> : recording ? <Square className="size-4 fill-current" /> : <Mic className="size-5" />}
          </button>
        )}
        {busy ? (
          <button type="button" onClick={onStop} aria-label="Stop" title="Stop" className="grid size-9 shrink-0 place-items-center rounded-full bg-label text-[color:var(--bg-elevated)] transition-transform active:scale-90">
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            aria-label="Send"
            title="Send (Enter)"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-white shadow-[0_4px_12px_-4px_var(--accent)] transition-[transform,opacity] active:scale-90 disabled:opacity-35 disabled:shadow-none"
          >
            {sending || uploading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-[18px]" strokeWidth={2.6} />}
          </button>
        )}
      </div>
    </div>
  );
}
