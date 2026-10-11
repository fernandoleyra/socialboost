import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Camera, CircleCheck, Clock, Eye, Lightbulb, PenLine, Plus, Send } from "lucide-react";
import type { PostStatus } from "@/lib/types";
import type { WeekDay, WeekPost } from "@/lib/dashboard";
import { toneColor } from "./tone";

type PillarInfo = { name: string; color: string };

const STATUS: Partial<Record<PostStatus, { icon: LucideIcon; label: string; tone: string }>> = {
  idea: { icon: Lightbulb, label: "Idea", tone: "gray" },
  draft: { icon: PenLine, label: "Draft", tone: "blue" },
  review: { icon: Eye, label: "In review", tone: "orange" },
  approved: { icon: CircleCheck, label: "Approved", tone: "green" },
  scheduled: { icon: Clock, label: "Scheduled", tone: "indigo" },
  published: { icon: Send, label: "Posted", tone: "teal" },
};

function PostTile({ post, pillar }: { post: WeekPost; pillar?: PillarInfo }) {
  const s = STATUS[post.status] ?? STATUS.idea!;
  const Icon = s.icon;
  return (
    <Link
      href={`/studio/${post.id}`}
      className="group block overflow-hidden rounded-inner bg-fill-4 transition-transform hover:-translate-y-0.5 focus-ring"
      title={post.hook || "Untitled post"}
    >
      {post.photoId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/photos/${post.photoId}/file?size=thumb`} alt="" loading="lazy" className="h-20 w-full object-cover" />
      ) : (
        <div
          className="flex h-20 w-full items-center justify-center gap-1.5 t-caption-2 font-semibold"
          style={{ color: "var(--sys-orange)", background: "linear-gradient(135deg, color-mix(in srgb, var(--sys-orange) 16%, transparent), color-mix(in srgb, var(--sys-pink) 10%, transparent))" }}
        >
          <Camera className="size-3.5" />
          Needs photo
        </div>
      )}
      <div className="space-y-1 p-2">
        <div className="flex items-center gap-1 t-caption-2 font-semibold" style={{ color: toneColor(s.tone) }}>
          <Icon className="size-3" />
          <span className="truncate">
            {s.label} · {post.time}
          </span>
        </div>
        <div className="t-caption line-clamp-2 text-label">{post.hook || "Untitled post"}</div>
        {pillar && (
          <div className="flex items-center gap-1 t-caption-2 text-label-2">
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: toneColor(pillar.color) }} />
            <span className="truncate">{pillar.name}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export function WeekStrip({ week, pillars }: { week: WeekDay[]; pillars: Record<string, PillarInfo> }) {
  return (
    <section className="space-y-3" aria-labelledby="week-title">
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <h2 id="week-title" className="t-title-3">
            This week
          </h2>
          <p className="t-footnote mt-0.5 text-label-2">Your next seven days. Dashed days are posting days with nothing planned.</p>
        </div>
        <Link href="/calendar" className="btn btn-plain btn-sm shrink-0">
          Calendar
        </Link>
      </div>
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-7 md:overflow-visible md:px-0">
        {week.map((d) => (
          <div key={d.key} className="card flex min-h-[176px] w-[148px] shrink-0 snap-start flex-col gap-2 p-2.5 md:w-auto">
            <div className="flex items-center justify-between px-0.5">
              <span className={`t-caption font-semibold uppercase tracking-wide ${d.isToday ? "text-accent" : "text-label-2"}`}>{d.weekday}</span>
              <span
                className={`grid size-7 place-items-center rounded-full t-subhead font-semibold tabular-nums ${d.isToday ? "bg-accent text-white" : ""}`}
                aria-label={d.isToday ? "Today" : undefined}
              >
                {d.dayNumber}
              </span>
            </div>
            {d.posts.map((p) => (
              <PostTile key={p.id} post={p} pillar={p.pillar ? pillars[p.pillar] : undefined} />
            ))}
            {d.open && (
              <Link
                href="/calendar"
                className="flex flex-1 flex-col items-center justify-center gap-1 rounded-inner border border-dashed border-separator px-2 py-4 text-center t-caption font-medium text-label-2 transition-colors hover:border-accent hover:text-accent focus-ring"
              >
                <Plus className="size-4" />
                Open slot
              </Link>
            )}
            {!d.open && d.posts.length === 0 && <div className="flex flex-1 items-center justify-center t-caption text-label-2">Rest day</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
