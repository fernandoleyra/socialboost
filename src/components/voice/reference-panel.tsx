"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Trash2, Users } from "lucide-react";
import { Button, Chip, EmptyState, Field, IconButton, Input, api, cx, toast } from "@/components/ui";
import type { VoiceSample } from "@/lib/repo";
import type { ParseResult } from "@/lib/voice/parse";
import { postSkeleton, skeletonSteps } from "@/lib/voice/stylometry";
import type { ImportResult, VoiceState } from "@/lib/voice/types";
import { errorMessage, firstLine } from "./format";
import { PasteTab } from "./import-panel";
import { ImportPreview } from "./import-preview";

function ReferenceRow({ sample, onDeleted }: { sample: VoiceSample; onDeleted: (s: VoiceState) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const steps = useMemo(() => skeletonSteps(postSkeleton(sample.text)), [sample.text]);
  const remove = async () => {
    setBusy(true);
    try {
      onDeleted(await api<VoiceState>(`/api/voice/samples/${sample.id}`, { method: "DELETE" }));
      toast("Reference post removed");
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  };
  return (
    <li className="list-row !block !py-3">
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 rounded-md text-left focus-ring" aria-expanded={open}>
          <div className="flex items-start gap-2">
            <span className={cx("t-subhead min-w-0 flex-1 font-medium", !open && "truncate")}>{firstLine(sample.text)}</span>
            <ChevronDown className={cx("mt-0.5 size-4 shrink-0 text-label-3 transition-transform", open && "rotate-180")} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1 t-caption text-label-2">
            {steps.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && <span className="text-label-3">→</span>}
                <span>{s}</span>
              </span>
            ))}
          </div>
        </button>
        <IconButton label="Remove this post" onClick={remove} disabled={busy} className="size-8 shrink-0 text-label-2">
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
      {open && <p className="li-text mt-3 max-h-72 overflow-y-auto rounded-[14px] bg-fill-4 p-4 animate-in">{sample.text}</p>}
    </li>
  );
}

/** Posts by creators the person admires: studied for their shape, never for their words. */
export function ReferencePanel({ samples, onChanged }: { samples: VoiceSample[]; onChanged: (s: VoiceState) => void }) {
  const [author, setAuthor] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState(0);

  const groups = useMemo(() => {
    const m = new Map<string, VoiceSample[]>();
    for (const s of samples) m.set(s.author || "Unknown", [...(m.get(s.author || "Unknown") ?? []), s]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [samples]);

  const done = (r: ImportResult) => {
    setParsed(null);
    setKey((k) => k + 1);
    setAdding(false);
    onChanged(r.state);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="t-title-3">Creators you admire</h2>
          <p className="t-footnote mt-0.5 max-w-2xl text-label-2">
            Paste posts whose structure you like. We look at their shape (how they open, build and end) for ideas. Their words are never copied, and they don&apos;t change your voice.
          </p>
        </div>
        {!adding && samples.length > 0 && (
          <Button variant="glass" icon={<Users className="size-4" />} onClick={() => setAdding(true)}>
            Add a creator&apos;s posts
          </Button>
        )}
      </div>

      {adding && (
        <div className="card space-y-4 p-5 sm:p-6">
          {parsed ? (
            <ImportPreview parsed={parsed} kind="reference" author={author.trim()} origin="paste" onCancel={() => setParsed(null)} onImported={done} />
          ) : (
            <>
              <Field label="Whose posts are these?">
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Creator's name" maxLength={120} />
              </Field>
              {author.trim() ? (
                <PasteTab key={key} kind="reference" headerLines={[author.trim()]} onParsed={setParsed} />
              ) : (
                <p className="t-footnote text-label-3">Add the creator&apos;s name first, then paste their posts.</p>
              )}
              <div className="flex justify-end">
                <Button variant="plain" size="sm" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {!adding && samples.length === 0 && (
        <EmptyState
          icon={<Users />}
          title="No reference creators yet"
          body="Add a few posts from someone whose structure you like. You'll see how each one is built: the hook, the list, the ending. Optional: your own posts matter most."
          action={
            <Button variant="tinted" icon={<Users className="size-4" />} onClick={() => setAdding(true)}>
              Add a creator&apos;s posts
            </Button>
          }
        />
      )}

      {groups.map(([name, posts]) => (
        <div key={name} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="t-headline">{name}</span>
            <Chip>{posts.length}</Chip>
          </div>
          <ul className="card list-group">
            {posts.map((s) => (
              <ReferenceRow key={s.id} sample={s} onDeleted={onChanged} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
