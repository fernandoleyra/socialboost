"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Clock, Sparkles } from "lucide-react";
import { Button, Meter, Sheet, Spinner, api, toast } from "@/components/ui";
import type { CalendarPost } from "@/lib/calendar/types";
import { formatWhen } from "./helpers";
import { LOCALE } from "./views";

type ItemState = { status: "waiting" | "working" | "done" | "failed" | "skipped"; message?: string; score?: number | null };

/**
 * "Draft all planned": runs the Studio's autopilot (angle → draft → check → fix) for each planned
 * idea in view, one after another so a local model isn't asked to do two at once. Cancellable.
 */
export function DraftAllSheet({ open, posts, timezone, onClose, onFinished }: { open: boolean; posts: CalendarPost[]; timezone: string; onClose: () => void; onFinished: () => void }) {
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const stopRef = useRef(false);
  const ctrlRef = useRef<AbortController | null>(null);
  const changedRef = useRef(false);

  useEffect(() => {
    if (open) {
      setStates(Object.fromEntries(posts.map((p) => [p.id, { status: "waiting" } as ItemState])));
      setFinished(false);
      changedRef.current = false;
    }
    // Reset only when the sheet opens; the list is frozen while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  const set = (id: string, s: ItemState) => setStates((cur) => ({ ...cur, [id]: s }));

  const start = async () => {
    setRunning(true);
    stopRef.current = false;
    let ok = 0;
    for (const post of posts) {
      if (stopRef.current) break;
      if (states[post.id]?.status === "done") continue;
      set(post.id, { status: "working" });
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      try {
        const res = await api<{ post?: { quality?: { score?: number } | null } }>("/api/studio/autopilot", { method: "POST", json: { postId: post.id }, signal: ctrl.signal });
        set(post.id, { status: "done", score: res.post?.quality?.score ?? null });
        changedRef.current = true;
        ok++;
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          set(post.id, { status: "skipped", message: "Stopped" });
          break;
        }
        set(post.id, { status: "failed", message: (err as Error).message });
        // A model or connection problem will fail every post the same way: stop early.
        if (/configured|reach|running|ollama|model/i.test((err as Error).message)) break;
      }
    }
    ctrlRef.current = null;
    setRunning(false);
    setFinished(true);
    if (ok) toast(`${ok} ${ok === 1 ? "draft" : "drafts"} ready for review.`);
  };

  const stop = () => {
    stopRef.current = true;
    ctrlRef.current?.abort();
  };

  const close = () => {
    if (running) stop();
    if (changedRef.current) onFinished();
    onClose();
  };

  const values = Object.values(states);
  const done = values.filter((s) => s.status === "done" || s.status === "failed" || s.status === "skipped").length;
  const succeeded = values.filter((s) => s.status === "done").length;

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Draft all planned posts"
      footer={
        running ? (
          <Button variant="destructive" onClick={stop}>
            Stop after this one
          </Button>
        ) : finished ? (
          <>
            <Button variant="plain" onClick={close}>
              Close
            </Button>
            {succeeded > 0 && (
              <Link href="/studio" className="btn btn-primary">
                Review in the Studio
              </Link>
            )}
          </>
        ) : (
          <>
            <Button variant="plain" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={start} disabled={!posts.length} icon={<Sparkles className="size-4" />}>
              Draft {posts.length} {posts.length === 1 ? "post" : "posts"}
            </Button>
          </>
        )
      }
    >
      {posts.length === 0 ? (
        <p className="t-subhead text-label-2">There are no planned ideas in this view. Use Auto-plan to fill open days with stories, or move to another week.</p>
      ) : (
        <div className="space-y-4">
          <p className="t-subhead text-label-2">
            Each post gets an angle, a first draft in your voice, an AI-tell check and one round of fixes. On a local model that&apos;s 1 to 3 minutes per post, so keep this window
            open. Drafts that pass the quality check move to Review; you still read and approve every one.
          </p>
          {(running || finished) && (
            <div className="space-y-1.5">
              <Meter value={posts.length ? done / posts.length : 0} />
              <div className="t-caption text-label-2 tabular-nums">
                {done} of {posts.length} done
              </div>
            </div>
          )}
          <div className="card list-group">
            {posts.map((p) => {
              const s = states[p.id] ?? { status: "waiting" };
              return (
                <div key={p.id} className="list-row">
                  <span className="grid size-6 shrink-0 place-items-center" aria-hidden>
                    {s.status === "working" ? (
                      <Spinner className="size-4" />
                    ) : s.status === "done" ? (
                      <CircleCheck className="size-4.5 text-sys-green" />
                    ) : s.status === "failed" ? (
                      <CircleAlert className="size-4.5 text-sys-red" />
                    ) : (
                      <Clock className="size-4 text-label-3" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="t-subhead font-medium line-clamp-1">{p.memoryTitle ?? p.hook ?? "Planned post"}</div>
                    <div className="t-caption text-label-2">
                      {formatWhen(p.at, timezone, LOCALE)}
                      {s.status === "done" && s.score !== null && s.score !== undefined && ` · quality ${s.score}`}
                      {s.status === "working" && " · writing…"}
                    </div>
                    {s.message && s.status !== "done" && <div className="mt-0.5 t-caption text-sys-red">{s.message}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Sheet>
  );
}
