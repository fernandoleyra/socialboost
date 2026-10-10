"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Square } from "lucide-react";
import { Button, Typing, streamText, toast } from "@/components/ui";

/** Clean model output into bullet lines (drops markdown emphasis, headings and preambles). */
function bullets(text: string): string[] {
  return text
    .replace(/\*\*|__/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^#+\s/.test(l))
    .map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, ""))
    .filter((l) => !/^(here (are|is)|sure|summary)\b/i.test(l));
}

/** "What's working": a short streamed read of the numbers by the critic model. */
export function Narrative({ enabled, reason }: { enabled: boolean; reason: string }) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);
  useEffect(() => () => ctrlRef.current?.abort(), []);

  const run = async () => {
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setText("");
    setRunning(true);
    try {
      await streamText("/api/insights/narrative", {}, (_piece, full) => setText(full), ctrl.signal);
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast((err as Error).message, "error");
    } finally {
      ctrlRef.current = null;
      setRunning(false);
    }
  };

  const lines = bullets(text);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button variant="glass" size="sm" onClick={() => ctrlRef.current?.abort()} icon={<Square className="size-3.5" />}>
            Stop
          </Button>
        ) : (
          <Button variant="tinted" size="sm" onClick={run} disabled={!enabled} icon={<Sparkles className="size-4" />}>
            {text ? "Write it again" : "Summarize what's working"}
          </Button>
        )}
        {!enabled && <span className="t-caption text-label-2">{reason}</span>}
      </div>
      {(running || lines.length > 0) && (
        <div className="rounded-inner bg-fill-4 px-4 py-3">
          {lines.length > 0 ? (
            <ul className="space-y-2 t-subhead">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[8px] size-1.5 shrink-0 rounded-full" style={{ background: /^next:/i.test(l) ? "var(--accent)" : "var(--label-3)" }} aria-hidden />
                  <span className={/^next:/i.test(l) ? "font-semibold" : undefined}>{l}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {running && (
            <div className="pt-1">
              <Typing />
            </div>
          )}
          {!running && lines.length > 0 && <p className="mt-3 t-caption text-label-3">Written by your critic model from the numbers above. Check it against the table.</p>}
        </div>
      )}
    </div>
  );
}
