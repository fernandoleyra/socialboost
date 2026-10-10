import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  ArrowRight,
  AudioWaveform,
  CalendarDays,
  CalendarPlus,
  Camera,
  ChartNoAxesColumn,
  ChevronRight,
  CircleCheck,
  Compass,
  MessagesSquare,
  Mic,
  PenLine,
  WandSparkles,
} from "lucide-react";
import type { NextAction, NextActionKind } from "@/lib/dashboard";
import { toneColor, toneWell } from "./tone";

const ICONS: Record<NextActionKind, LucideIcon> = {
  due: AlarmClock,
  positioning: Compass,
  "voice-import": AudioWaveform,
  "voice-analyze": WandSparkles,
  photos: Camera,
  "resume-story": MessagesSquare,
  story: Mic,
  review: PenLine,
  schedule: CalendarPlus,
  plan: CalendarDays,
  metrics: ChartNoAxesColumn,
};

function UpNext({ action }: { action: NextAction }) {
  const Icon = ICONS[action.kind];
  return (
    <div className="glass-strong relative overflow-hidden rounded-panel p-6 sm:p-7 animate-in">
      {/* soft tinted glow behind the content */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full opacity-40 blur-3xl"
        style={{ background: toneColor(action.tone) }}
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="t-eyebrow">Up next</span>
          {action.urgent && (
            <span className="chip" style={{ ["--chip-fg" as string]: "var(--sys-red)", ["--chip-bg" as string]: "color-mix(in srgb, var(--sys-red) 13%, transparent)" }}>
              Today
            </span>
          )}
        </div>
        <div className="mt-4 flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-[16px]" style={toneWell(action.tone, 16)}>
            <Icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="t-title-2 break-words">{action.title}</h2>
            <p className="t-callout mt-1.5 max-w-xl text-label-2">{action.detail}</p>
            <Link href={action.href} className="btn btn-primary btn-lg mt-5">
              {action.cta}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function AllCaughtUp() {
  return (
    <div className="glass-strong relative overflow-hidden rounded-panel p-6 sm:p-7 animate-in">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-sys-green opacity-30 blur-3xl" />
      <div className="relative flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-[16px]" style={toneWell("green", 16)}>
          <CircleCheck className="size-6" />
        </span>
        <div>
          <div className="t-eyebrow">Up next</div>
          <h2 className="t-title-2 mt-1">You're all caught up</h2>
          <p className="t-callout mt-1.5 max-w-xl text-label-2">
            Stories are banked, drafts are reviewed and the next two weeks are planned. A short story interview now keeps next month just as easy.
          </p>
          <Link href="/interviews/new?kind=story" className="btn btn-glass mt-5">
            <Mic className="size-4" />
            Bank another story
          </Link>
        </div>
      </div>
    </div>
  );
}

export function NextActions({ actions }: { actions: NextAction[] }) {
  const [first, ...rest] = actions;
  return (
    <section aria-label="Next best actions" className="space-y-4">
      {first ? <UpNext action={first} /> : <AllCaughtUp />}
      {rest.length > 0 && (
        <div className="card list-group animate-in">
          {rest.slice(0, 6).map((a) => {
            const Icon = ICONS[a.kind];
            return (
              <Link key={a.id} href={a.href} className="list-row group transition-colors hover:bg-fill-4 focus-ring">
                <span className="grid size-9 shrink-0 place-items-center rounded-full" style={toneWell(a.tone)}>
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1 py-0.5">
                  <span className="flex items-center gap-2 t-subhead font-semibold">
                    <span className="truncate">{a.title}</span>
                    {a.urgent && <span className="size-2 shrink-0 rounded-full bg-sys-red" aria-label="Due today" />}
                  </span>
                  <span className="mt-0.5 block t-footnote text-label-2 line-clamp-2">{a.detail}</span>
                </span>
                <span className="hidden t-footnote font-semibold text-accent sm:block">{a.cta}</span>
                <ChevronRight className="size-4 shrink-0 text-label-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
