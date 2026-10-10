"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Compass, PenLine, Quote, Sparkles } from "lucide-react";
import { Chip, cx } from "@/components/ui";
import type { InterviewView } from "@/lib/interview/types";
import type { Memory } from "@/lib/types";
import { PhotoDrop } from "./photo-drop";
import { photoUrl } from "./upload";

function StrengthDots({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Story strength ${value} of 5`} title={`Story strength ${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cx("size-1.5 rounded-full", i <= value ? "bg-sys-green" : "bg-fill")} />
      ))}
    </span>
  );
}

function MemoryResult({ memory, pillars, onChanged }: { memory: Memory; pillars: InterviewView["pillars"]; onChanged: () => void }) {
  const pillar = pillars.find((p) => p.id === memory.pillar);
  const hasPhoto = (memory.photoCount ?? 0) > 0 && memory.coverPhotoId;
  return (
    <article className="card overflow-hidden animate-in">
      <div className="grid gap-0 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div className="relative bg-fill-4 sm:min-h-full">
          {hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl(memory.coverPhotoId!)} alt="" className="aspect-[4/3] size-full object-cover sm:aspect-auto" />
          ) : (
            <div className="flex h-full flex-col justify-center gap-2 p-4">
              <Chip tone="orange" className="self-start">
                Needs a photo
              </Chip>
              <PhotoDrop compact memoryId={memory.id} title="Add a photo" onUploaded={() => onChanged()} />
            </div>
          )}
        </div>
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {pillar && <Chip tone={pillar.color}>{pillar.name}</Chip>}
            {memory.status === "raw" && (
              <Chip tone="yellow" title="Thin on detail: add more in the Memory Bank before writing">
                Draft
              </Chip>
            )}
            <StrengthDots value={memory.strength} />
          </div>
          <div>
            <h3 className="t-headline">{memory.title}</h3>
            {memory.summary && <p className="mt-1 line-clamp-3 t-subhead text-label-2">{memory.summary}</p>}
          </div>
          {memory.quotes[0] && (
            <blockquote className="flex gap-2 rounded-[14px] bg-fill-4 px-3 py-2.5 t-footnote italic text-label">
              <Quote className="mt-0.5 size-3.5 shrink-0 text-label-3" />
              <span className="line-clamp-3">{memory.quotes[0]}</span>
            </blockquote>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href={`/studio/new?memory=${encodeURIComponent(memory.id)}`} className="btn btn-primary btn-sm">
              <PenLine className="size-3.5" />
              Write a post
            </Link>
            <Link href={`/memories/${encodeURIComponent(memory.id)}`} className="btn btn-glass btn-sm">
              Open in Memory Bank
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export function FinishedPanel({ view, onChanged }: { view: InterviewView; onChanged: () => void }) {
  const isStory = view.interview.kind !== "positioning";
  if (isStory) {
    const n = view.memories.length;
    return (
      <section className="space-y-4" aria-labelledby="results-title">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--sys-green)_16%,transparent)] text-sys-green">
            <CheckCircle2 className="size-5" />
          </span>
          <div>
            <h2 id="results-title" className="t-title-3">
              {n === 0 ? "Interview saved" : n === 1 ? "Saved to your Memory Bank" : `${n} stories saved to your Memory Bank`}
            </h2>
            <p className="t-footnote text-label-2">
              {n === 0 ? "No stories came out of this one." : "Turn it into a post now, or let the Calendar pick it up when it plans your week."}
            </p>
          </div>
        </div>
        {view.memories.map((m) => (
          <MemoryResult key={m.id} memory={m} pillars={view.pillars} onChanged={onChanged} />
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/interviews/new?kind=story" className="btn btn-glass">
            <BookOpen className="size-4" />
            Tell another story
          </Link>
          <Link href="/memories" className="btn btn-plain">
            Memory Bank
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    );
  }

  const s = view.strategySummary;
  return (
    <section className="space-y-4" aria-labelledby="results-title">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--sys-indigo)_16%,transparent)] text-sys-indigo">
          <Compass className="size-5" />
        </span>
        <div>
          <h2 id="results-title" className="t-title-3">
            Your strategy is drafted
          </h2>
          <p className="t-footnote text-label-2">Read it through and fix anything that doesn't sound like you. Story interviews will now target these pillars.</p>
        </div>
      </div>
      {s ? (
        <div className="card space-y-4 p-5 animate-in">
          {s.positioning && (
            <div>
              <div className="t-eyebrow">Positioning</div>
              <p className="mt-1 t-title-3 font-semibold">{s.positioning}</p>
            </div>
          )}
          {s.goals.length > 0 && (
            <div>
              <div className="t-eyebrow">Goals</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.goals.map((g) => (
                  <Chip key={g}>{g}</Chip>
                ))}
              </div>
            </div>
          )}
          {s.pillars.length > 0 && (
            <div>
              <div className="t-eyebrow">Content pillars</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.pillars.map((p) => (
                  <Chip key={p.id} tone={p.color}>
                    {p.name}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="t-subhead text-label-2">The strategy was saved. Open it to review.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href="/strategy" className="btn btn-primary">
          Review your strategy
        </Link>
        <Link href="/interviews/new?kind=story" className="btn btn-glass">
          <Sparkles className="size-4" />
          Start your first story
        </Link>
      </div>
    </section>
  );
}
