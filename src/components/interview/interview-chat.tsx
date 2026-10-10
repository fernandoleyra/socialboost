"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  Compass,
  Ellipsis,
  Images,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { Button, Chip, IconButton, Sheet, Spinner, Typing, api, cx, streamText, toast } from "@/components/ui";
import type { InterviewView, ViewMessage } from "@/lib/interview/types";
import { formatDay } from "@/lib/interview/text";
import { Composer } from "./composer";
import { DepthPanel, DepthPill } from "./depth-panel";
import { FinishedPanel } from "./finished-panel";
import { PhotoDrop, PhotoRequestCard } from "./photo-drop";
import { photoUrl } from "./upload";

type Pending = { content: string; photoIds: string[]; baseCount: number };

const FINISH_STEPS_STORY = ["Reading the conversation", "Pulling out the scene, details and your exact words", "Checking quotes against what you said", "Saving to your Memory Bank"];
const FINISH_STEPS_POSITIONING = ["Reading the conversation", "Drafting your positioning and audience", "Shaping 3-4 content pillars", "Saving your strategy"];

function AssistantAvatar() {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full text-white"
      style={{ background: "linear-gradient(145deg, var(--sys-indigo), var(--sys-purple))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.4), 0 2px 6px -2px rgba(0,0,0,.25)" }}
    >
      <Sparkles className="size-4" />
    </span>
  );
}

function AssistantBubble({ children, live }: { children: React.ReactNode; live?: boolean }) {
  return (
    <div className="flex items-end gap-2 animate-in" aria-live={live ? "polite" : undefined}>
      <AssistantAvatar />
      <div className="bubble bubble-assistant">{children}</div>
    </div>
  );
}

function UserBubble({ content, photoIds, faded }: { content: string; photoIds: string[]; faded?: boolean }) {
  return (
    <div className={cx("flex flex-col items-end gap-1.5 animate-in", faded && "opacity-70")}>
      {photoIds.length > 0 && (
        <div className={cx("grid max-w-[86%] gap-1.5", photoIds.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3")}>
          {photoIds.map((id) => (
            <a key={id} href={photoUrl(id, "full")} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[18px] bg-fill-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(id)} alt="Photo you shared" className={cx("object-cover", photoIds.length === 1 ? "max-h-64 w-auto max-w-[240px]" : "aspect-square size-full")} />
            </a>
          ))}
        </div>
      )}
      {content && <div className="bubble bubble-user">{content}</div>}
    </div>
  );
}

/** Blocking progress card (not dismissable) while the interview is being written up. */
function ProgressOverlay({ title, children }: { title: string; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px] animate-in" />
      <div className="glass-strong relative w-full max-w-md space-y-4 rounded-t-[28px] p-6 animate-pop sm:rounded-window" aria-live="polite">
        <div className="t-title-3">{title}</div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function InterviewChat({ initial, timeZone }: { initial: InterviewView; timeZone: string }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishStep, setFinishStep] = useState(0);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [sheetPhotos, setSheetPhotos] = useState<string[]>([]);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const autoStarted = useRef(false);
  const nearBottom = useRef(true);
  const endRef = useRef<HTMLDivElement>(null);

  const id = view.interview.id;
  const kind = view.interview.kind === "positioning" ? "positioning" : "story";
  const active = view.interview.status === "active";
  const completed = view.interview.status === "completed";
  const busy = streaming !== null;
  const pillar = view.pillars.find((p) => p.id === view.interview.pillar);
  const finishLabel = kind === "positioning" ? "Finish & build strategy" : "Finish & save";
  const hasAnswers = view.messages.some((m) => m.role === "user");

  const refresh = useCallback(async () => {
    try {
      const next = await api<InterviewView>(`/api/interviews/${id}`);
      setView(next);
      return next;
    } catch (e) {
      toast((e as Error).message, "error");
      return null;
    }
  }, [id]);

  /** Send an answer (or nothing, to get the opening / retry) and stream the next question. */
  const runReply = useCallback(
    async (body: { content: string; photoIds?: string[]; intent?: "photo-later" }): Promise<boolean> => {
      if (controller.current) return false;
      const ac = new AbortController();
      controller.current = ac;
      const baseCount = view.messages.length;
      const sendsMessage = !!body.content || !!body.photoIds?.length || !!body.intent;
      setError(null);
      if (sendsMessage) setPending({ content: body.content || (body.intent ? "No photo right now. I'll add one later." : ""), photoIds: body.photoIds ?? [], baseCount });
      setStreaming("");
      nearBottom.current = true;
      let refreshed = false;
      try {
        await streamText(
          `/api/interviews/${id}/reply`,
          { content: body.content, photoIds: body.photoIds ?? [], ...(body.intent ? { intent: body.intent } : {}) },
          (_piece, full) => {
            setStreaming(full);
            if (!refreshed) {
              refreshed = true;
              void refresh();
            }
          },
          ac.signal,
        );
        await refresh();
        return true;
      } catch (e) {
        const next = await refresh();
        const saved = !!next && next.messages.length > baseCount;
        if ((e as Error).name !== "AbortError") {
          // Offer "Try again" only when there is a turn to retry; otherwise the toast is enough.
          if (saved || next?.needsReply) setError((e as Error).message);
          else toast((e as Error).message, "error");
        }
        return saved;
      } finally {
        controller.current = null;
        setStreaming(null);
        setPending(null);
      }
    },
    [id, refresh, view.messages.length],
  );

  // Fresh interview (or a known story with no question yet): ask the opening question.
  useEffect(() => {
    if (autoStarted.current) return;
    if (active && !view.messages.some((m) => m.role === "assistant")) {
      autoStarted.current = true;
      void runReply({ content: "" });
    }
  }, [active, view.messages, runReply]);

  // Follow the conversation unless the user scrolled up to reread.
  useEffect(() => {
    const onScroll = () => {
      nearBottom.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 220;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!completed && nearBottom.current) endRef.current?.scrollIntoView({ block: "end", behavior: streaming ? "auto" : "smooth" });
  }, [view.messages.length, streaming, pending, error, completed, view.pendingPhotoRequestId]);

  // Progress copy while the extractor works (local models can take a minute).
  useEffect(() => {
    if (!finishing) return;
    setFinishStep(0);
    const t = setInterval(() => setFinishStep((s) => Math.min(s + 1, 3)), 6000);
    return () => clearInterval(t);
  }, [finishing]);

  const stop = () => controller.current?.abort();

  const doFinish = async (photoIds: string[]) => {
    setPhotoSheet(false);
    setFinishing(true);
    try {
      await api(`/api/interviews/${id}/finish`, { method: "POST", json: { photoIds } });
      const next = await refresh();
      if (next) {
        toast(kind === "positioning" ? "Strategy saved" : next.memories.length > 1 ? `${next.memories.length} stories saved` : "Story saved to your Memory Bank");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setFinishing(false);
      setSheetPhotos([]);
    }
  };

  const finish = () => {
    if (busy || finishing) return;
    // The app always asks for a photo: if this story has none yet, ask once more before saving.
    if (kind === "story" && hasAnswers && !view.threadPhotoDone) setPhotoSheet(true);
    else void doFinish([]);
  };

  const setStatus = async (status: "active" | "abandoned") => {
    setMenu(false);
    try {
      const next = await api<InterviewView>(`/api/interviews/${id}`, { method: "PATCH", json: { status } });
      setView(next);
      toast(status === "abandoned" ? "Interview ended without saving" : "Interview reopened");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const remove = async () => {
    try {
      await api(`/api/interviews/${id}`, { method: "DELETE" });
      toast("Interview deleted");
      router.push("/interviews");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const showPending = pending && view.messages.length <= pending.baseCount;
  const lastMessage = view.messages[view.messages.length - 1];
  const needsRetry = active && !busy && !error && view.needsReply && view.messages.some((m) => m.role === "assistant");
  const allPhotos = view.messages.flatMap((m) => m.photoIds);

  const sideFooter = (
    <div className="space-y-3 border-t border-separator pt-4">
      {view.interview.promptSeed && kind === "story" && (
        <div>
          <div className="t-eyebrow">Started from</div>
          <p className="mt-1 line-clamp-4 t-footnote text-label-2">{view.interview.promptSeed}</p>
        </div>
      )}
      {view.threadCount > 1 && <p className="t-footnote text-label-2">Story {view.threadCount} in this session. Each one is saved as its own memory.</p>}
      {allPhotos.length > 0 && (
        <div>
          <div className="t-eyebrow flex items-center gap-1.5">
            <Images className="size-3.5" /> Photos
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {allPhotos.slice(0, 8).map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p} src={photoUrl(p)} alt="" className="aspect-square w-full rounded-[10px] object-cover" />
            ))}
          </div>
        </div>
      )}
      <p className="t-caption text-label-3">
        {kind === "story" ? "Specifics beat polish: names, numbers, what was said. Short answers are fine — you can also talk." : "Answer in your own words. Short is fine; examples help most."}
      </p>
    </div>
  );

  const transcript = (
    <div className="space-y-3" role="log" aria-label="Interview transcript">
      {view.messages.length > 0 && <div className="pb-1 text-center t-caption text-label-3">{formatDay(view.messages[0].createdAt, timeZone, { relative: false })}</div>}
      {view.messages.map((m: ViewMessage) => (
        <div key={m.id} className="space-y-3">
          {m.role === "assistant" ? <AssistantBubble>{m.content}</AssistantBubble> : <UserBubble content={m.content} photoIds={m.photoIds} />}
          {active && m.id === view.pendingPhotoRequestId && !busy && (
            <PhotoRequestCard requestId={m.id} busy={busy} onPhotos={async (ids) => void (await runReply({ content: "", photoIds: ids }))} onLater={() => void runReply({ content: "", intent: "photo-later" })} />
          )}
        </div>
      ))}
      {showPending && <UserBubble content={pending.content} photoIds={pending.photoIds} faded />}
      {busy && <AssistantBubble live>{streaming ? streaming : <Typing />}</AssistantBubble>}
      {active && !busy && view.readyToFinish && lastMessage?.role === "assistant" && (
        <div className="ml-10 flex flex-wrap gap-2 animate-pop">
          <Button variant="primary" size="sm" icon={<Check className="size-3.5" />} onClick={finish} disabled={finishing}>
            {finishLabel}
          </Button>
          {kind === "story" && (
            <Button variant="glass" size="sm" icon={<BookOpen className="size-3.5" />} onClick={() => setFocusKey((k) => k + 1)}>
              Tell another story
            </Button>
          )}
        </div>
      )}
      {error && !busy && (
        <div className="ml-10 flex max-w-[560px] items-start gap-3 rounded-[20px] border border-[color:color-mix(in_srgb,var(--sys-red)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--sys-red)_8%,transparent)] p-4 animate-pop" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-sys-red" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="t-subhead">{error}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="tinted" icon={<RotateCcw className="size-3.5" />} onClick={() => void runReply({ content: "" })}>
                Try again
              </Button>
              <Link href="/settings" className="btn btn-plain btn-sm">
                <Settings2 className="size-3.5" />
                Model settings
              </Link>
            </div>
          </div>
        </div>
      )}
      {needsRetry && (
        <div className="ml-10">
          <Button size="sm" variant="tinted" icon={<RotateCcw className="size-3.5" />} onClick={() => void runReply({ content: "" })}>
            Get the next question
          </Button>
        </div>
      )}
      {active && view.messages.length === 0 && !busy && !error && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      <div ref={endRef} className="h-px" />
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0">
        <Link href="/interviews" className="btn btn-plain btn-sm -ml-3 mb-2">
          <ChevronLeft className="size-4" />
          Interviews
        </Link>
        <header className="flex flex-wrap items-start justify-between gap-3 pb-5 animate-in">
          <div className="min-w-0 flex-1">
            <div className="t-eyebrow flex items-center gap-1.5">
              {kind === "positioning" ? <Compass className="size-3.5" /> : <BookOpen className="size-3.5" />}
              {kind === "positioning" ? "Positioning interview" : "Story interview"}
              <span aria-hidden>·</span>
              {formatDay(view.interview.createdAt, timeZone, { relative: false })}
            </div>
            <h1 className="mt-1 t-title-1 [overflow-wrap:anywhere]">{view.interview.title || (kind === "positioning" ? "Positioning interview" : "Story interview")}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pillar && <Chip tone={pillar.color}>{pillar.name}</Chip>}
              {active && <Chip tone="blue">In progress</Chip>}
              {completed && <Chip tone="green">Saved</Chip>}
              {view.interview.status === "abandoned" && <Chip>Ended without saving</Chip>}
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            {active && (
              <Button variant="primary" icon={<Check className="size-4" />} onClick={finish} disabled={!hasAnswers || busy} loading={finishing}>
                <span className="hidden sm:inline">{finishLabel}</span>
                <span className="sm:hidden">Finish</span>
              </Button>
            )}
            {view.interview.status === "abandoned" && (
              <Button variant="glass" icon={<Play className="size-4" />} onClick={() => void setStatus("active")}>
                Reopen
              </Button>
            )}
            <IconButton label="More" onClick={() => setMenu((o) => !o)} className="glass" aria-expanded={menu}>
              <Ellipsis className="size-5" />
            </IconButton>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="glass-strong absolute right-0 top-full z-50 mt-2 w-60 rounded-[18px] p-1.5 animate-pop" role="menu">
                  {active && (
                    <button type="button" role="menuitem" onClick={() => void setStatus("abandoned")} className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left t-subhead hover:bg-fill-3">
                      <Square className="size-4 text-label-2" />
                      End without saving
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setConfirmDelete(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2 text-left t-subhead text-sys-red hover:bg-fill-3"
                  >
                    <Trash2 className="size-4" />
                    Delete interview
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {!completed && (
          <div className="mb-5 lg:hidden">
            <DepthPill items={view.coverage} depth={view.depth} kind={kind} footer={sideFooter} />
          </div>
        )}

        {completed ? (
          <div className="space-y-8">
            <FinishedPanel view={view} onChanged={() => void refresh()} />
            <div>
              <button type="button" onClick={() => setShowTranscript((s) => !s)} className="btn btn-plain btn-sm -ml-3" aria-expanded={showTranscript}>
                <ChevronDown className={cx("size-4 transition-transform", showTranscript && "rotate-180")} />
                {showTranscript ? "Hide transcript" : `Show transcript (${view.messages.length} messages)`}
              </button>
              {showTranscript && <div className="mt-4">{transcript}</div>}
            </div>
          </div>
        ) : (
          <>
            {transcript}
            {active ? (
              <div className="sticky bottom-24 z-20 mt-6 lg:bottom-6">
                <Composer
                  busy={busy}
                  lang={view.language}
                  focusKey={focusKey}
                  placeholder={busy ? "Listening…" : view.readyToFinish ? "Tell me about another moment…" : "Type your answer, or tap the mic"}
                  onSend={(content, photoIds) => runReply({ content, photoIds })}
                  onStop={stop}
                />
              </div>
            ) : (
              <div className="mt-8 card flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="t-subhead text-label-2">This interview was ended without saving. Reopen it to keep going.</p>
                <Button variant="glass" icon={<Play className="size-4" />} onClick={() => void setStatus("active")}>
                  Reopen
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <aside className="hidden lg:block">
        <div className="sticky top-10 space-y-4">
          {completed ? (
            <div className="glass rounded-panel p-5 space-y-3">
              <div className="t-eyebrow">Next</div>
              <p className="t-subhead text-label-2">
                {kind === "story" ? "Stories with a photo and a clear turning point make the strongest posts. Add a photo if one is missing." : "Story interviews now target your pillars. One a week keeps the calendar full."}
              </p>
              <Link href="/interviews/new?kind=story" className="btn btn-glass btn-sm w-full">
                <BookOpen className="size-3.5" />
                New story interview
              </Link>
            </div>
          ) : (
            <DepthPanel items={view.coverage} depth={view.depth} kind={kind} footer={sideFooter} />
          )}
        </div>
      </aside>

      <Sheet
        open={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title="One more thing: a photo"
        size="sm"
        footer={
          <>
            <Button variant="plain" onClick={() => void doFinish(sheetPhotos)}>
              {sheetPhotos.length ? "Save" : "Remind me later"}
            </Button>
            {sheetPhotos.length > 0 && (
              <Button variant="primary" onClick={() => void doFinish(sheetPhotos)}>
                Save with {sheetPhotos.length === 1 ? "photo" : `${sheetPhotos.length} photos`}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <p className="t-subhead text-label-2">Posts with a real photo of the moment do far better than text alone. Add one now, or save and we'll flag this story as needing a photo.</p>
          {sheetPhotos.length > 0 && (
            <div className="flex gap-2">
              {sheetPhotos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p} src={photoUrl(p)} alt="" className="size-20 rounded-[14px] object-cover" />
              ))}
            </div>
          )}
          <PhotoDrop onUploaded={(photos) => setSheetPhotos((xs) => [...xs, ...photos.map((p) => p.id)])} />
        </div>
      </Sheet>

      {finishing && (
        <ProgressOverlay title={kind === "positioning" ? "Building your strategy" : "Writing up your story"}>
          <ol className="space-y-3">
            {(kind === "positioning" ? FINISH_STEPS_POSITIONING : FINISH_STEPS_STORY).map((s, i) => (
              <li key={s} className={cx("flex items-center gap-3 t-subhead transition-opacity", i > finishStep && "opacity-40")}>
                <span className={cx("grid size-6 shrink-0 place-items-center rounded-full", i < finishStep ? "bg-sys-green text-white" : "bg-fill-3")}>
                  {i < finishStep ? <Check className="size-3.5" strokeWidth={3} /> : i === finishStep ? <Spinner className="size-3.5" /> : null}
                </span>
                {s}
              </li>
            ))}
          </ol>
          <p className="t-caption text-label-3">On a local model this takes 20 seconds to a couple of minutes. Keep this tab open.</p>
        </ProgressOverlay>
      )}

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this interview?"
        size="sm"
        footer={
          <>
            <Button variant="plain" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="t-subhead text-label-2">
          The transcript will be deleted. {view.memories.length > 0 ? "Stories already saved from it stay in your Memory Bank." : "Nothing has been saved from it yet."}
        </p>
      </Sheet>
    </div>
  );
}
