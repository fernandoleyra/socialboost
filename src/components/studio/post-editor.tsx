"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clipboard,
  Download,
  ExternalLink,
  History,
  MoreHorizontal,
  PenLine,
  RotateCcw,
  Sparkles,
  Send,
  Square,
  TextQuote,
  Trash2,
  Type,
  Wand2,
} from "lucide-react";
import { uploadPhoto } from "@/components/photos/upload";
import { Button, Chip, IconButton, Input, Sheet, Typing, api, cx, streamText, toast } from "@/components/ui";
import { hookOf, parseAngleField, replaceHook, type Angle, type HookOption } from "@/lib/factory/angles";
import { linkedinComposerUrl } from "@/lib/calendar/linkedin-format";
import { cleanPost, toClipboard } from "@/lib/factory/clean";
import { STALE_PUBLISH_MS, VERIFY_MESSAGE, publishingSince } from "@/lib/calendar/linkedin-format";
import { LINKEDIN_MAX_CHARS, autofix, lintPost, type LintHit } from "@/lib/factory/lint";
import { REVISE_PRESETS, type RevisePresetId } from "@/lib/factory/prompts";
import { combineScore, isCritiqueFresh, qualityGate } from "@/lib/factory/quality";
import type { Cadence, TakenSlot } from "@/lib/factory/schedule";
import { STATUS_META } from "@/lib/factory/status";
import { recommendStructures } from "@/lib/factory/structures";
import type { PostDetail } from "@/lib/factory/types";
import type { Critique, Post, PostQuality, PostStatus, VoiceStats } from "@/lib/types";
import { AnglesSheet } from "./angles-sheet";
import { EditorSurface, type EditorSurfaceHandle, type FocusRange } from "./editor-surface";
import { HooksSheet } from "./hooks-sheet";
import { LinkedInPreview } from "./linkedin-preview";
import { PhotoSheet, photoProblem } from "./photo-sheet";
import { QualityPanel } from "./quality-panel";
import { ScheduleSheet } from "./schedule-sheet";
import { PillarChip, StatusChip, When, formatWhen, photoSrc, useHydrated, type PillarLite } from "./shared";
import { StoryPanel } from "./story-panel";
import { VersionsSheet } from "./versions-sheet";

export type EditorProps = {
  initial: PostDetail;
  author: { name: string; headline: string; avatarPhotoId: string | null };
  pillars: PillarLite[];
  voiceStats: VoiceStats | null;
  voiceSamples: number;
  neverSay: string[];
  /** Everything the post may state as fact (null when no memory is linked: no fact check). */
  facts: string | null;
  /** The memory's story text, for the "copied from your notes" check. */
  notes: string | null;
  cadence: Cadence | null;
  /** The profile's time zone (the cadence is in it). */
  timezone: string;
  /** Other dated posts (planned, scheduled, published): their days aren't suggested again. */
  taken: TakenSlot[];
  hasCta: boolean;
  autoAngles: boolean;
};

type Busy = "angles" | "draft" | "revise" | "hooks" | "status" | "photo" | "publish" | null;
type SheetName = "angles" | "versions" | "hooks" | "photo" | "schedule" | "approve-no-photo" | "delete" | "rewrite-approved" | "mark-posted" | null;
type SaveState = "saved" | "dirty" | "saving" | "error";


function InlineError({ message }: { message: string }) {
  return (
    <div className="flex gap-2 rounded-card p-3.5 t-footnote" role="alert" style={{ background: "color-mix(in srgb, var(--sys-red) 10%, transparent)" }}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-sys-red" />
      <span>
        {message}
        {/settings|model|ollama/i.test(message) && (
          <>
            {" "}
            <Link href="/settings" className="font-semibold text-accent">
              Open Settings → Models
            </Link>
          </>
        )}
      </span>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const label = { saved: "Saved", dirty: "Edited", saving: "Saving…", error: "Not saved" }[state];
  return (
    <span className={cx("inline-flex items-center gap-1.5 t-footnote", state === "error" ? "text-sys-red" : "text-label-2")} aria-live="polite">
      {state === "saved" && <Check className="size-3.5" />}
      {label}
    </span>
  );
}

function Menu({ items }: { items: { label: string; icon: typeof Clipboard; onClick: () => void; destructive?: boolean; hidden?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        root.current?.querySelector<HTMLElement>("button")?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const els = [...(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      if (!els.length) return;
      e.preventDefault();
      const i = els.indexOf(document.activeElement as HTMLElement);
      els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length].focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div ref={root} className="relative">
      <IconButton label="More actions" onClick={() => setOpen((o) => !o)} className="btn-glass !size-9" aria-expanded={open} aria-haspopup="menu">
        <MoreHorizontal className="size-4.5" />
      </IconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div ref={list} className="glass-strong absolute right-0 top-full z-50 mt-2 w-60 rounded-[18px] p-1.5 animate-pop" role="menu">
            {items
              .filter((i) => !i.hidden)
              .map(({ label, icon: Icon, onClick, destructive }) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onClick();
                  }}
                  className={cx("flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left t-subhead hover:bg-fill-3", destructive && "text-sys-red")}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PostEditor(props: EditorProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [detail, setDetail] = useState(props.initial);
  const post = detail.post;
  const id = post.id;

  /* ---------------- text + autosave ---------------- */
  const [body, setBodyState] = useState(post.body);
  const bodyRef = useRef(post.body);
  const savedRef = useRef(post.body);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const surface = useRef<EditorSurfaceHandle>(null);

  const setBody = (text: string) => {
    bodyRef.current = text;
    setBodyState(text);
  };

  const persist = useCallback(
    (text: string) => {
      chain.current = chain.current.then(async () => {
        if (text === savedRef.current) {
          setSaveState(bodyRef.current === savedRef.current ? "saved" : "dirty");
          return;
        }
        setSaveState("saving");
        try {
          const { post: p } = await api<{ post: Post }>(`/api/posts/${id}`, { method: "PATCH", json: { body: text } });
          savedRef.current = text;
          setDetail((d) => ({ ...d, post: p }));
          setSaveState(bodyRef.current === text ? "saved" : "dirty");
        } catch (e) {
          setSaveState("error");
          toast((e as Error).message, "error");
        }
      });
      return chain.current;
    },
    [id],
  );

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    await persist(bodyRef.current);
  }, [persist]);

  const onUserEdit = (text: string) => {
    setBody(text);
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(bodyRef.current), 1100);
  };

  /** Set while a draft or revision streams in. The text on screen is then the model's, not the user's. */
  const abortRef = useRef<AbortController | null>(null);

  // Don't lose edits: warn on tab close, save on in-app navigation. Mid-generation there is nothing of
  // the user's to save (their text was flushed before it started) and the server stores the result itself.
  useEffect(() => {
    const unsaved = () => abortRef.current === null && bodyRef.current !== savedRef.current;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (unsaved()) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
      if (unsaved()) {
        void fetch(`/api/posts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: bodyRef.current }), keepalive: true });
      }
    };
  }, [flush, id]);

  /* ---------------- derived quality ---------------- */
  const deferred = useDeferredValue(body);
  const lint = useMemo(() => lintPost(deferred, props.voiceStats, { facts: props.facts ?? undefined, notes: props.notes ?? undefined, neverSay: props.neverSay }), [deferred, props.voiceStats, props.facts, props.notes, props.neverSay]);
  const critique: Critique | null = post.quality?.critique ?? null;
  const critiqueFresh = isCritiqueFresh(post.quality, body);
  const score = combineScore(lint.score, lint.issues, critiqueFresh ? critique : null);
  const gate = qualityGate({ ...(post.quality ?? { critique: null, checkedAt: "" }), lint: lint.issues, score } as PostQuality, body);

  const angleField = useMemo(() => parseAngleField(post.angle), [post.angle]);
  const recommended = useMemo(() => (detail.memory ? recommendStructures(detail.memory, { hasPhoto: !!post.photoId })[0] : "scene-lesson"), [detail.memory, post.photoId]);
  const pillar = props.pillars.find((p) => p.id === post.pillar) ?? props.pillars.find((p) => p.name.trim().toLowerCase() === (post.pillar ?? "").trim().toLowerCase()) ?? null;

  /* ---------------- UI state ---------------- */
  const [busy, setBusy] = useState<Busy>(null);
  const [streaming, setStreaming] = useState(false);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [anglesError, setAnglesError] = useState<string | null>(null);
  const [critiquing, setCritiquing] = useState(false);
  const [critiqueError, setCritiqueError] = useState<string | null>(null);
  const [hooks, setHooks] = useState<HookOption[]>([]);
  const [hooksError, setHooksError] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRange | null>(null);
  const [instruction, setInstruction] = useState("");
  const [uploading, setUploading] = useState(false);
  const locked = busy !== null || streaming;
  const published = post.status === "published";
  const archived = post.status === "archived";
  /** Set while the scheduler or a "Publish now" is sending the post (M6's in-flight marker). */
  const publishingAt = publishingSince(post.error);
  /** The send is still in flight: the server refuses deletes and restores until it settles. */
  const sending = !!publishingAt && (!hydrated || Date.now() - publishingAt.getTime() < STALE_PUBLISH_MS);
  /** An attempt that LinkedIn didn't confirm: it may be live already. */
  const unconfirmed = post.error === VERIFY_MESSAGE;

  const refresh = useCallback(async () => {
    const d = await api<PostDetail>(`/api/posts/${id}`);
    setDetail(d);
    return d;
  }, [id]);

  /** Approved/scheduled text goes back to review when the writer rewrites it: ask first. */
  const guardRewrite = (fn: () => void) => {
    if (post.status === "approved" || post.status === "scheduled") {
      setPending(() => fn);
      setSheet("rewrite-approved");
    } else fn();
  };

  /* ---------------- critique ---------------- */
  const runCritique = useCallback(
    async (opts: { auto?: boolean } = {}) => {
      setCritiquing(true);
      setCritiqueError(null);
      const sent = bodyRef.current;
      try {
        const res = await api<{ post: Post; critique: Critique }>("/api/studio/critique", { method: "POST", json: { postId: id, body: sent } });
        setDetail((d) => ({ ...d, post: res.post }));
        // The critique saves the text it read. If the user kept typing meanwhile, autosave owns the state.
        if (res.post.body === sent && bodyRef.current === sent) {
          savedRef.current = sent;
          setSaveState("saved");
        }
        if (!opts.auto) toast("Critique ready");
      } catch (e) {
        const msg = (e as Error).message;
        setCritiqueError(msg);
        if (!opts.auto) toast(msg, "error");
      } finally {
        setCritiquing(false);
      }
    },
    [id],
  );

  /* ---------------- streamed generation ---------------- */
  const generate = async (kind: "draft" | "revise", url: string, payload: Record<string, unknown>, done: string) => {
    await flush();
    const before = bodyRef.current;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(kind);
    setStreaming(true);
    setInlineError(null);
    setFocus(null);
    try {
      await streamText(url, payload, (_piece, full) => setBody(cleanPost(full)), ctrl.signal);
      const d = await refresh();
      setBody(d.post.body);
      savedRef.current = d.post.body;
      setSaveState("saved");
      toast(done);
      if (kind === "draft") void runCritique({ auto: true });
    } catch (e) {
      setBody(before);
      if (ctrl.signal.aborted) {
        toast("Stopped. Your previous text is back.", "info");
        // If the writer finished just before the stop, the server kept its version: show what's stored.
        try {
          const d = await refresh();
          if (before === savedRef.current) {
            setBody(d.post.body);
            savedRef.current = d.post.body;
            setSaveState("saved");
          }
        } catch {
          /* keep the local text; the next edit saves it */
        }
      } else {
        const msg = (e as Error).message;
        setInlineError(msg);
        toast(msg, "error");
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setBusy(null);
    }
  };

  const stop = () => abortRef.current?.abort();

  const draft = (angle?: Angle) =>
    guardRewrite(() => {
      setSheet(null);
      void generate("draft", "/api/studio/draft", { postId: id, ...(angle ? { angle } : {}) }, "Draft ready. Read it out loud once.");
    });

  const revise = (payload: { preset?: RevisePresetId; instruction?: string; fix?: "lint" | "critique" | "all" }, done = "Revised") =>
    guardRewrite(() => void generate("revise", "/api/studio/revise", { postId: id, body: bodyRef.current, ...payload }, done));

  const sendInstruction = () => {
    const text = instruction.trim();
    if (!text) return;
    setInstruction("");
    revise({ instruction: text });
  };

  /* ---------------- angles & hooks ---------------- */
  const suggestAngles = useCallback(async () => {
    setSheet("angles");
    setBusy("angles");
    setAnglesError(null);
    try {
      const res = await api<{ angles: Angle[]; post: Post }>("/api/studio/angles", { method: "POST", json: { postId: id } });
      setDetail((d) => ({ ...d, post: res.post }));
    } catch (e) {
      const msg = (e as Error).message;
      setAnglesError(msg);
      toast(msg, "error");
    } finally {
      setBusy(null);
    }
  }, [id]);

  const autoRan = useRef(false);
  useEffect(() => {
    if (!props.autoAngles || autoRan.current) return;
    autoRan.current = true;
    router.replace(`/studio/${id}`, { scroll: false });
    if (!post.memoryId || post.body.trim()) return;
    if (angleField.options.length) setSheet("angles");
    else void suggestAngles();
  }, [props.autoAngles, id, post.memoryId, post.body, angleField.options.length, router, suggestAngles]);

  const loadHooks = async () => {
    await flush();
    setSheet("hooks");
    setBusy("hooks");
    setHooksError(null);
    try {
      const res = await api<{ hooks: HookOption[] }>("/api/studio/hooks", { method: "POST", json: { postId: id, body: bodyRef.current } });
      setHooks(res.hooks);
    } catch (e) {
      const msg = (e as Error).message;
      setHooksError(msg);
      toast(msg, "error");
    } finally {
      setBusy(null);
    }
  };

  const applyHook = (hook: string) => {
    onUserEdit(replaceHook(bodyRef.current, hook));
    setSheet(null);
    toast("New first line in place");
  };

  /* ---------------- status ---------------- */
  const patch = async (json: Record<string, unknown>, done?: string) => {
    await flush();
    setBusy("status");
    try {
      const { post: p } = await api<{ post: Post }>(`/api/posts/${id}`, { method: "PATCH", json });
      setDetail((d) => ({ ...d, post: p }));
      if (done) toast(done);
      return p;
    } catch (e) {
      toast((e as Error).message, "error");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (status: PostStatus, extra: Record<string, unknown> = {}, done?: string) => patch({ status, ...extra }, done ?? STATUS_META[status].label);

  /** A post that already has a future date on the calendar is queued for it on approval (PATCH /api/posts/[id]). */
  const approveNow = async () => {
    const p = await patch({ status: "approved" });
    if (p) toast(p.status === "scheduled" && p.scheduledAt ? `Approved and queued for ${formatWhen(p.scheduledAt, { timeZone: props.timezone })}` : "Approved. Schedule it when you're ready.");
    return p;
  };

  const approve = () => {
    if (!post.photoId) setSheet("approve-no-photo");
    else void approveNow();
  };

  const schedule = async (iso: string) => {
    const p = await setStatus("scheduled", { scheduledAt: iso }, `Scheduled for ${formatWhen(iso, { timeZone: props.timezone })}`);
    if (p) setSheet(null);
  };

  const archive = async () => {
    const p = await setStatus("archived", {}, "Archived");
    if (p) router.push("/studio");
  };

  const remove = async () => {
    setBusy("status");
    try {
      await api(`/api/posts/${id}`, { method: "DELETE" });
      toast("Post deleted");
      router.push("/studio");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(null);
    }
  };

  /* ---------------- publishing (Calendar module endpoints) ---------------- */
  const [postedUrl, setPostedUrl] = useState("");

  const publish = async (json: Record<string, unknown>, done: string) => {
    await flush();
    setBusy("publish");
    try {
      await api(`/api/posts/${id}/publish`, { method: "POST", json });
      await refresh();
      setSheet(null);
      toast(done);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  /* ---------------- photo ---------------- */
  const choosePhoto = async (photoId: string | null) => {
    setBusy("photo");
    try {
      await api(`/api/posts/${id}`, { method: "PATCH", json: { photoId } });
      await refresh();
      setSheet(null);
      toast(photoId ? "Photo set" : "Photo removed");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    const problem = photoProblem(file);
    if (problem) {
      toast(problem, "error");
      return;
    }
    setUploading(true);
    try {
      const photo = await uploadPhoto(file, { memoryId: post.memoryId });
      await choosePhoto(photo.id);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setUploading(false);
    }
  };

  /* ---------------- misc actions ---------------- */
  const copy = async (open = false) => {
    const text = toClipboard(bodyRef.current);
    // Start the copy and open LinkedIn inside the click, so popup blockers allow the new tab.
    const copying = navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
    if (open) window.open(linkedinComposerUrl(text), "_blank", "noopener,noreferrer");
    if (await copying) toast(open ? "Copied. If LinkedIn's box is empty, paste it." : "Post copied");
    else toast(open ? "LinkedIn opened. Copy the text here if the box is empty." : "Couldn't reach the clipboard. Select the text and copy it by hand.", open ? "info" : "error");
  };

  const runAutofix = () => {
    const fixed = autofix(bodyRef.current);
    if (fixed === bodyRef.current) return;
    onUserEdit(fixed);
    toast("Fixed dashes, spacing and formatting");
  };

  const focusIssue = (i: LintHit) => {
    if (i.start === undefined || i.end === undefined) return;
    setFocus({ start: i.start, end: i.end, nonce: Date.now() });
  };

  const changePillar = (pillarId: string | null) => void patch({ pillar: pillarId }, "Pillar updated");

  /* ---------------- render ---------------- */
  const photoHints: string[] = [];
  if (detail.photo?.width && detail.photo.height && detail.photo.width > detail.photo.height * 1.05) photoHints.push("Landscape photo. A portrait (4:5) photo takes up more of the feed.");
  if (detail.photo?.isCandid === false) photoHints.push("This looks posed or stock. A candid phone photo from the moment usually does better.");

  const chars = body.trim().length;
  const words = (body.match(/\S+/g) ?? []).length;
  const hasBody = body.trim().length > 0;
  const presets = REVISE_PRESETS.filter((p) => p.id !== "cta" || props.hasCta);

  const statusActions = (() => {
    if (archived)
      return (
        <Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={() => setStatus("draft", {}, "Back in your drafts")} loading={busy === "status"}>
          Restore
        </Button>
      );
    if (published)
      return post.linkedinUrl ? (
        <a href={post.linkedinUrl} target="_blank" rel="noreferrer" className="btn btn-glass">
          <ExternalLink className="size-4" />
          View on LinkedIn
        </a>
      ) : null;
    const dis = locked || !hasBody;
    switch (post.status) {
      case "idea":
      case "draft":
        return (
          <>
            <Button variant="glass" onClick={() => setStatus("review", {}, "Moved to review")} disabled={dis}>
              Move to review
            </Button>
            <Button variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={approve} disabled={dis}>
              Approve
            </Button>
          </>
        );
      case "review":
        return (
          <>
            <Button variant="plain" onClick={() => setStatus("draft", {}, "Back to drafts")} disabled={locked}>
              Back to draft
            </Button>
            <Button variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={approve} disabled={dis}>
              Approve
            </Button>
          </>
        );
      case "approved":
        return (
          <>
            <Button variant="plain" onClick={() => setStatus("review", {}, "Moved back to review")} disabled={locked}>
              Unapprove
            </Button>
            <Button variant="primary" icon={<CalendarClock className="size-4" />} onClick={() => setSheet("schedule")} disabled={dis}>
              Schedule
            </Button>
          </>
        );
      case "scheduled":
        return (
          <>
            <Button variant="plain" onClick={() => setStatus("approved", { scheduledAt: null }, "Unscheduled. It stays approved.")} disabled={locked}>
              Unschedule
            </Button>
            <Button variant="glass" icon={<CalendarClock className="size-4" />} onClick={() => setSheet("schedule")} disabled={dis}>
              Reschedule
            </Button>
          </>
        );
      default:
        return null;
    }
  })();

  const streamingLabel = busy === "draft" ? "Writing your draft from the story…" : "Revising…";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/studio" className="btn btn-plain btn-sm -ml-3">
          <ChevronLeft className="size-4" />
          Studio
        </Link>
        <SaveIndicator state={saveState} />
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4 animate-in">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip status={post.status} />
            <PillarChip pillar={pillar} />
            {post.scheduledAt && post.status !== "published" && (
              <Chip tone={post.status === "scheduled" ? "indigo" : "gray"}>
                <CalendarClock className="size-3" />
                {post.status === "scheduled" ? (
                  <When iso={post.scheduledAt} timeZone={props.timezone} />
                ) : (
                  <>
                    Planned <When iso={post.scheduledAt} withTime={false} timeZone={props.timezone} />
                  </>
                )}
              </Chip>
            )}
            {post.error && !published && (
              <Chip tone={publishingAt ? "blue" : unconfirmed ? "yellow" : "red"}>
                {publishingAt ? <Send className="size-3" /> : <AlertTriangle className="size-3" />}
                {publishingAt ? "Publishing" : unconfirmed ? "Check LinkedIn" : "Publish failed"}
              </Chip>
            )}
          </div>
          <h1 className="t-title-1 line-clamp-2">{detail.memory?.title ?? (hookOf(body) || "Your post")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statusActions}
          <Menu
            items={[
              { label: "Copy text", icon: Clipboard, onClick: () => void copy(false), hidden: !hasBody },
              { label: "Copy & open LinkedIn", icon: ExternalLink, onClick: () => void copy(true), hidden: !hasBody },
              { label: "Download photo", icon: Download, onClick: () => window.open(photoSrc(post.photoId!, "full", true), "_blank"), hidden: !post.photoId },
              {
                label: post.error ? "Try publishing again" : "Publish now on LinkedIn",
                icon: Send,
                onClick: () => void publish(post.error ? { retry: true } : {}, "Published on LinkedIn"),
                hidden: !(post.status === "approved" || post.status === "scheduled"),
              },
              { label: "Mark as posted by hand", icon: CheckCircle2, onClick: () => setSheet("mark-posted"), hidden: !(post.status === "approved" || post.status === "scheduled") },
              { label: "Version history", icon: History, onClick: () => setSheet("versions") },
              { label: "Archive", icon: Archive, onClick: () => void archive(), hidden: archived || published },
              { label: "Delete post", icon: Trash2, onClick: () => setSheet("delete"), destructive: true, hidden: sending },
            ]}
          />
        </div>
      </header>

      {post.error && !published && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-panel px-5 py-4 animate-in"
          role={publishingAt ? "status" : "alert"}
          style={{ background: `color-mix(in srgb, var(${publishingAt ? "--sys-blue" : "--sys-red"}) 10%, transparent)` }}
        >
          <div className="flex min-w-0 items-start gap-3">
            {publishingAt ? <Send className="mt-0.5 size-5 shrink-0 text-sys-blue" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-sys-red" />}
            <div className="min-w-0">
              <div className="t-headline">{publishingAt ? "Publishing to LinkedIn…" : unconfirmed ? "Check LinkedIn first" : "Not on LinkedIn yet"}</div>
              <p className="t-footnote text-label-2 [overflow-wrap:anywhere]">
                {publishingAt ? (
                  <>
                    Started <When iso={publishingAt.toISOString()} />. If nothing changes in a few minutes, check your feed before trying again, so it doesn't go out twice.
                  </>
                ) : (
                  post.error
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(post.status === "approved" || post.status === "scheduled") && (
              <Button variant="glass" icon={<RotateCcw className="size-4" />} onClick={() => void publish({ retry: true }, "Published on LinkedIn")} loading={busy === "publish"} disabled={locked}>
                Try again
              </Button>
            )}
            <Button variant="plain" onClick={() => setSheet("mark-posted")} disabled={locked}>
              It's on LinkedIn already
            </Button>
          </div>
        </div>
      )}

      {hydrated && post.status === "scheduled" && post.scheduledAt && Date.parse(post.scheduledAt) <= Date.now() && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-panel px-5 py-4 animate-in" role="status">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 size-5 shrink-0" style={{ color: "var(--sys-orange)" }} />
            <div>
              <div className="t-headline">Due now</div>
              <p className="t-footnote text-label-2">It was planned for <When iso={post.scheduledAt} timeZone={props.timezone} />. Copy it to LinkedIn with the photo, then mark it as posted so Insights can track it.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="glass" icon={<ExternalLink className="size-4" />} onClick={() => void copy(true)}>
              Copy & open LinkedIn
            </Button>
            <Button variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={() => setSheet("mark-posted")}>
              Mark as posted
            </Button>
          </div>
        </div>
      )}

      {published && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-panel px-5 py-4 animate-in" role="status">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-sys-purple" />
            <div>
              <div className="t-headline">
                Published{post.publishedAt ? " " : ""}
                <When iso={post.publishedAt} timeZone={props.timezone} />
              </div>
              <p className="t-footnote text-label-2">
                {post.reactions !== null || post.comments !== null
                  ? `${post.reactions ?? 0} reactions · ${post.comments ?? 0} comments${post.impressions ? ` · ${post.impressions.toLocaleString("en")} impressions` : ""}`
                  : "Add its numbers in Insights a day or two after posting, so planning learns what works."}
              </p>
            </div>
          </div>
          <Link href="/insights" className="btn btn-glass">
            Open Insights
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[290px_minmax(0,1fr)_380px]">
        {/* Story context */}
        <aside className="order-3 lg:col-span-2 xl:order-1 xl:col-span-1">
          <div className="xl:sticky xl:top-6 space-y-4">
            <StoryPanel memory={detail.memory} angle={angleField.selected} pillars={props.pillars} pillarId={pillar?.id ?? null} onPillar={changePillar} voiceSamples={props.voiceSamples} disabled={locked} />
          </div>
        </aside>

        {/* Editor */}
        <section className="order-1 xl:order-2 min-w-0 space-y-4" aria-label="Editor">
          {!hasBody && !streaming && !published && (
            <div className="card p-6 sm:p-8 space-y-4 animate-in">
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}>
                  <Sparkles className="size-5" />
                </span>
                <div className="space-y-1">
                  <h2 className="t-title-3">{detail.memory ? "How should we tell this story?" : "Start with your own words"}</h2>
                  <p className="t-subhead text-label-2">
                    {detail.memory
                      ? "We'll suggest three angles: a first line, a proven structure and the one thing your audience takes away. Pick one and the writer drafts it in your voice, using only what you told us."
                      : "Type or paste your draft below. Then use the checks, the critique and the quick revisions to sharpen it."}
                  </p>
                </div>
              </div>
              {detail.memory && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={() => void suggestAngles()} loading={busy === "angles"} disabled={locked}>
                    Suggest 3 angles
                  </Button>
                  <Button variant="glass" icon={<PenLine className="size-4" />} onClick={() => draft()} disabled={locked}>
                    Draft straight away
                  </Button>
                  <Button variant="plain" icon={<Type className="size-4" />} onClick={() => surface.current?.focus()} disabled={locked}>
                    I'll write it myself
                  </Button>
                </div>
              )}
              {inlineError && <InlineError message={inlineError} />}
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-separator px-4 py-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {angleField.selected ? (
                  <button type="button" onClick={() => setSheet("angles")} className="chip focus-ring max-w-[260px]" disabled={locked || !detail.memory}>
                    <Sparkles className="size-3" />
                    <span className="truncate">Angle: {angleField.selected.hook || angleField.selected.takeaway || "custom structure"}</span>
                  </button>
                ) : (
                  <span className="t-footnote text-label-2 px-1">{detail.memory ? "No angle chosen yet" : "Your own draft"}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {detail.memory && !published && (
                  <Button size="sm" variant="plain" icon={<Sparkles className="size-3.5" />} onClick={() => (angleField.options.length ? setSheet("angles") : void suggestAngles())} disabled={locked}>
                    Angles
                  </Button>
                )}
                {hasBody && !published && (
                  <Button size="sm" variant="plain" icon={<TextQuote className="size-3.5" />} onClick={() => void loadHooks()} disabled={locked}>
                    Hooks
                  </Button>
                )}
                <Button size="sm" variant="plain" icon={<History className="size-3.5" />} onClick={() => setSheet("versions")} disabled={streaming}>
                  Versions
                </Button>
              </div>
            </div>

            <EditorSurface
              ref={surface}
              value={body}
              onChange={onUserEdit}
              readOnly={streaming || published}
              issues={streaming ? [] : lint.issues}
              focus={focus}
              placeholder={detail.memory ? "Write here, or let the writer draft it from your story." : "Paste or type your post…"}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-separator px-4 py-2.5 t-footnote text-label-2">
              <span className={cx("tabular-nums", chars > LINKEDIN_MAX_CHARS && "font-semibold text-sys-red")}>
                {chars.toLocaleString("en")} / {LINKEDIN_MAX_CHARS.toLocaleString("en")} · {words} words
              </span>
              <span className="hidden sm:inline">Dashed line: where LinkedIn shows “see more” on desktop</span>
            </div>
          </div>

          {/* Revise bar */}
          {!published && !archived && (
            <div className="card p-4 space-y-3" aria-label="Revise">
              {streaming ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 t-subhead text-label-2">
                    <Typing />
                    {streamingLabel}
                  </span>
                  <Button size="sm" variant="glass" icon={<Square className="size-3.5" />} onClick={stop}>
                    Stop
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((p) => (
                      <button key={p.id} type="button" onClick={() => revise({ preset: p.id }, `${p.label}: done`)} disabled={locked || !hasBody} className="chip focus-ring !h-8 !px-3 hover:bg-fill-2 disabled:opacity-40">
                        {p.label}
                      </button>
                    ))}
                    {detail.memory && hasBody && (
                      <button type="button" onClick={() => draft(angleField.selected ?? undefined)} disabled={locked} className="chip focus-ring !h-8 !px-3 hover:bg-fill-2 disabled:opacity-40">
                        <RotateCcw className="size-3" />
                        Regenerate
                      </button>
                    )}
                  </div>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendInstruction();
                    }}
                  >
                    <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Tell the writer what to change…" disabled={locked || !hasBody} aria-label="Instruction for the writer" />
                    <IconButton label="Revise" type="submit" disabled={locked || !hasBody || !instruction.trim()} className="btn-primary !size-10 shrink-0 disabled:opacity-40">
                      <Wand2 className="size-4" />
                    </IconButton>
                  </form>
                  {inlineError && hasBody && <InlineError message={inlineError} />}
                </>
              )}
            </div>
          )}
        </section>

        {/* Quality + preview */}
        <aside className="order-2 xl:order-3 min-w-0 space-y-6">
          <QualityPanel
            hasBody={hasBody && !streaming}
            memoryId={detail.memory?.id ?? null}
            lint={lint.issues}
            lintScore={lint.score}
            score={score}
            gate={gate}
            critique={critique}
            critiqueFresh={critiqueFresh}
            critiquing={critiquing}
            critiqueError={critiqueError}
            busy={locked || published}
            onCritique={() => void flush().then(() => runCritique())}
            onApplyCritique={() => revise({ fix: "critique" }, "Applied the editor's notes")}
            onFixWithWriter={() => revise({ fix: "lint" }, "Rewrote the flagged lines")}
            onAutofix={runAutofix}
            onFocus={focusIssue}
          />
          <LinkedInPreview
            author={props.author}
            body={body}
            photo={detail.photo}
            uploading={uploading}
            onAddPhoto={() => setSheet("photo")}
            actions={
              <>
                {detail.photo && !published && (
                  <Button size="sm" variant="glass" onClick={() => setSheet("photo")} disabled={locked}>
                    Change photo
                  </Button>
                )}
                {detail.photo && (
                  <a href={photoSrc(detail.photo.id, "full", true)} className="btn btn-plain btn-sm" download>
                    <Download className="size-3.5" />
                    Download
                  </a>
                )}
                {hasBody && (
                  <Button size="sm" variant="plain" icon={<Clipboard className="size-3.5" />} onClick={() => void copy(false)}>
                    Copy text
                  </Button>
                )}
                {photoHints.length > 0 && (
                  <ul className="w-full space-y-1 pt-1">
                    {photoHints.map((h) => (
                      <li key={h} className="t-caption text-label-2 text-center">
                        {h}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            }
          />
        </aside>
      </div>

      {/* Sheets */}
      <AnglesSheet
        open={sheet === "angles"}
        onClose={() => setSheet(null)}
        options={angleField.options}
        loading={busy === "angles"}
        error={anglesError}
        recommended={recommended}
        onSuggest={() => void suggestAngles()}
        onDraft={(a) => draft(a)}
        disabled={locked}
      />
      <HooksSheet open={sheet === "hooks"} onClose={() => setSheet(null)} loading={busy === "hooks"} error={hooksError} hooks={hooks} body={body} onUse={applyHook} onRetry={() => void loadHooks()} />
      <VersionsSheet
        open={sheet === "versions"}
        onClose={() => setSheet(null)}
        postId={id}
        current={body}
        readOnly={published || locked || sending}
        onRestored={(p) => {
          setDetail((d) => ({ ...d, post: p }));
          setBody(p.body);
          savedRef.current = p.body;
          setSaveState("saved");
        }}
      />
      <PhotoSheet
        open={sheet === "photo"}
        onClose={() => setSheet(null)}
        memoryPhotos={detail.memoryPhotos}
        libraryPhotos={detail.libraryPhotos}
        selectedId={post.photoId}
        hasMemory={!!detail.memory}
        uploading={uploading}
        saving={busy === "photo"}
        onSelect={(pid) => void choosePhoto(pid)}
        onUpload={(f) => void upload(f)}
      />
      <ScheduleSheet
        open={sheet === "schedule"}
        onClose={() => setSheet(null)}
        current={post.scheduledAt}
        cadence={props.cadence}
        timezone={props.timezone}
        taken={props.taken}
        needsApproval={post.status !== "approved" && post.status !== "scheduled"}
        missingPhoto={!post.photoId}
        saving={busy === "status"}
        onConfirm={(iso) => void schedule(iso)}
        onAddPhoto={() => setSheet("photo")}
      />
      <Sheet
        open={sheet === "approve-no-photo"}
        onClose={() => setSheet(null)}
        title="Approve without a photo?"
        size="sm"
        footer={
          <>
            <Button variant="plain" onClick={() => void approveNow().then(() => setSheet(null))} loading={busy === "status"}>
              Approve anyway
            </Button>
            <Button variant="primary" onClick={() => setSheet("photo")}>
              Add a photo
            </Button>
          </>
        }
      >
        <p className="t-subhead text-label-2">Posts with a real photo from the moment are the ones people stop for. A phone photo of the place, the people or the screen is enough.</p>
      </Sheet>
      <Sheet
        open={sheet === "rewrite-approved"}
        onClose={() => {
          setSheet(null);
          setPending(null);
        }}
        title="Rewrite an approved post?"
        size="sm"
        footer={
          <>
            <Button
              variant="plain"
              onClick={() => {
                setSheet(null);
                setPending(null);
              }}
            >
              Keep it
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const fn = pending;
                setPending(null);
                setSheet(null);
                fn?.();
              }}
            >
              Rewrite
            </Button>
          </>
        }
      >
        <p className="t-subhead text-label-2">The new version goes back to Review{post.status === "scheduled" ? " and won't be published until you approve it again. Its date is kept." : " until you approve it again."} The current text stays in the version history.</p>
      </Sheet>
      <Sheet
        open={sheet === "mark-posted"}
        onClose={() => setSheet(null)}
        title="Mark as posted"
        size="sm"
        footer={
          <>
            <Button variant="plain" onClick={() => setSheet(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy === "publish"} onClick={() => void publish({ manual: true, ...(postedUrl.trim() ? { url: postedUrl.trim() } : {}) }, "Marked as posted")}>
              Mark as posted
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="t-subhead text-label-2">For posts you published yourself. Paste the link to the post on LinkedIn if you have it; Insights uses it to match the numbers later.</p>
          <Input value={postedUrl} onChange={(e) => setPostedUrl(e.target.value)} placeholder="https://www.linkedin.com/feed/update/…" aria-label="Link to the LinkedIn post (optional)" inputMode="url" />
        </div>
      </Sheet>
      <Sheet
        open={sheet === "delete"}
        onClose={() => setSheet(null)}
        title="Delete this post?"
        size="sm"
        footer={
          <>
            <Button variant="plain" onClick={() => setSheet(null)}>
              Cancel
            </Button>
            <Button variant="destructive" icon={<Trash2 className="size-4" />} onClick={() => void remove()} loading={busy === "status"}>
              Delete
            </Button>
          </>
        }
      >
        <p className="t-subhead text-label-2">The post and its version history are removed. The story and its photos stay in your Memory Bank.{published ? " It stays on LinkedIn." : ""}</p>
      </Sheet>
    </div>
  );
}
