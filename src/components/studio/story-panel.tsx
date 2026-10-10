"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AudioWaveform, CalendarDays, ChevronDown, Library, MapPin, Quote, Users } from "lucide-react";
import { Chip, Select, cx } from "@/components/ui";
import { HOOK_TYPE_LABELS, type Angle } from "@/lib/factory/angles";
import { getStructure } from "@/lib/factory/structures";
import type { Memory } from "@/lib/types";
import type { PillarLite } from "./shared";

function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 py-1 t-footnote font-semibold text-label-2" aria-expanded={open}>
        {title}
        <ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="pt-1.5">{children}</div>}
    </div>
  );
}

export function StoryPanel({
  memory,
  angle,
  pillars,
  pillarId,
  onPillar,
  voiceSamples,
  disabled,
}: {
  memory: Memory | null;
  angle: Angle | null;
  pillars: PillarLite[];
  pillarId: string | null;
  onPillar: (id: string | null) => void;
  voiceSamples: number;
  disabled?: boolean;
}) {
  const [full, setFull] = useState(false);
  const structure = angle ? getStructure(angle.structureId) : null;
  const known = pillars.some((p) => p.id === pillarId);

  return (
    <div className="space-y-4">
      <section className="card p-5 space-y-4" aria-label="The story">
        <div className="t-eyebrow">The story</div>
        {memory ? (
          <>
            <h2 className="t-headline">{memory.title}</h2>
            {(memory.when || memory.place || memory.people.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {memory.when && (
                  <Chip>
                    <CalendarDays className="size-3" />
                    {memory.when}
                  </Chip>
                )}
                {memory.place && (
                  <Chip>
                    <MapPin className="size-3" />
                    <span className="truncate max-w-[160px]">{memory.place}</span>
                  </Chip>
                )}
                {memory.people.length > 0 && (
                  <Chip>
                    <Users className="size-3" />
                    <span className="truncate max-w-[160px]">{memory.people.join(", ")}</span>
                  </Chip>
                )}
              </div>
            )}
            {(memory.story || memory.summary) && (
              <div>
                <p className={cx("t-footnote whitespace-pre-wrap text-label", !full && "line-clamp-[8]")}>{memory.story || memory.summary}</p>
                {(memory.story || memory.summary).length > 420 && (
                  <button type="button" onClick={() => setFull((f) => !f)} className="mt-1 t-footnote font-semibold text-accent">
                    {full ? "Show less" : "Read the whole story"}
                  </button>
                )}
              </div>
            )}
            {memory.quotes.length > 0 && (
              <div className="space-y-2">
                {memory.quotes.slice(0, 4).map((q, i) => (
                  <blockquote key={i} className="flex gap-2 border-l-2 pl-3 t-footnote italic" style={{ borderColor: "var(--accent)" }}>
                    <Quote className="mt-0.5 size-3 shrink-0 text-accent not-italic" />
                    {q}
                  </blockquote>
                ))}
              </div>
            )}
            {memory.details.length > 0 && (
              <Disclosure title={`Details (${memory.details.length})`}>
                <ul className="space-y-1">
                  {memory.details.map((d, i) => (
                    <li key={i} className="flex gap-2 t-footnote">
                      <span className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--label-3)]" />
                      {d}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
            {memory.lesson && (
              <div className="rounded-[14px] bg-fill-4 p-3">
                <div className="t-caption font-semibold text-label-2">What you learned</div>
                <p className="t-footnote mt-0.5">{memory.lesson}</p>
              </div>
            )}
            <Link href={`/memories?open=${encodeURIComponent(memory.id)}`} className="inline-flex items-center gap-1.5 t-footnote font-semibold text-accent">
              <Library className="size-3.5" />
              Edit this story in the Memory Bank
            </Link>
          </>
        ) : (
          <p className="t-footnote text-label-2">No story card is linked to this post. The writer will only use facts that are already in your text, and the fact check is off.</p>
        )}
      </section>

      {angle && (
        <section className="card p-5 space-y-3" aria-label="Angle">
          <div className="flex items-center justify-between gap-2">
            <div className="t-eyebrow">Angle</div>
            <Chip tone="blue">{HOOK_TYPE_LABELS[angle.hookType]?.label ?? angle.hookType} hook</Chip>
          </div>
          {angle.hook && <p className="t-subhead font-medium">“{angle.hook}”</p>}
          {angle.takeaway && (
            <p className="t-footnote text-label-2">
              <span className="font-semibold text-label">Takeaway · </span>
              {angle.takeaway}
            </p>
          )}
          {structure && (
            <Disclosure title={`Structure: ${structure.name}`}>
              <ol className="space-y-1 t-footnote text-label-2 list-decimal pl-4">
                {structure.skeleton.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </Disclosure>
          )}
        </section>
      )}

      {pillars.length > 0 && (
        <section className="card p-5 space-y-2" aria-label="Pillar">
          <label className="t-eyebrow block" htmlFor="post-pillar">
            Pillar
          </label>
          <Select id="post-pillar" value={known ? (pillarId ?? "") : ""} onChange={(e) => onPillar(e.target.value || null)} disabled={disabled}>
            <option value="">No pillar</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <p className="t-caption text-label-3">The calendar balances posts across pillars by their weight.</p>
        </section>
      )}

      {voiceSamples < 3 && (
        <section className="card p-5 space-y-2" aria-label="Voice">
          <div className="flex items-center gap-2 t-subhead font-semibold">
            <AudioWaveform className="size-4 text-accent" />
            Teach the writer your voice
          </div>
          <p className="t-footnote text-label-2">
            {voiceSamples === 0 ? "The writer hasn't read any of your own posts yet." : `The writer has only ${voiceSamples} of your posts.`} Import 10 or more so drafts match your rhythm, words and habits.
          </p>
          <Link href="/voice" className="btn btn-tinted btn-sm">
            Import my posts
          </Link>
        </section>
      )}
    </div>
  );
}
