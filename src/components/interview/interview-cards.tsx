import Link from "next/link";
import { ArrowRight, BookOpen, Compass, MessageCircle, Play, RotateCcw } from "lucide-react";
import { Chip } from "@/components/ui";
import { themeOfPrompt } from "@/lib/interview/bank";
import { formatDay, truncate } from "@/lib/interview/text";
import type { PillarChip } from "@/lib/interview/types";
import type { Interview } from "@/lib/repo";
import type { Strategy } from "@/lib/types";

/** Server-rendered cards for the Interviews page. */

export function PositioningCard({ interview, strategy, timeZone }: { interview: Interview | null; strategy: Strategy | null; timeZone: string }) {
  const status = interview?.status === "active" ? "active" : interview?.status === "completed" || strategy?.positioning ? "done" : "none";
  return (
    <section className="glass rounded-panel p-5 sm:p-6 animate-in" aria-labelledby="positioning-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--sys-indigo)_15%,transparent)] text-sys-indigo">
          <Compass className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="positioning-title" className="t-eyebrow">
              Your positioning
            </h2>
            {status === "active" && <Chip tone="blue">In progress</Chip>}
            {status === "done" && <Chip tone="green">Done{interview?.completedAt ? ` · ${formatDay(interview.completedAt, timeZone)}` : ""}</Chip>}
            {status === "none" && <Chip tone="orange">Start here</Chip>}
          </div>
          <p className="mt-1 t-headline [overflow-wrap:anywhere]">
            {status === "done"
              ? strategy?.positioning || "Your strategy is drafted."
              : status === "active"
                ? "You're partway through. Pick up where you left off."
                : "What is your LinkedIn for? Who should read it?"}
          </p>
          <p className="mt-1 t-footnote text-label-2">
            {status === "done"
              ? "Story interviews target these pillars. Re-run it when your focus changes."
              : "10–15 minutes. We'll draft your positioning, audience and 3–4 content pillars from your answers."}
          </p>
          {status === "done" && strategy && strategy.pillars.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {strategy.pillars.map((p) => (
                <Chip key={p.id} tone={p.color}>
                  {p.name}
                </Chip>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {status === "active" && interview ? (
            <Link href={`/interviews/${interview.id}`} className="btn btn-primary">
              <Play className="size-4" />
              Resume
            </Link>
          ) : status === "done" ? (
            <>
              <Link href="/strategy" className="btn btn-glass">
                View strategy
              </Link>
              <Link href="/interviews/new?kind=positioning" className="btn btn-plain">
                <RotateCcw className="size-4" />
                Re-run
              </Link>
            </>
          ) : (
            <Link href="/interviews/new?kind=positioning&auto=1" className="btn btn-primary">
              Start positioning
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export function StoryInterviewCard({ interview, pillars, timeZone }: { interview: Interview; pillars: PillarChip[]; timeZone: string }) {
  const pillar = pillars.find((p) => p.id === interview.pillar);
  const theme = interview.promptSeed ? themeOfPrompt(interview.promptSeed) : undefined;
  const memories = interview.memoryCount ?? 0;
  const answers = Math.floor((interview.messageCount ?? 0) / 2);
  const active = interview.status === "active";
  return (
    <Link href={`/interviews/${interview.id}`} className="card card-interactive flex h-full flex-col gap-3 p-4 focus-ring">
      <div className="flex items-center justify-between gap-2 t-caption text-label-2">
        <span className="flex items-center gap-1.5">
          <BookOpen className="size-3.5" />
          {formatDay(interview.createdAt, timeZone)}
          {theme && <span aria-hidden>·</span>}
          {theme && theme.label}
        </span>
        {active && <Chip tone="blue">In progress</Chip>}
        {interview.status === "abandoned" && <Chip>Ended</Chip>}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 t-headline [overflow-wrap:anywhere]">{interview.title || "Story interview"}</h3>
        {active && interview.promptSeed && <p className="mt-1 line-clamp-2 t-footnote text-label-2">{truncate(interview.promptSeed, 160)}</p>}
        {!active && interview.summary && <p className="mt-1 line-clamp-2 t-footnote text-label-2">{interview.summary}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {pillar && <Chip tone={pillar.color}>{pillar.name}</Chip>}
        {memories > 0 ? (
          <Chip tone="green">{memories === 1 ? "1 story saved" : `${memories} stories saved`}</Chip>
        ) : (
          <span className="flex items-center gap-1 t-caption text-label-2">
            <MessageCircle className="size-3.5" />
            {answers === 0 ? "Not started" : answers === 1 ? "1 answer" : `${answers} answers`}
          </span>
        )}
        {active && <span className="ml-auto t-footnote font-semibold text-accent">Resume</span>}
      </div>
    </Link>
  );
}
