"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mic, NotebookPen } from "lucide-react";
import { Button, Textarea, api, toast } from "@/components/ui";

type Created = { interview: { id: string } };

/**
 * "Homework for Life" (Matthew Dicks): one line about what made today different.
 * Starts a story interview with that line as the person's first answer (`knownStory`), so the
 * interviewer digs into it instead of asking an unrelated opener. Small moments don't get lost.
 */
export function QuickCapture() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    const moment = text.trim();
    if (!moment || busy) return;
    setBusy(true);
    try {
      const { interview } = await api<Created>("/api/interviews", { method: "POST", json: { kind: "story", knownStory: moment } });
      router.push(`/interviews/${interview.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };

  return (
    <div className="card flex flex-col gap-3 p-5 animate-in">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-full" style={{ color: "var(--sys-indigo)", background: "color-mix(in srgb, var(--sys-indigo) 14%, transparent)" }}>
          <NotebookPen className="size-[18px]" />
        </span>
        <div>
          <div className="t-headline">What made today different?</div>
          <div className="t-footnote text-label-2">One line is enough. We'll ask a few questions about it.</div>
        </div>
      </div>
      <Textarea
        rows={3}
        value={text}
        maxLength={600}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            start();
          }
        }}
        placeholder="A client said something that stuck with me on the call this morning…"
        aria-label="A moment from today"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/interviews/new?kind=story" className="t-footnote font-medium text-accent hover:underline">
          Or pick a story prompt
        </Link>
        <Button variant="primary" size="sm" icon={<Mic className="size-4" />} loading={busy} disabled={!text.trim()} onClick={start}>
          Tell the story
        </Button>
      </div>
    </div>
  );
}
