import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { formatDistanceStrict } from "date-fns";
import { Activity, AudioWaveform, CalendarDays, ChartNoAxesColumn, Compass, Image, Library, MessagesSquare, Send, Sparkles, UserRound } from "lucide-react";
import type { ActivityItem } from "./data";
import { toneWell } from "./tone";

const KINDS: { prefix: string; icon: LucideIcon; tone: string }[] = [
  { prefix: "memory", icon: Library, tone: "blue" },
  { prefix: "photo", icon: Image, tone: "orange" },
  { prefix: "interview", icon: MessagesSquare, tone: "indigo" },
  { prefix: "voice", icon: AudioWaveform, tone: "purple" },
  { prefix: "strategy", icon: Compass, tone: "indigo" },
  { prefix: "publish", icon: Send, tone: "teal" },
  { prefix: "post", icon: Sparkles, tone: "teal" },
  { prefix: "studio", icon: Sparkles, tone: "teal" },
  { prefix: "draft", icon: Sparkles, tone: "teal" },
  { prefix: "calendar", icon: CalendarDays, tone: "green" },
  { prefix: "plan", icon: CalendarDays, tone: "green" },
  { prefix: "insight", icon: ChartNoAxesColumn, tone: "pink" },
  { prefix: "metric", icon: ChartNoAxesColumn, tone: "pink" },
  { prefix: "profile", icon: UserRound, tone: "gray" },
];

function kindOf(kind: string) {
  const k = kind.toLowerCase();
  return KINDS.find((x) => k.startsWith(x.prefix)) ?? { prefix: "", icon: Activity, tone: "gray" };
}

export function ActivityList({ items, now }: { items: ActivityItem[]; now: Date }) {
  return (
    <section className="space-y-3" aria-labelledby="activity-title">
      <div className="px-1">
        <h2 id="activity-title" className="t-title-3">
          Recent activity
        </h2>
        <p className="t-footnote mt-0.5 text-label-2">What happened in your workspace lately.</p>
      </div>
      {items.length === 0 ? (
        <div className="card p-5 t-subhead text-label-2">Interviews, new stories, drafts and published posts will show up here as you go.</div>
      ) : (
        <div className="card list-group">
          {items.map((a) => {
            const k = kindOf(a.kind);
            const Icon = k.icon;
            const when = formatDistanceStrict(new Date(a.at), now, { addSuffix: true });
            const body = (
              <>
                <span className="grid size-8 shrink-0 place-items-center rounded-full" style={toneWell(k.tone)}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate t-subhead">{a.message}</span>
                <time dateTime={a.at} className="shrink-0 t-caption text-label-3">
                  {when}
                </time>
              </>
            );
            return a.href ? (
              <Link key={a.id} href={a.href} className="list-row transition-colors hover:bg-fill-4 focus-ring">
                {body}
              </Link>
            ) : (
              <div key={a.id} className="list-row">
                {body}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
