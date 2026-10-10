"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, PenLine, RefreshCw, Sparkles } from "lucide-react";
import { Button, Chip, Field, Input, Select, Sheet, Textarea, Typing } from "@/components/ui";
import { HOOK_TYPE_LABELS, type Angle } from "@/lib/factory/angles";
import { STRUCTURES, getStructure, type StructureId } from "@/lib/factory/structures";

function AngleCard({ angle, index, onDraft, disabled }: { angle: Angle; index: number; onDraft: (a: Angle) => void; disabled: boolean }) {
  const [hook, setHook] = useState(angle.hook);
  useEffect(() => setHook(angle.hook), [angle.hook]);
  const structure = getStructure(angle.structureId);
  return (
    <div className="card p-4 space-y-3 animate-in" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="blue">{HOOK_TYPE_LABELS[angle.hookType]?.label ?? angle.hookType} hook</Chip>
        {structure && <Chip tone="purple">{structure.name}</Chip>}
      </div>
      <Textarea value={hook} onChange={(e) => setHook(e.target.value)} rows={2} aria-label="Hook (first line)" className="li-text !text-[15px] font-medium" />
      <div className="space-y-1 t-footnote">
        {angle.takeaway && (
          <p>
            <span className="font-semibold">Takeaway · </span>
            <span className="text-label-2">{angle.takeaway}</span>
          </p>
        )}
        {angle.whyItWorks && <p className="text-label-2">{angle.whyItWorks}</p>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="t-caption text-label-3">{hook.length} characters{hook.length > 140 ? " · may be cut on phones" : ""}</span>
        <Button variant="primary" size="sm" icon={<PenLine className="size-3.5" />} disabled={disabled || !hook.trim()} onClick={() => onDraft({ ...angle, hook: hook.trim() })}>
          Draft this
        </Button>
      </div>
    </div>
  );
}

export function AnglesSheet({
  open,
  onClose,
  options,
  loading,
  error,
  recommended,
  onSuggest,
  onDraft,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  options: Angle[];
  loading: boolean;
  error: string | null;
  recommended: StructureId;
  onSuggest: () => void;
  onDraft: (angle: Angle) => void;
  disabled: boolean;
}) {
  const [structureId, setStructureId] = useState<StructureId>(recommended);
  const [hook, setHook] = useState("");
  const [takeaway, setTakeaway] = useState("");
  useEffect(() => setStructureId(recommended), [recommended]);
  const structure = getStructure(structureId)!;

  return (
    <Sheet open={open} onClose={onClose} title="How should we tell it?" size="lg">
      <div className="space-y-6">
        <p className="t-subhead text-label-2">
          An angle is a hook, a structure and the one thing your reader takes away. Edit a hook if you like, then draft. The writer only uses facts from your story.
        </p>

        {loading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 t-subhead text-label-2">
              <Typing /> Reading your story and looking for the strongest openings…
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="card p-4 space-y-3">
                <div className="skeleton h-5 w-40" />
                <div className="skeleton h-12 w-full" />
                <div className="skeleton h-4 w-3/4" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="flex gap-2 rounded-card p-4 t-subhead" style={{ background: "color-mix(in srgb, var(--sys-red) 10%, transparent)" }}>
            <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-sys-red" />
            <div className="space-y-2">
              <p>{error}</p>
              <Button size="sm" variant="glass" icon={<RefreshCw className="size-3.5" />} onClick={onSuggest}>
                Try again
              </Button>
            </div>
          </div>
        )}

        {!loading && options.length > 0 && (
          <div className="space-y-3">
            {options.map((a, i) => (
              <AngleCard key={`${a.hook}-${i}`} angle={a} index={i} onDraft={onDraft} disabled={disabled} />
            ))}
            <Button variant="plain" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={onSuggest} disabled={disabled}>
              Suggest three new angles
            </Button>
          </div>
        )}

        {!loading && options.length === 0 && !error && (
          <div className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
            <Sparkles className="size-6 text-accent" />
            <p className="t-subhead text-label-2">No angles yet for this post.</p>
            <Button variant="primary" onClick={onSuggest} disabled={disabled}>
              Suggest 3 angles
            </Button>
          </div>
        )}

        <div className="space-y-3 border-t border-separator pt-5">
          <h3 className="t-headline">Or pick the structure yourself</h3>
          <Field label="Structure" hint={structure.whenToUse}>
            <Select value={structureId} onChange={(e) => setStructureId(e.target.value as StructureId)}>
              {STRUCTURES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.id === recommended ? " (good fit)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <ol className="list-decimal space-y-1 pl-5 t-footnote text-label-2">
            {structure.skeleton.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hook (optional)">
              <Input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="Your first line, if you have one" />
            </Field>
            <Field label="Takeaway (optional)">
              <Input value={takeaway} onChange={(e) => setTakeaway(e.target.value)} placeholder="What should readers take away?" />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button
              variant="glass"
              icon={<PenLine className="size-4" />}
              disabled={disabled}
              onClick={() => onDraft({ hook: hook.trim(), hookType: "scene", structureId, takeaway: takeaway.trim(), whyItWorks: "" })}
            >
              Draft with this structure
            </Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
