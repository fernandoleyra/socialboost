"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Pencil, RefreshCw, WandSparkles } from "lucide-react";
import { Button, Chip, IconButton, Textarea, toast } from "@/components/ui";
import type { VoiceGuide } from "@/lib/types";
import { GOOD_POST_COUNT, GUIDE_SECTIONS, MIN_POSTS_FOR_ANALYSIS, type GuideListKey, type ProfileUpdate, type VoiceMeta } from "@/lib/voice/types";
import { errorMessage, fmtDay, parseDate, useHydrated } from "./format";

type SaveGuide = (patch: NonNullable<ProfileUpdate["guide"]>) => Promise<void>;

const toLines = (xs: string[]) => xs.join("\n");
const fromLines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

function EditableBlock({ label, hint, editing, onEdit, children }: { label: string; hint?: string; editing: boolean; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="group space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="t-footnote font-semibold text-label-2">{label}</div>
          {editing && hint && <div className="t-caption text-label-3">{hint}</div>}
        </div>
        {!editing && (
          <IconButton label={`Edit ${label.toLowerCase()}`} onClick={onEdit} className="size-8 text-label-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100">
            <Pencil className="size-3.5" />
          </IconButton>
        )}
      </div>
      {children}
    </div>
  );
}

function Editor({ initial, rows, placeholder, onSave, onCancel }: { initial: string; rows: number; placeholder: string; onSave: (v: string) => Promise<void>; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSave(value);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-2">
      <Textarea
        autoFocus
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <div className="flex justify-end gap-2">
        <Button variant="plain" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={save} loading={saving}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function StyleGuide({
  guide,
  meta,
  ownCount,
  analyzing,
  onAnalyze,
  onSave,
}: {
  guide: VoiceGuide;
  meta: VoiceMeta;
  ownCount: number;
  analyzing: boolean;
  onAnalyze: () => void;
  onSave: SaveGuide;
}) {
  const [editing, setEditing] = useState<GuideListKey | "summary" | null>(null);
  const hydrated = useHydrated();
  const analyzedAt = parseDate(meta.analyzedAt);
  // "3 days ago" depends on the clock, so the server and first client render show the date instead.
  const when = analyzedAt ? (hydrated ? formatDistanceToNow(analyzedAt, { addSuffix: true }) : `on ${fmtDay(meta.analyzedAt, false)}`) : "";
  const isEmpty = !guide.summary.trim() && GUIDE_SECTIONS.every((s) => guide[s.key].length === 0);
  const newPosts = meta.analyzedAt ? ownCount - meta.guideSampleCount : 0;
  const canAnalyze = ownCount >= MIN_POSTS_FOR_ANALYSIS;

  const save = async (patch: NonNullable<ProfileUpdate["guide"]>) => {
    try {
      await onSave(patch);
      setEditing(null);
      toast("Style guide saved");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="t-title-3">Style guide</h2>
          <p className="t-footnote mt-0.5 text-label-2">
            {analyzedAt
              ? `Written from ${meta.postsRead} of your posts ${when}. Edit anything that isn't you.`
              : "How you sound, in words the writer can follow. Every line is editable."}
          </p>
        </div>
        {meta.analyzedAt && newPosts !== 0 && (
          <div className="flex items-center gap-2">
            <Chip tone="orange">{newPosts > 0 ? `${newPosts} new ${newPosts === 1 ? "post" : "posts"} since` : "Posts changed since"}</Chip>
            <Button variant="tinted" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={onAnalyze} disabled={analyzing || !canAnalyze}>
              Update
            </Button>
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-fill-4 text-label-2">
            <BookOpen className="size-6" />
          </div>
          <div className="t-headline">No style guide yet</div>
          <p className="t-subhead max-w-md text-label-2">
            {canAnalyze
              ? "Your model reads your best posts and writes down how you sound: tone, how you open, how a post is built, the moves people recognise. Takes a minute or two on a local model."
              : `Import at least ${MIN_POSTS_FOR_ANALYSIS} of your posts first (${GOOD_POST_COUNT} or more is best). Then we'll write down how you sound.`}
          </p>
          <Button variant="primary" icon={<WandSparkles className="size-4" />} onClick={onAnalyze} loading={analyzing} disabled={!canAnalyze}>
            Analyze my voice
          </Button>
        </div>
      ) : (
        <div className="card space-y-6 p-5 sm:p-6">
          <EditableBlock label="In short" editing={editing === "summary"} onEdit={() => setEditing("summary")}>
            {editing === "summary" ? (
              <Editor initial={guide.summary} rows={3} placeholder="Two sentences on how you sound." onSave={(v) => save({ summary: v.trim() })} onCancel={() => setEditing(null)} />
            ) : (
              <p className="t-body text-pretty">{guide.summary || <span className="text-label-3">Add a short summary of how you sound.</span>}</p>
            )}
          </EditableBlock>

          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            {GUIDE_SECTIONS.map((s) => (
              <EditableBlock key={s.key} label={s.label} hint={`${s.hint} One per line.`} editing={editing === s.key} onEdit={() => setEditing(s.key)}>
                {editing === s.key ? (
                  <Editor initial={toLines(guide[s.key])} rows={Math.max(3, guide[s.key].length + 1)} placeholder="One per line" onSave={(v) => save({ [s.key]: fromLines(v) })} onCancel={() => setEditing(null)} />
                ) : guide[s.key].length === 0 ? (
                  <p className="t-footnote text-label-3">Nothing yet.</p>
                ) : s.key === "tone" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {guide.tone.map((t, i) => (
                      <Chip key={`${i}-${t}`} tone="blue" className="!h-auto min-h-6 whitespace-normal py-0.5">
                        {t}
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {guide[s.key].map((item, i) => (
                      <li key={`${i}-${item}`} className="t-subhead flex gap-2">
                        <span aria-hidden className={s.key === "neverDoes" ? "text-sys-red" : "text-label-3"}>
                          {s.key === "neverDoes" ? "×" : "•"}
                        </span>
                        <span className="min-w-0 text-pretty">{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </EditableBlock>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
